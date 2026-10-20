import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import PageHeader from '../components/PageHeader';
import Pagination from '../components/Pagination';
import { getAuditEventDetails, listAuditEvents } from '../services/auditService';
import type { AuditEvent, User } from '../types';

function AuditTrail({ user }: { user: User | null }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [retryToken, setRetryToken] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [eventDetails, setEventDetails] = useState<AuditEvent | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const requestId = useRef(0);
  const payloadRequestId = useRef(0);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await listAuditEvents(page, 20, {
          search,
          eventType: eventFilter,
          sort: sortOrder,
        });
        if (requestId.current !== currentRequest) return;
        setEvents(result.events);
        setEventTypes(result.eventTypes);
        setTotalPages(result.totalPages);
      } catch (requestError) {
        if (requestId.current === currentRequest) {
          setError(requestError instanceof Error ? requestError.message : 'Unable to load audit trail.');
        }
      } finally {
        if (requestId.current === currentRequest) setLoading(false);
      }
    };
    void load();
    return () => { requestId.current += 1; };
  }, [eventFilter, page, retryToken, search, sortOrder]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const openEventDetails = async (event: AuditEvent) => {
    const id = String(event._id ?? event.id ?? '');
    if (!id) return;
    const currentRequest = ++payloadRequestId.current;
    setSelectedEvent(event);
    setEventDetails(null);
    setDetailsError(null);
    setDetailsLoading(true);
    try {
      const details = await getAuditEventDetails(id);
      if (payloadRequestId.current === currentRequest) setEventDetails(details);
    } catch (requestError) {
      if (payloadRequestId.current === currentRequest) {
        setDetailsError(requestError instanceof Error ? requestError.message : 'Unable to load event details.');
      }
    } finally {
      if (payloadRequestId.current === currentRequest) setDetailsLoading(false);
    }
  };

  const closeEventDetails = () => {
    payloadRequestId.current += 1;
    setSelectedEvent(null);
    setEventDetails(null);
    setDetailsLoading(false);
    setDetailsError(null);
  };

  return (
    <section className="page-panel">
      <PageHeader
        eyebrow="Traceability"
        title="Event History"
        description="Review recorded system events and shipment activity."
        meta={<span className="page-tag">{user ? `Signed in as ${user.name}` : 'Authenticated access'}</span>}
      />

      <article className="panel-card">
        <form className="toolbar toolbar--stacked" onSubmit={handleSearch} role="search">
          <label className="audit-search-field">
            <span>Search events and entities</span>
            <input
              type="search"
              value={searchInput}
              maxLength={100}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search event, entity type, or ID"
            />
          </label>
          <label>
            <span>Event type</span>
            <select value={eventFilter} onChange={(event) => { setEventFilter(event.target.value); setPage(1); }}>
              <option value="all">All events</option>
              {eventTypes.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Sort order</span>
            <select value={sortOrder} onChange={(event) => { setSortOrder(event.target.value as 'newest' | 'oldest'); setPage(1); }}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          <button className="button button--primary" type="submit">Search</button>
        </form>

        {error ? <>
          <ErrorState message={error} />
          <button type="button" className="button button--ghost" onClick={() => setRetryToken((value) => value + 1)}>Retry loading events</button>
        </> : null}
        {!error && loading ? <LoadingState message="Loading audit events..." /> : null}
        {!error && !loading ? <>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          {events.length === 0 ? (
            <EmptyState title="No matching audit records" description="Try another search or event filter." />
          ) : (
            <div className="table-wrap">
              <table className="audit-table">
                <thead><tr><th>Timestamp</th><th>Event</th><th>Actor</th><th>Aggregate</th><th>Details</th></tr></thead>
                <tbody>
                  {events.map((event) => {
                    const actorName = typeof event.performedBy === 'object' && event.performedBy ? event.performedBy.name : 'System';
                    const eventTime = event.timestamp ?? event.createdAt;
                    const eventKey = String(event._id ?? event.id ?? `${event.entityId}-${event.eventType}-${event.timestamp ?? event.createdAt}`);
                    return (
                      <tr key={eventKey}>
                        <td className="timestamp-cell"><time>{eventTime ? new Date(eventTime).toLocaleString() : 'N/A'}</time></td>
                        <td><code className="event-cell">{event.eventType}</code></td>
                        <td>{actorName}</td>
                        <td><div className="aggregate-cell"><strong>{event.entityType}</strong><code>{event.entityId}</code></div></td>
                        <td>
                          <button type="button" className="button button--ghost audit-details-button" onClick={() => void openEventDetails(event)}>
                            View details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </> : null}
      </article>

      {selectedEvent ? (() => {
        const detail = eventDetails ?? selectedEvent;
        const actor = typeof detail.performedBy === 'object' && detail.performedBy
          ? detail.performedBy.name
          : typeof detail.performedBy === 'string' ? detail.performedBy : null;
        const version = (detail as AuditEvent & { version?: number }).version;
        const eventTime = detail.timestamp ?? detail.createdAt;
        return (
          <div className="inventory-modal-backdrop audit-details-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEventDetails(); }}>
            <section className="inventory-modal crud-modal audit-details-modal" role="dialog" aria-modal="true" aria-labelledby="audit-details-title">
              <div className="panel-card__header crud-modal__header">
                <div>
                  <p className="eyebrow">Forensic record</p>
                  <h3 id="audit-details-title">Event details</h3>
                  <span className="event-details-type">{detail.eventType}</span>
                </div>
                <button type="button" className="modal-close-button" aria-label="Close event details" onClick={closeEventDetails}>×</button>
              </div>

              <section className="audit-event-metadata" aria-label="Event metadata">
                <div><span>Event ID</span><code>{detail._id ?? detail.id ?? 'Not available'}</code></div>
                <div><span>Timestamp</span><strong>{eventTime ? new Date(eventTime).toLocaleString() : 'Not available'}</strong></div>
                <div><span>Actor</span><strong>{actor ?? 'System'}</strong></div>
                <div><span>Aggregate</span><strong>{detail.entityType} · <code>{detail.entityId}</code></strong></div>
                {version !== undefined ? <div><span>Version</span><strong>{version}</strong></div> : null}
              </section>

              <section className="audit-event-payload" aria-labelledby="audit-payload-title">
                <div className="panel-card__header">
                  <div><p className="eyebrow">Recorded event data</p><h4 id="audit-payload-title">Payload</h4></div>
                  <span className="page-tag">JSON</span>
                </div>
                {detailsLoading ? <LoadingState message="Loading event payload..." /> : detailsError ? <p className="text-danger" role="alert">{detailsError}</p> : (
                  <div className="audit-payload__viewer" tabIndex={0} aria-label="Scrollable event payload">
                    <pre>{JSON.stringify(eventDetails?.payload ?? selectedEvent.payload ?? {}, null, 2)}</pre>
                  </div>
                )}
              </section>

              <div className="action-row crud-modal__footer">
                <button type="button" className="button button--ghost" onClick={closeEventDetails}>Done</button>
              </div>
            </section>
          </div>
        );
      })() : null}
    </section>
  );
}

export default AuditTrail;
