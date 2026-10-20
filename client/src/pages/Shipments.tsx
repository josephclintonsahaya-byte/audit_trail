import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { hasPermission } from '../permissions';
import { createShipment, deleteShipment, dispatchShipment, listShipments, cancelShipment, deliverShipment } from '../services/shipmentService';
import { listProducts } from '../services/productService';
import { listWarehouses } from '../services/warehouseService';
import type { Product, Shipment, ShipmentStatus, User, Warehouse } from '../types';
import { formatTimestamp } from '../utils/formatTimestamp';

type ShipmentFormItem = {
  productId: string;
  quantity: string;
};

type ShipmentFormState = {
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  items: ShipmentFormItem[];
};

const defaultShipmentForm = (): ShipmentFormState => ({
  sourceWarehouseId: '',
  destinationWarehouseId: '',
  items: [{ productId: '', quantity: '1' }],
});

function Shipments({ user }: { user: User | null }) {
  const canCreateShipment = hasPermission(user, 'shipment:create');
  const canDispatchShipment = hasPermission(user, 'shipment:dispatch');
  const canDeliverShipment = hasPermission(user, 'shipment:deliver');
  const canCancelShipment = hasPermission(user, 'shipment:cancel');
  const canDeleteShipment = hasPermission(user, 'shipment:delete');
  const canTakeShipmentAction = canDispatchShipment || canDeliverShipment || canCancelShipment || canDeleteShipment;
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ShipmentStatus>('all');
  const [form, setForm] = useState<ShipmentFormState>(defaultShipmentForm());
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingShipmentId, setPendingShipmentId] = useState<string | null>(null);

  const loadShipments = useCallback(async () => {
    try {
      setLoading(true);
      const [shipmentResponse, productResponse, warehouseResponse] = await Promise.all([
        listShipments(),
        listProducts(),
        listWarehouses(),
      ]);
      setShipments(shipmentResponse);
      setProducts(productResponse);
      setWarehouses(warehouseResponse);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load shipments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadShipments();
  }, [loadShipments]);

  const filteredShipments = useMemo(() => {
    const query = appliedSearchTerm.trim().toLowerCase();

    return shipments.filter((shipment) => {
      const shipmentId = String(shipment._id ?? shipment.id ?? '').toLowerCase();
      const shipmentNumber = String(shipment.shipmentNumber ?? '').toLowerCase();
      const searchFields = [shipmentNumber, shipmentId, shipment.status];
      const matchesSearch = !query || searchFields.some((field) => field.toLowerCase().includes(query));
      const matchesStatus = statusFilter === 'all' || shipment.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [appliedSearchTerm, shipments, statusFilter]);

  const updateItem = (index: number, field: 'productId' | 'quantity', value: string) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }));
  };

  const addItemRow = () => {
    setForm((current) => ({
      ...current,
      items: [...current.items, { productId: '', quantity: '1' }],
    }));
  };

  const removeItemRow = (index: number) => {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handleCreateShipment = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      await createShipment({
        sourceWarehouseId: form.sourceWarehouseId,
        destinationWarehouseId: form.destinationWarehouseId,
        items: form.items.map((item) => ({ productId: item.productId, quantity: Number(item.quantity) })),
      });
      setForm(defaultShipmentForm());
      setCreateFormOpen(false);
      setError(null);
      await loadShipments();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create shipment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShipmentAction = async (shipmentId: string, action: 'dispatch' | 'deliver' | 'cancel') => {
    setPendingShipmentId(shipmentId);
    try {
      if (action === 'dispatch') {
        await dispatchShipment(shipmentId);
      }
      if (action === 'deliver') {
        await deliverShipment(shipmentId);
      }
      if (action === 'cancel') {
        await cancelShipment(shipmentId);
      }
      await loadShipments();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update shipment.');
    } finally {
      setPendingShipmentId(null);
    }
  };

  const handleDelete = async (shipmentId: string) => {
    setPendingShipmentId(shipmentId);
    try {
      await deleteShipment(shipmentId);
      await loadShipments();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete shipment.');
    } finally {
      setPendingShipmentId(null);
    }
  };

  if (loading) {
    return <LoadingState message="Loading shipments..." />;
  }

  return (
    <section className="page-panel">
      <PageHeader
        eyebrow="Logistics"
        title="Shipments"
        description="Search and monitor shipment activity across the logistics network."
        meta={<span className="page-tag">{user ? `Signed in as ${user.name}` : 'Public access'}</span>}
      />

      <div className="shipment-console">
        {canCreateShipment ? <button type="button" className="button button--primary" onClick={() => { setForm(defaultShipmentForm()); setError(null); setCreateFormOpen(true); }}>Create shipment</button> : null}
        <article className="panel-card shipment-log">
          <div className="panel-card__header">
            <h3>Shipment Log</h3>
            <button type="button" className="button button--ghost" onClick={() => void loadShipments()}>
              Refresh
            </button>
          </div>

          <form
            className="toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedSearchTerm(searchTerm);
            }}
          >
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search shipment number or ID"
              aria-label="Search shipments"
            />
            <button type="submit" className="button button--ghost">Search</button>
            {searchTerm || appliedSearchTerm ? (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => {
                  setSearchTerm('');
                  setAppliedSearchTerm('');
                }}
              >
                Clear
              </button>
            ) : null}
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | ShipmentStatus)} aria-label="Filter shipments by status">
              <option value="all">All statuses</option>
              <option value="CREATED">Created</option>
              <option value="IN_TRANSIT">In transit</option>
              <option value="DELIVERED">Delivered</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </form>

          {error && !createFormOpen ? <ErrorState message={error} /> : null}

          {filteredShipments.length === 0 ? (
            <EmptyState
              title={appliedSearchTerm ? 'No matching shipments' : 'No shipments found'}
              description={appliedSearchTerm
                ? 'No shipment number or ID matches this search.'
                : canCreateShipment
                  ? 'Create a shipment to begin tracking movement and delivery status.'
                  : 'Shipment records will appear here when they are available.'}
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Shipment</th>
                    <th>Origin</th>
                    <th>Destination</th>
                    <th>Status</th>
                    <th>Version</th>
                    <th>Last Updated</th>
                    {canTakeShipmentAction ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredShipments.map((shipment) => {
                    const origin = typeof shipment.sourceWarehouseId === 'object' ? shipment.sourceWarehouseId.name : 'Source';
                    const destination = typeof shipment.destinationWarehouseId === 'object' ? shipment.destinationWarehouseId.name : 'Destination';
                    return (
                      <tr key={String(shipment._id ?? shipment.id ?? shipment.shipmentNumber)}>
                        <td title={shipment.shipmentNumber}><Link to={`/shipments/${shipment._id ?? shipment.id ?? shipment.shipmentNumber}`}>{shipment.shipmentNumber}</Link></td>
                        <td title={origin}>{origin}</td>
                        <td title={destination}>{destination}</td>
                        <td><StatusBadge status={shipment.status} /></td>
                        <td>v{shipment.version ?? 'N/A'}</td>
                        <td>{formatTimestamp(shipment.updatedAt ?? shipment.createdAt)}</td>
                        {canTakeShipmentAction ? <td>
                          <div className="row-actions row-actions--stacked">
                            {canDispatchShipment ? <button type="button" className="button button--ghost" onClick={() => void handleShipmentAction(String(shipment._id ?? shipment.id ?? shipment.shipmentNumber), 'dispatch')} disabled={shipment.status !== 'CREATED' || pendingShipmentId === String(shipment._id ?? shipment.id ?? shipment.shipmentNumber)}>
                              Dispatch
                            </button> : null}
                            {canDeliverShipment ? <button type="button" className="button button--ghost" onClick={() => void handleShipmentAction(String(shipment._id ?? shipment.id ?? shipment.shipmentNumber), 'deliver')} disabled={shipment.status !== 'IN_TRANSIT' || pendingShipmentId === String(shipment._id ?? shipment.id ?? shipment.shipmentNumber)}>
                              Deliver
                            </button> : null}
                            {canCancelShipment ? <button type="button" className="button button--ghost" onClick={() => void handleShipmentAction(String(shipment._id ?? shipment.id ?? shipment.shipmentNumber), 'cancel')} disabled={shipment.status === 'DELIVERED' || shipment.status === 'CANCELLED' || pendingShipmentId === String(shipment._id ?? shipment.id ?? shipment.shipmentNumber)}>
                              Cancel
                            </button> : null}
                            {canDeleteShipment ? <button type="button" className="button button--danger" onClick={() => void handleDelete(String(shipment._id ?? shipment.id ?? shipment.shipmentNumber))} disabled={pendingShipmentId === String(shipment._id ?? shipment.id ?? shipment.shipmentNumber)}>
                              {pendingShipmentId === String(shipment._id ?? shipment.id ?? shipment.shipmentNumber) ? 'Saving...' : 'Delete'}
                            </button> : null}
                          </div>
                        </td> : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>

      {createFormOpen ? (
        <div className="inventory-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) { setForm(defaultShipmentForm()); setError(null); setCreateFormOpen(false); } }}>
          <section className="inventory-modal shipment-create-modal" role="dialog" aria-modal="true" aria-labelledby="shipment-create-title">
            <div className="panel-card__header crud-modal__header">
              <div><p className="eyebrow">New movement</p><h3 id="shipment-create-title">Create shipment</h3></div>
              <button type="button" className="modal-close-button" aria-label="Close create shipment dialog" onClick={() => { if (!submitting) { setForm(defaultShipmentForm()); setError(null); setCreateFormOpen(false); } }} disabled={submitting}>×</button>
            </div>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <form className="form-grid shipment-create-form" onSubmit={handleCreateShipment}>
            <label>
              <span>Source warehouse</span>
              <select value={form.sourceWarehouseId} onChange={(event) => setForm((current) => ({ ...current, sourceWarehouseId: event.target.value }))} required>
                <option value="">Select source warehouse</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse._id ?? warehouse.id ?? warehouse.code} value={warehouse._id ?? warehouse.id ?? warehouse.code}>{warehouse.name}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Destination warehouse</span>
              <select value={form.destinationWarehouseId} onChange={(event) => setForm((current) => ({ ...current, destinationWarehouseId: event.target.value }))} required>
                <option value="">Select destination warehouse</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse._id ?? warehouse.id ?? warehouse.code} value={warehouse._id ?? warehouse.id ?? warehouse.code}>{warehouse.name}</option>
                ))}
              </select>
            </label>

            {form.items.map((item, index) => (
              <div key={`shipment-item-${index}`} className="shipment-item-row">
                <label>
                  <span>Product</span>
                  <select value={item.productId} onChange={(event) => updateItem(index, 'productId', event.target.value)} required>
                    <option value="">Choose product</option>
                    {products.map((product) => (
                      <option key={product._id ?? product.id ?? product.sku} value={product._id ?? product.id ?? product.sku}>{product.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Quantity</span>
                  <input type="number" min="1" step="1" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} required />
                </label>
                {form.items.length > 1 ? (
                  <button type="button" className="button button--ghost" onClick={() => removeItemRow(index)}>
                    Remove
                  </button>
                ) : null}
              </div>
            ))}

            <div className="action-row">
              <button type="button" className="button button--ghost" onClick={addItemRow}>
                Add item
              </button>
              <button type="button" className="button button--ghost" onClick={() => { if (!submitting) { setForm(defaultShipmentForm()); setError(null); setCreateFormOpen(false); } }} disabled={submitting}>Cancel</button>
              <button type="submit" className="button button--primary" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create shipment'}
              </button>
            </div>
          </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export default Shipments;
