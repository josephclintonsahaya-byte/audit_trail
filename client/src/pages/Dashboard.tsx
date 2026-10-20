import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import { hasPermission } from '../permissions';
import { listAuditEvents } from '../services/auditService';
import { listInventory } from '../services/inventoryService';
import { listShipments } from '../services/shipmentService';
import type { AuditEvent, InventoryItem, Shipment, User } from '../types';

function Dashboard({ user }: { user: User | null }) {
  const canCreateShipment = hasPermission(user, 'shipment:create');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shipmentError, setShipmentError] = useState<string | null>(null);
  const [shipmentSearch, setShipmentSearch] = useState('');

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        const shipmentRequest = listShipments().then(
          (response) => ({ shipments: response }),
          (requestError: unknown) => ({
            shipmentError: requestError instanceof Error ? requestError.message : 'Unable to load shipments.',
          }),
        );
        const [[inventoryResponse, eventResponse], shipmentResult] = await Promise.all([
          Promise.all([listInventory(), listAuditEvents()]),
          shipmentRequest,
        ]);

        setInventory(inventoryResponse);
        setEvents(eventResponse.events);
        if ('shipments' in shipmentResult) {
          setShipments(shipmentResult.shipments);
          setShipmentError(null);
        } else {
          setShipments([]);
          setShipmentError(shipmentResult.shipmentError);
        }
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, []);

  const totalInventoryUnits = useMemo(
    () => inventory.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
    [inventory],
  );

  const lowStockItems = useMemo(
    () => inventory.filter((item) => Number(item.quantity ?? 0) < 10),
    [inventory],
  );

  const activeShipments = useMemo(
    () => shipments.filter((shipment) => shipment.status !== 'DELIVERED' && shipment.status !== 'CANCELLED').length,
    [shipments],
  );
  const deliveredShipments = useMemo(
    () => shipments.filter((shipment) => shipment.status === 'DELIVERED').length,
    [shipments],
  );
  const statusBreakdown = useMemo(() => {
    const statuses = [
      { status: 'CREATED', label: 'Created', color: 'var(--text-soft)' },
      { status: 'IN_TRANSIT', label: 'In transit', color: 'var(--primary)' },
      { status: 'DELIVERED', label: 'Delivered', color: 'var(--success)' },
      { status: 'CANCELLED', label: 'Cancelled', color: 'var(--danger)' },
    ];
    return statuses.map((entry) => ({
      ...entry,
      count: shipments.filter((shipment) => shipment.status === entry.status).length,
    }));
  }, [shipments]);
  const statusChartData = useMemo(
    () => statusBreakdown.filter((entry) => entry.count > 0),
    [statusBreakdown],
  );
  const shipmentActivity = useMemo(() => {
    const byDate = new Map<string, { label: string; count: number; sortKey: number }>();
    shipments.forEach((shipment) => {
      if (!shipment.createdAt) return;
      const date = new Date(shipment.createdAt);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const current = byDate.get(key) ?? {
        label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        count: 0,
        sortKey: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
      };
      current.count += 1;
      byDate.set(key, current);
    });
    return [...byDate.values()].sort((left, right) => left.sortKey - right.sortKey).slice(-7);
  }, [shipments]);
  const recentShipments = useMemo(() => {
    const query = shipmentSearch.trim().toLowerCase();
    return [...shipments]
      .filter((shipment) => {
        if (!query) return true;
        const id = shipment._id ?? shipment.id ?? '';
        return shipment.shipmentNumber.toLowerCase().includes(query) ||
          id.toLowerCase().includes(query);
      })
      .sort((left, right) => Number(new Date(right.createdAt ?? 0)) - Number(new Date(left.createdAt ?? 0)))
      .slice(0, 5);
  }, [shipmentSearch, shipments]);

  const recentEvents = useMemo(
    () => events.slice(0, 5),
    [events],
  );
  const trackedProductCount = useMemo(() => new Set(inventory.map((item) => (
    typeof item.productId === 'object' && item.productId
      ? item.productId._id ?? item.productId.id
      : item.productId
  )).filter(Boolean)).size, [inventory]);
  const warehouseCount = useMemo(() => new Set(inventory.map((item) => (
    typeof item.warehouseId === 'object' && item.warehouseId
      ? item.warehouseId._id ?? item.warehouseId.id
      : item.warehouseId
  )).filter(Boolean)).size, [inventory]);
  const dashboardInventory = useMemo(
    () => [...inventory]
      .sort((left, right) => Number(new Date(right.updatedAt ?? right.createdAt ?? 0)) - Number(new Date(left.updatedAt ?? left.createdAt ?? 0)))
      .slice(0, 6),
    [inventory],
  );

  if (loading) {
    return <LoadingState message="Loading dashboard data..." />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  return (
    <section className="page-panel">
      <PageHeader
        eyebrow="Operations"
        title="Dashboard"
        description="Monitor shipment activity, inventory health, and recent audit events."
      />

      <div className="stats-grid dashboard-metrics">
        <StatCard title="Active Shipments" value={activeShipments} detail="In transit or pending" tone="warning" />
        <StatCard title="Delivered Shipments" value={deliveredShipments} detail="Successfully completed" tone="success" />
        <StatCard title="Inventory Units" value={totalInventoryUnits} detail="Total units on hand" tone="primary" />
        <StatCard title="Low Stock Records" value={lowStockItems.length} detail="Below 10 units" tone="neutral" />
      </div>

      <div className="dashboard-grid dashboard-insights">
        <article className="panel-card dashboard-volume">
          <div className="panel-card__header">
            <div>
              <p className="eyebrow">Shipment flow</p>
              <h3>Shipment Flow</h3>
            </div>
            <span className="page-tag">By recorded date</span>
          </div>
          {shipmentActivity.length === 0 ? (
            <EmptyState title="No shipment dates available" description="Recorded shipment creation dates will appear here." />
          ) : (
            <div className="shipment-activity-chart" role="img" aria-label="Shipment creation counts by recorded date">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={shipmentActivity} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border-strong)' }} tick={{ fill: 'var(--text-soft)', fontSize: 11 }} />
                  <YAxis allowDecimals={false} width={34} tickLine={false} axisLine={false} tick={{ fill: 'var(--text-soft)', fontSize: 11 }} />
                  <Tooltip cursor={{ fill: 'var(--surface-raised)' }} contentStyle={{ border: '1px solid var(--border)', borderRadius: 7, fontSize: 12 }} />
                  <Bar dataKey="count" name="Shipments" fill="var(--primary)" radius={[3, 3, 0, 0]} maxBarSize={34} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="panel-card dashboard-status">
          <div className="panel-card__header">
            <div>
              <p className="eyebrow">Live distribution</p>
              <h3>Shipment status</h3>
            </div>
            <Link to="/shipments" className="button button--ghost">All shipments</Link>
          </div>
          <div className="status-distribution">
            <div className="status-donut" aria-label={`${shipments.length} shipments across all statuses`} role="img">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusChartData.length ? statusChartData : [{ status: 'EMPTY', label: 'No shipments', color: 'var(--border-strong)', count: 1 }]} dataKey="count" nameKey="label" innerRadius="72%" outerRadius="94%" paddingAngle={statusChartData.length > 1 ? 2 : 0} stroke="none">
                    {(statusChartData.length ? statusChartData : [{ status: 'EMPTY', label: 'No shipments', color: 'var(--border-strong)', count: 1 }]).map((entry) => <Cell key={entry.status} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ border: '1px solid var(--border)', borderRadius: 7, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="status-donut__center"><strong>{shipments.length}</strong><span>shipments</span></div>
            </div>
            <ul className="status-legend">
              {statusBreakdown.map((entry) => (
                <li key={entry.status}>
                  <span className="status-legend__label"><i style={{ background: entry.color }} />{entry.label}</span>
                  <strong>{entry.count}</strong>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className="panel-card dashboard-audit">
          <div className="panel-card__header">
            <div>
              <p className="eyebrow">Change history</p>
              <h3>Recent audit activity</h3>
            </div>
            <Link to="/audit" className="button button--ghost">View all</Link>
          </div>
          {recentEvents.length === 0 ? (
            <EmptyState title="No activity yet" description="Audit events will appear when operations change." />
          ) : (
            <ul className="activity-list">
              {recentEvents.slice(0, 4).map((event) => {
                const actor = typeof event.performedBy === 'object' && event.performedBy ? event.performedBy.name : 'System';
                const eventTime = event.timestamp ?? event.createdAt;
                return <li key={String(event._id ?? event.id ?? `${event.eventType}-${event.entityId}`)}><div><strong>{event.eventType}</strong><span>{event.entityType} · {actor}</span></div><div className="activity-list__meta"><time>{eventTime ? new Date(eventTime).toLocaleString() : 'N/A'}</time></div></li>;
              })}
            </ul>
          )}
        </article>
      </div>

      <article className="panel-card dashboard-inventory">
        <div className="panel-card__header">
          <div>
            <p className="eyebrow">Stock overview</p>
            <h3>Inventory</h3>
          </div>
          <Link to="/inventory" className="button button--ghost">View inventory</Link>
        </div>
        <div className="dashboard-inventory__summary" aria-label="Inventory summary">
          <div><span>Tracked products</span><strong>{trackedProductCount.toLocaleString()}</strong></div>
          <div><span>Total units</span><strong>{totalInventoryUnits.toLocaleString()}</strong></div>
          <div><span>Warehouses</span><strong>{warehouseCount.toLocaleString()}</strong></div>
          <div><span>Low stock items</span><strong>{lowStockItems.length.toLocaleString()}</strong></div>
        </div>
        {dashboardInventory.length === 0 ? (
          <EmptyState title="No inventory records" description="Inventory items will appear here when stock is recorded." />
        ) : (
          <div className="table-wrap dashboard-inventory__table-wrap">
            <table className="dashboard-inventory__table">
              <thead><tr><th>Product</th><th>SKU</th><th>Warehouse</th><th>Available</th><th>Last updated</th><th>Stock alert</th></tr></thead>
              <tbody>
                {dashboardInventory.map((item) => {
                  const product = typeof item.productId === 'object' && item.productId ? item.productId : null;
                  const warehouse = typeof item.warehouseId === 'object' && item.warehouseId ? item.warehouseId : null;
                  const quantity = Number(item.quantity ?? 0);
                  const status = quantity <= 0 ? 'out-of-stock' : quantity < 10 ? 'low-stock' : 'in-stock';
                  const label = status === 'out-of-stock' ? 'Out of stock' : status === 'low-stock' ? 'Low stock' : 'In stock';
                  const itemKey = item._id ?? item.id ?? `${product?.sku ?? item.productId}-${warehouse?.code ?? item.warehouseId}`;
                  return (
                    <tr key={itemKey}>
                      <td><strong>{product?.name ?? (typeof item.productId === 'string' ? item.productId : 'Product unavailable')}</strong></td>
                      <td><code className="sku-cell">{product?.sku ?? '—'}</code></td>
                      <td>{warehouse?.name ?? (typeof item.warehouseId === 'string' ? item.warehouseId : 'Warehouse unavailable')}</td>
                      <td className={quantity < 10 ? 'quantity-cell quantity-cell--low' : 'quantity-cell'}>{quantity.toLocaleString()}</td>
                      <td>{item.updatedAt || item.createdAt ? new Date(item.updatedAt ?? item.createdAt ?? '').toLocaleDateString() : '—'}</td>
                      <td><span className={`inventory-stock-badge inventory-stock-badge--${status}`}>{label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <div className="dashboard-grid dashboard-records">
        <article className="panel-card dashboard-shipments">
        <div className="panel-card__header">
          <div><p className="eyebrow">Network activity</p><h3>Recent shipments</h3></div>
          <Link to="/shipments" className="button button--ghost">Open shipment desk</Link>
        </div>
        <label className="shipment-search">
          <span>Find by shipment number or ID</span>
          <input type="search" value={shipmentSearch} onChange={(event) => setShipmentSearch(event.target.value)} placeholder="Search shipments..." aria-label="Search shipments by number or ID" />
        </label>
        {shipmentError ? <ErrorState message={shipmentError} /> : recentShipments.length === 0 ? (
          <EmptyState
            title={shipmentSearch ? 'No matching shipments' : 'No shipments'}
            description={shipmentSearch
              ? 'Try another shipment number or ID.'
              : canCreateShipment
                ? 'Create a shipment to start moving goods.'
                : 'Shipment records will appear here when they are available.'}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Shipment</th><th>Status</th><th>Origin</th><th>Destination</th></tr></thead>
              <tbody>
                {recentShipments.map((shipment) => {
                  const origin = typeof shipment.sourceWarehouseId === 'object' ? shipment.sourceWarehouseId.name : 'Source';
                  const destination = typeof shipment.destinationWarehouseId === 'object' ? shipment.destinationWarehouseId.name : 'Destination';
                  const shipmentId = shipment._id ?? shipment.id;
                  return (
                    <tr key={String(shipment._id ?? shipment.id ?? shipment.shipmentNumber)}>
                      <td>{shipmentId ? <Link to={`/shipments/${shipmentId}`}>{shipment.shipmentNumber}</Link> : shipment.shipmentNumber}</td>
                      <td><StatusBadge status={shipment.status} /></td>
                      <td>{origin}</td><td>{destination}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </article>
      </div>

    </section>
  );
}

export default Dashboard;
