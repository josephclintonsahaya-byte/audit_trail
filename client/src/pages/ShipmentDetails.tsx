import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import StatusBadge from '../components/StatusBadge';
import { hasPermission } from '../permissions';
import { ApiError } from '../services/api';
import {
  listShipments,
  getCurrentShipmentState,
  getShipmentById,
  getShipmentEvents,
  recordShipmentTemperature,
  reconstructShipment,
} from '../services/shipmentService';
import type {
  Shipment,
  ShipmentDomainEvent,
  ShipmentReconstruction,
  User,
} from '../types';
import { formatTimestamp } from '../utils/formatTimestamp';

type TemperatureReading = {
  version: number;
  timestamp: string;
  temperatureC: number;
};

const eventLabels: Record<string, string> = {
  SHIPMENT_CREATED: 'Shipment created',
  SHIPMENT_IMPORTED: 'Shipment imported',
  SHIPMENT_UPDATED: 'Shipment details updated',
  SHIPMENT_DISPATCHED: 'Shipment dispatched',
  SHIPMENT_DELIVERED: 'Shipment delivered',
  SHIPMENT_CANCELLED: 'Shipment cancelled',
  SHIPMENT_DELETED: 'Shipment deleted',
  SHIPMENT_TEMPERATURE_RECORDED: 'Temperature recorded',
};

const formatEventType = (eventType: string): string =>
  eventLabels[eventType] ??
  eventType
    .replace(/^SHIPMENT_/, '')
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');

const getPayloadText = (
  payload: Record<string, unknown>,
  ...fields: string[]
): string | null => {
  for (const field of fields) {
    const value = payload[field];
    if (typeof value === 'string' && value.trim()) return value;
    if (
      typeof value === 'object' &&
      value !== null &&
      'name' in value &&
      typeof value.name === 'string'
    ) {
      return value.name;
    }
  }
  return null;
};

const getEventLocation = (event: ShipmentDomainEvent): string | null =>
  getPayloadText(
    event.payload,
    'location',
    'currentLocation',
    'locationName',
    'warehouseName',
  );

const getEventSummary = (event: ShipmentDomainEvent): string => {
  const temperature = event.payload.temperatureC;
  if (
    event.eventType === 'SHIPMENT_TEMPERATURE_RECORDED' &&
    typeof temperature === 'number' &&
    Number.isFinite(temperature)
  ) {
    return `Recorded sensor reading: ${temperature} °C`;
  }

  const items = event.payload.items;
  if (Array.isArray(items)) {
    return `${items.length} item type${items.length === 1 ? '' : 's'} in shipment`;
  }

  const status = event.payload.status;
  if (typeof status === 'string') {
    return `Shipment status: ${status.replaceAll('_', ' ').toLowerCase()}`;
  }

  return formatEventType(event.eventType);
};

function ShipmentDetails({ user }: { user: User | null }) {
  const { id } = useParams();

  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [events, setEvents] = useState<ShipmentDomainEvent[]>([]);
  const [currentState, setCurrentState] =
    useState<ShipmentReconstruction | null>(null);
  const [historicalState, setHistoricalState] =
    useState<ShipmentReconstruction | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [currentStateError, setCurrentStateError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [asOfTime, setAsOfTime] = useState('');
  const [asOfTimeError, setAsOfTimeError] = useState<string | null>(null);
  const [temperatureInput, setTemperatureInput] = useState('');
  const [temperatureError, setTemperatureError] = useState<string | null>(null);
  const [recordingTemperature, setRecordingTemperature] = useState(false);
  const historyRequest = useRef(0);

  const loadShipment = useCallback(async () => {
    let effectiveId = id;

    if (!effectiveId) {
      try {
        const shipments = await listShipments();
        if (shipments.length > 0) {
          effectiveId = shipments[0]._id ?? shipments[0].id ?? shipments[0].shipmentNumber;
        } else {
          setError('No shipments available.');
          setLoading(false);
          return;
        }
      } catch (listError) {
        setError(
          listError instanceof Error
            ? listError.message
            : 'Unable to load shipments.',
        );
        setLoading(false);
        return;
      }
    }

    try {
      setLoading(true);
      const shipmentResponse = await getShipmentById(effectiveId);
      setShipment(shipmentResponse);
      setError(null);

      const [eventResult, currentStateResult] = await Promise.allSettled([
        getShipmentEvents(effectiveId),
        getCurrentShipmentState(effectiveId),
      ]);
      const orderedEvents =
        eventResult.status === 'fulfilled'
          ? [...eventResult.value].sort(
              (left, right) => left.version - right.version,
            )
          : [];
      const latestEvent = orderedEvents.at(-1);

      setEvents(orderedEvents);
      setEventsError(
        eventResult.status === 'rejected' &&
          !(eventResult.reason instanceof ApiError &&
            eventResult.reason.status === 404)
          ? eventResult.reason instanceof Error
            ? eventResult.reason.message
            : 'Unable to load shipment events.'
          : null,
      );

      const current =
        currentStateResult.status === 'fulfilled'
          ? currentStateResult.value
          : null;
      setCurrentState(current);
      setCurrentStateError(
        currentStateResult.status === 'rejected' &&
          !(currentStateResult.reason instanceof ApiError &&
            currentStateResult.reason.status === 404)
          ? currentStateResult.reason instanceof Error
            ? currentStateResult.reason.message
            : 'Unable to load the current shipment read model.'
          : null,
      );
      setHistoryError(null);

      if (latestEvent) {
        setSelectedVersion(latestEvent.version);
        setSelectedEventId(latestEvent.id);
        if (current?.version === latestEvent.version) {
          setHistoricalState(current);
        } else {
          try {
            setHistoricalState(
              await reconstructShipment(effectiveId, latestEvent.version),
            );
          } catch (historyRequestError) {
            setHistoricalState(null);
            setHistoryError(
              historyRequestError instanceof Error
                ? historyRequestError.message
                : 'Unable to reconstruct the latest shipment state.',
            );
          }
        }
      } else {
        setHistoricalState(null);
        setSelectedVersion(null);
        setSelectedEventId(null);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load shipment details.',
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadShipment();
  }, [loadShipment]);

  const createdBy = useMemo(() => {
    if (typeof shipment?.createdBy === 'object' && shipment.createdBy) {
      return shipment.createdBy.name ?? 'Unknown';
    }
    return typeof shipment?.createdBy === 'string'
      ? shipment.createdBy
      : user?.name ?? 'Not available';
  }, [shipment, user]);

  const temperatureReadings = useMemo<TemperatureReading[]>(
    () =>
      events.flatMap((event) => {
        const temperatureC = event.payload.temperatureC;

        return event.eventType === 'SHIPMENT_TEMPERATURE_RECORDED' &&
          typeof temperatureC === 'number' &&
          Number.isFinite(temperatureC)
          ? [
              {
                version: event.version,
                timestamp: event.timestamp,
                temperatureC,
              },
            ]
          : [];
      }),
    [events],
  );

  const visibleTemperatureReadings = useMemo(
    () =>
      selectedVersion === null
        ? temperatureReadings
        : temperatureReadings.filter(
            (reading) => reading.version <= selectedVersion,
          ),
    [temperatureReadings, selectedVersion],
  );

  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ??
    events.find((event) => event.version === selectedVersion);
  const latestEvent = events.at(-1);
  const currentVersion = latestEvent?.version ?? currentState?.version ?? shipment?.version ?? 0;
  const currentStatus = currentState?.state?.status ?? shipment?.status ?? 'Not available';
  const currentLocation = latestEvent ? getEventLocation(latestEvent) : null;
  const destination =
    typeof shipment?.destinationWarehouseId === 'object'
      ? shipment.destinationWarehouseId.name
      : 'Not available';
  const origin =
    typeof shipment?.sourceWarehouseId === 'object'
      ? shipment.sourceWarehouseId.name
      : 'Not available';

  const canRecordTemperature = hasPermission(user, 'shipment:record-temperature');

  const handleVersionChange = async (version: number) => {
    if (!id) return;
    const event = events.find((item) => item.version === version);
    if (!event) {
      setHistoryError(`Version ${version} is not available in this event stream.`);
      return;
    }
    const requestId = historyRequest.current + 1;
    historyRequest.current = requestId;
    setSelectedVersion(version);
    setSelectedEventId(event.id);
    setHistoricalState(null);
    setHistoryLoading(true);
    setHistoryError(null);
    setAsOfTimeError(null);

    try {
      const reconstruction = await reconstructShipment(id, version);
      if (requestId === historyRequest.current) {
        setHistoricalState(reconstruction);
      }
    } catch (requestError) {
      if (requestId === historyRequest.current) {
        setHistoryError(
          requestError instanceof ApiError && requestError.status === 404
            ? `Version ${version} could not be reconstructed because it is no longer available.`
            : requestError instanceof Error
              ? requestError.message
              : 'Unable to reconstruct shipment history.',
        );
      }
    } finally {
      if (requestId === historyRequest.current) setHistoryLoading(false);
    }
  };

  const handleAsOfTimeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id) return;
    const targetTimestamp = new Date(asOfTime).getTime();
    if (!asOfTime || Number.isNaN(targetTimestamp)) {
      setAsOfTimeError('Choose a valid date and time.');
      return;
    }

    const requestId = historyRequest.current + 1;
    historyRequest.current = requestId;
    setAsOfTimeError(null);
    setHistoryError(null);
    setHistoryLoading(true);
    setHistoricalState(null);
    try {
      const reconstruction = await reconstructShipment(id, undefined, new Date(targetTimestamp).toISOString());
      if (requestId !== historyRequest.current) return;
      const event = events.find((item) => item.version === reconstruction.version);
      setSelectedVersion(reconstruction.version);
      setSelectedEventId(event?.id ?? null);
      setHistoricalState(reconstruction);
    } catch (requestError) {
      if (requestId === historyRequest.current) {
        setHistoryError(requestError instanceof ApiError && requestError.status === 404
          ? 'No shipment history was available at that time.'
          : requestError instanceof Error ? requestError.message : 'Unable to reconstruct shipment history at that time.');
      }
    } finally {
      if (requestId === historyRequest.current) setHistoryLoading(false);
    }
  };

  const handleRecordTemperature = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const temperatureC = Number(temperatureInput);
    const expectedVersion = events.at(-1)?.version;

    if (!Number.isFinite(temperatureC) || temperatureInput.trim() === '') {
      setTemperatureError('Enter a valid temperature in degrees Celsius.');
      return;
    }

    if (!id || expectedVersion === undefined) {
      setTemperatureError('The current shipment event version is unavailable.');
      return;
    }

    setRecordingTemperature(true);
    setTemperatureError(null);

    try {
      await recordShipmentTemperature(id, expectedVersion, temperatureC);
      setTemperatureInput('');
      await loadShipment();
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === 'CONCURRENCY_CONFLICT') {
        const loadedVersion = requestError.details?.expectedVersion ?? expectedVersion;
        const serverVersion = requestError.details?.currentVersion ?? 'unknown';
        setTemperatureError(
          `Concurrency Conflict. This shipment was modified by another operation. Loaded version: ${loadedVersion}. Current version: ${serverVersion}. Refresh the shipment before retrying.`,
        );
      } else {
        setTemperatureError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to record temperature.',
        );
      }
    } finally {
      setRecordingTemperature(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading shipment details..." />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!shipment) {
    return <ErrorState message="Shipment was not found." />;
  }

  const selectedIndex = events.findIndex(
    (event) => event.version === selectedVersion,
  );
  const currentTimestamp =
    latestEvent?.timestamp ?? shipment.updatedAt ?? shipment.createdAt;
  const historical = historicalState?.state;
  const historicalDestinationId = historical?.destinationWarehouseId;
  const selectedLocation = selectedEvent ? getEventLocation(selectedEvent) : null;

  return (
    <section className="page-panel">
      <div className="page-header page-header--split">
        <div>
          <p className="eyebrow">Shipment Forensics</p>
          <h2>{shipment.shipmentNumber}</h2>
          <p className="page-description">
            Inspect shipment history, state transitions, and recorded events.
          </p>
          <code className="shipment-details__id">{id}</code>
        </div>

        <div className="page-header__actions">
          <StatusBadge status={shipment.status} />
          <span className="page-tag">Version {currentVersion}</span>
          <Link className="button button--ghost" to="/shipments">
            Back to shipments
          </Link>
        </div>
      </div>

      <section className="forensics-current" aria-labelledby="current-state-title">
        <div className="forensics-section-heading">
          <div>
            <p className="eyebrow">Live read model</p>
            <h3 id="current-state-title">Current shipment state</h3>
          </div>
          <span className="page-tag">Version {currentVersion}</span>
        </div>
        <div className="forensics-summary-grid">
          <article className="forensics-summary-card">
            <span>Status</span>
            <StatusBadge status={currentStatus} />
          </article>
          <article className="forensics-summary-card">
            <span>Current location</span>
            <strong>{currentLocation ?? 'Not recorded'}</strong>
          </article>
          <article className="forensics-summary-card">
            <span>Destination</span>
            <strong>{destination}</strong>
          </article>
          <article className="forensics-summary-card">
            <span>Last updated</span>
            <strong>{formatTimestamp(currentTimestamp)}</strong>
          </article>
        </div>
        <div className="forensics-shipment-meta">
          <span>Created by <strong>{createdBy}</strong></span>
          <span>Origin <strong>{origin}</strong></span>
          <span>Created <strong>{formatTimestamp(shipment.createdAt)}</strong></span>
          <span>{shipment.items.length} item type{shipment.items.length === 1 ? '' : 's'}</span>
          <span className="forensics-shipment-meta__id">Shipment ID <code>{id}</code></span>
        </div>
        {currentStateError ? (
          <p className="forensics-fallback-notice" role="status">
            Current read model unavailable; showing the latest shipment snapshot instead. {currentStateError}
          </p>
        ) : null}
      </section>

      <article className="info-card forensics-items">
        <div className="panel-card__header">
          <div>
            <p className="eyebrow">Shipment contents</p>
            <h3>Item manifest</h3>
          </div>
          <span className="page-tag">
            {shipment.items.length} item type{shipment.items.length === 1 ? '' : 's'}
          </span>
        </div>
        {shipment.items.length === 0 ? (
          <EmptyState
            title="No items attached"
            description="This shipment does not contain an item manifest."
          />
        ) : (
          <ul className="item-list">
            {shipment.items.map((item, index) => {
              const productName =
                typeof item.productId === 'object' && item.productId
                  ? item.productId.name
                  : 'Product';
              const productSku =
                typeof item.productId === 'object' && item.productId
                  ? item.productId.sku
                  : null;
              return (
                <li key={`${productName}-${index}`}>
                  <span>
                    <strong>{productName}</strong>
                    {productSku ? <small>{productSku}</small> : null}
                  </span>
                  <strong>{item.quantity} units</strong>
                </li>
              );
            })}
          </ul>
        )}
      </article>

      <article className="page-panel page-panel--sub shipment-events">
        <div className="forensics-investigation-grid">
          <div className="event-timeline-column">
        <div className="panel-card__header">
          <div>
            <p className="eyebrow">Immutable event record</p>
            <h3>Event timeline</h3>
            <p className="section-description">Select an event to inspect its recorded data.</p>
          </div>
          <span className="page-tag">
            {events.length} event{events.length === 1 ? '' : 's'}
          </span>
        </div>

        {eventsError ? (
          <ErrorState message={eventsError} />
        ) : events.length === 0 ? (
          <EmptyState
            title="No event history available"
            description="This shipment has no event stream to reconstruct yet."
          />
        ) : (
          <div className="timeline">
            {events.map((event) => {
              const eventLocation = getEventLocation(event);
              const isSelected = event.id === selectedEvent?.id;
              return (
                <div
                  key={event.id}
                  className={`timeline-item${isSelected ? ' timeline-item--selected' : ''}`}
                >
                  <div className="timeline-dot" aria-hidden="true" />
                  <button
                    type="button"
                    className="timeline-item__content timeline-item__select"
                    aria-pressed={isSelected}
                    onClick={() => void handleVersionChange(event.version)}
                  >
                    <span className="timeline-header">
                      <strong>{formatEventType(event.eventType)}</strong>
                      <span className={`event-category event-category--${event.eventType.toLowerCase().replaceAll('_', '-')}`}>
                        {event.eventType.replace(/^SHIPMENT_/, '').replaceAll('_', ' ')}
                      </span>
                    </span>
                    <span className="timeline-event-meta">
                      <span>Version {event.version}</span>
                      <time dateTime={event.timestamp}>{formatTimestamp(event.timestamp)}</time>
                    </span>
                    <span className="timeline-summary">{getEventSummary(event)}</span>
                    {event.performedBy ? (
                      <span className="timeline-actor">Actor ID · {event.performedBy}</span>
                    ) : null}
                    {eventLocation ? (
                      <span className="timeline-location">{eventLocation}</span>
                    ) : null}
                    {event.version === currentVersion ? (
                      <span className="timeline-current">Current version</span>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        )}
          </div>

        {selectedEvent ? (
          <section className="event-inspector" aria-labelledby="event-inspector-title">
            <div className="forensics-section-heading">
              <div>
                <p className="eyebrow">Selected event</p>
                <h3 id="event-inspector-title">{formatEventType(selectedEvent.eventType)}</h3>
              </div>
              <span className="page-tag">Version {selectedEvent.version}</span>
            </div>
            <dl className="event-inspector__fields">
              <div><dt>Event ID</dt><dd><code>{selectedEvent.id}</code></dd></div>
              <div><dt>Aggregate ID</dt><dd><code>{selectedEvent.aggregateId}</code></dd></div>
              <div><dt>Event type</dt><dd>{selectedEvent.eventType}</dd></div>
              <div><dt>Version</dt><dd>{selectedEvent.version}</dd></div>
              <div><dt>Timestamp</dt><dd>{formatTimestamp(selectedEvent.timestamp)}</dd></div>
              <div><dt>Actor ID</dt><dd><code>{selectedEvent.performedBy || 'Not available'}</code></dd></div>
              <div><dt>Location</dt><dd>{selectedLocation ?? 'Not recorded'}</dd></div>
              <div><dt>Correlation ID</dt><dd><code>{selectedEvent.metadata?.correlationId ?? 'Not available'}</code></dd></div>
            </dl>
            <details className="event-inspector__payload">
              <summary>Recorded payload (technical details)</summary>
              <pre>{JSON.stringify(selectedEvent.payload, null, 2)}</pre>
            </details>
          </section>
        ) : (
          <section className="event-inspector event-inspector--empty" aria-live="polite">
            <p className="eyebrow">Selected event</p>
            <p className="empty-inline">Select a timeline entry to inspect its recorded details.</p>
          </section>
        )}
        </div>
      </article>

      <article className="page-panel page-panel--sub shipment-history">
        <div className="panel-card__header">
          <div>
            <p className="eyebrow">Event Sourcing</p>
            <h3>Historical State</h3>
            <p className="section-description">
              Reconstruct shipment state from the recorded event stream by selecting a version.
            </p>
          </div>

          {selectedEvent ? (
            <span className="page-tag">Viewing Version {selectedEvent.version}</span>
          ) : null}
        </div>

        {events.length === 0 ? (
          <p className="empty-inline">Historical reconstruction is unavailable without shipment events.</p>
        ) : (
          <>
            <label className="history-scrubber">
              <span>
                Select version
                {selectedEvent
                  ? ` · ${new Date(selectedEvent.timestamp).toLocaleString()}`
                  : ''}
              </span>

              <input
                type="range"
                min={0}
                max={events.length - 1}
                step={1}
                value={Math.max(selectedIndex, 0)}
                disabled={historyLoading || events.length < 2}
                onChange={(changeEvent) => {
                  const event = events[Number(changeEvent.target.value)];
                  if (event) void handleVersionChange(event.version);
                }}
                aria-label="Shipment history version"
              />

              <div className="version-selector" aria-label="Shipment event versions">
                {events.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className={`version-selector__button${event.version === selectedVersion ? ' is-selected' : ''}${event.version === currentVersion ? ' is-current' : ''}`}
                    aria-label={`Show historical state at version ${event.version}${event.version === currentVersion ? ', current version' : ''}`}
                    aria-current={event.version === selectedVersion ? 'step' : undefined}
                    disabled={historyLoading}
                    onClick={() => void handleVersionChange(event.version)}
                  >
                    {event.version}
                  </button>
                ))}
              </div>

              <span className="history-scrubber__range">
                <span>Version {events[0].version}</span>
                <span>Current · v{currentVersion}</span>
              </span>
            </label>

            <form className="forensics-time-form" onSubmit={handleAsOfTimeSubmit}>
              <label htmlFor="shipment-as-of-time">
                <span>Reconstruct as of time</span>
                <input
                  id="shipment-as-of-time"
                  type="datetime-local"
                  value={asOfTime}
                  onChange={(changeEvent) => setAsOfTime(changeEvent.target.value)}
                  disabled={historyLoading}
                />
              </label>
              <button type="submit" className="button button--ghost" disabled={historyLoading || !asOfTime}>
                Load historical state
              </button>
            </form>
            {asOfTimeError ? (
              <p className="text-danger" role="alert">{asOfTimeError}</p>
            ) : null}

            {historyError ? (
              <p className="text-danger" role="alert">{historyError}</p>
            ) : null}

            {historyLoading ? (
              <div className="historical-state__loading">
                <LoadingState message={`Reconstructing version ${selectedVersion}...`} />
              </div>
            ) : null}

            {historical && !historyLoading ? (
              <section className="historical-state" aria-live="polite" aria-labelledby="historical-state-title">
                <div className="forensics-section-heading">
                  <div>
                    <p className="eyebrow">Historical State</p>
                    <h3 id="historical-state-title">Shipment state at version {historicalState.version}</h3>
                  </div>
                  {historicalState.version === currentVersion ? (
                    <span className="page-tag">Matches current state</span>
                  ) : (
                    <span className="historical-state__label">Historical snapshot · not current</span>
                  )}
                </div>
                <div className="forensics-summary-grid forensics-summary-grid--historical">
                  <article className="forensics-summary-card">
                    <span>Status</span>
                    <StatusBadge status={historical.status} />
                  </article>
                  <article className="forensics-summary-card">
                    <span>Location</span>
                    <strong>{selectedLocation ?? 'Not recorded'}</strong>
                  </article>
                  <article className="forensics-summary-card">
                    <span>Destination ID</span>
                    <strong className="forensics-long-value">{historicalDestinationId}</strong>
                  </article>
                  <article className="forensics-summary-card">
                    <span>Items</span>
                    <strong>{historical.items.length} item type{historical.items.length === 1 ? '' : 's'}</strong>
                  </article>
                </div>
                <p className="historical-state__caption">
                  Reconstructed from {historicalState.eventCount} recorded event{historicalState.eventCount === 1 ? '' : 's'} through version {historicalState.version}. Requested time: {formatTimestamp(historicalState.asOf ?? selectedEvent?.timestamp)}.
                </p>
              </section>
            ) : null}
          </>
        )}
      </article>

      <article className="page-panel page-panel--sub shipment-telemetry">
        <div className="panel-card__header">
          <div>
            <p className="eyebrow">Shipment telemetry</p>
            <h3>Temperature history</h3>
            <p className="section-description">
              Persisted sensor readings recorded against shipment events.
            </p>
          </div>

          <span className="page-tag">
            {visibleTemperatureReadings.length} reading
            {visibleTemperatureReadings.length === 1 ? '' : 's'}
          </span>
        </div>

        {visibleTemperatureReadings.length === 0 ? (
          <p className="empty-inline">
            No temperature readings are available up to this version.
          </p>
        ) : (
          <div
            className="temperature-chart"
            role="img"
            aria-label="Shipment temperature readings by event version"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={visibleTemperatureReadings}
                margin={{ top: 10, right: 20, bottom: 5, left: 0 }}
              >
                <CartesianGrid stroke="#dce4eb" strokeDasharray="3 3" />
                <XAxis
                  dataKey="version"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(version: number) => `v${version}`}
                  tick={{ fill: '#617286', fontSize: 11 }}
                  axisLine={{ stroke: '#c8d3de' }}
                  tickLine={{ stroke: '#c8d3de' }}
                  label={{
                    value: 'Event version',
                    position: 'insideBottom',
                    offset: -2,
                  }}
                />
                <YAxis
                  dataKey="temperatureC"
                  unit="°C"
                  width={60}
                  domain={['auto', 'auto']}
                  tick={{ fill: '#617286', fontSize: 11 }}
                  axisLine={{ stroke: '#c8d3de' }}
                  tickLine={{ stroke: '#c8d3de' }}
                />
                <Tooltip
                  labelFormatter={(version) => `Event version ${version}`}
                  formatter={(value) => [`${value} °C`, 'Temperature']}
                  contentStyle={{
                    borderColor: '#dce4eb',
                    borderRadius: '7px',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="temperatureC"
                  name="Temperature"
                  stroke="#245f91"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {canRecordTemperature && shipment.status === 'IN_TRANSIT' ? (
          <form className="temperature-form" onSubmit={handleRecordTemperature}>
            <label>
              <span>Record a temperature reading (°C)</span>
              <input
                type="number"
                step="any"
                value={temperatureInput}
                onChange={(changeEvent) =>
                  setTemperatureInput(changeEvent.target.value)
                }
                placeholder="e.g. 4.5"
                required
              />
            </label>

            <button
              className="button button--primary"
              type="submit"
              disabled={recordingTemperature}
            >
              {recordingTemperature ? 'Recording…' : 'Record reading'}
            </button>

            {temperatureError ? (
              <p className="text-danger" role="alert">{temperatureError}</p>
            ) : null}
          </form>
        ) : null}
      </article>
    </section>
  );
}

export default ShipmentDetails;
