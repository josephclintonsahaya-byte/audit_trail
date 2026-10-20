import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import PageHeader from '../components/PageHeader';
import { hasPermission } from '../permissions';
import { listEntityAuditEvents } from '../services/auditService';
import { createInventory, deleteInventory, listInventory, updateInventory } from '../services/inventoryService';
import { listProducts } from '../services/productService';
import { listWarehouses } from '../services/warehouseService';
import type { AuditEvent, InventoryItem, Product, User, Warehouse } from '../types';
import { formatTimestamp } from '../utils/formatTimestamp';

type InventoryFormState = { productId: string; warehouseId: string; quantity: string };
type InventoryFilter = 'all' | 'in-stock' | 'low-stock' | 'out-of-stock';

const emptyInventoryForm: InventoryFormState = { productId: '', warehouseId: '', quantity: '0' };
const LOW_STOCK_THRESHOLD = 10;

const getInventoryId = (item: InventoryItem): string => item._id ?? item.id ?? '';
const getProductId = (item: InventoryItem): string => {
  if (typeof item.productId === 'string') return item.productId;
  return item.productId?._id ?? item.productId?.id ?? '';
};
const getStockStatus = (quantity: number): Exclude<InventoryFilter, 'all'> => {
  if (quantity <= 0) return 'out-of-stock';
  return quantity < LOW_STOCK_THRESHOLD ? 'low-stock' : 'in-stock';
};
const stockStatusLabels: Record<Exclude<InventoryFilter, 'all'>, string> = {
  'in-stock': 'In stock',
  'low-stock': 'Low stock',
  'out-of-stock': 'Out of stock',
};

function Inventory({ user }: { user: User | null }) {
  const canCreateInventory = hasPermission(user, 'inventory:create');
  const canUpdateInventory = hasPermission(user, 'inventory:update');
  const canDeleteInventory = hasPermission(user, 'inventory:delete');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<InventoryFilter>('all');
  const [form, setForm] = useState<InventoryFormState>(emptyInventoryForm);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [quantityDraft, setQuantityDraft] = useState('');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [history, setHistory] = useState<AuditEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [copiedProductId, setCopiedProductId] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    try {
      setLoading(true);
      const [inventoryResponse, productResponse, warehouseResponse] = await Promise.all([
        listInventory(), listProducts(), listWarehouses(),
      ]);
      setInventory(inventoryResponse);
      setProducts(productResponse);
      setWarehouses(warehouseResponse);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load inventory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInventory();
  }, [loadInventory]);

  const filteredInventory = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return inventory.filter((item) => {
      const product = typeof item.productId === 'object' ? item.productId : null;
      const warehouse = typeof item.warehouseId === 'object' ? item.warehouseId : null;
      const itemId = getInventoryId(item);
      const productId = getProductId(item);
      const searchFields = [itemId, productId, product?.name, product?.sku, warehouse?.name, warehouse?.location, warehouse?.code];
      const matchesSearch = !query || searchFields.some((field) => field?.toLowerCase().includes(query));
      const matchesStatus = statusFilter === 'all' || getStockStatus(Number(item.quantity ?? 0)) === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [inventory, searchTerm, statusFilter]);

  const lowStockItems = useMemo(
    () => inventory.filter((item) => Number(item.quantity ?? 0) < LOW_STOCK_THRESHOLD),
    [inventory],
  );
  const warehouseStock = useMemo(() => {
    const totals = new Map<string, { label: string; units: number }>();
    inventory.forEach((item) => {
      if (!item.warehouseId || typeof item.warehouseId !== 'object') return;
      const key = item.warehouseId._id ?? item.warehouseId.id ?? item.warehouseId.code;
      const current = totals.get(key) ?? { label: item.warehouseId.name, units: 0 };
      current.units += Number(item.quantity ?? 0);
      totals.set(key, current);
    });
    return [...totals.values()].sort((left, right) => right.units - left.units);
  }, [inventory]);
  const maxWarehouseStock = Math.max(1, ...warehouseStock.map((entry) => entry.units));

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await createInventory({ productId: form.productId, warehouseId: form.warehouseId, quantity: Number(form.quantity) });
      setForm(emptyInventoryForm);
      setShowCreateForm(false);
      await loadInventory();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create inventory record.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveQuantity = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingItem) return;
    const quantity = Number(quantityDraft);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setError('Inventory quantity must be zero or greater.');
      return;
    }
    setSubmitting(true);
    try {
      await updateInventory(getInventoryId(editingItem), quantity);
      setEditingItem(null);
      await loadInventory();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update inventory.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteInventory = async (item: InventoryItem) => {
    const id = getInventoryId(item);
    if (!id || !canDeleteInventory || !window.confirm('Delete this inventory record? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await deleteInventory(id);
      await loadInventory();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete inventory record.');
    } finally {
      setDeletingId(null);
    }
  };

  const openHistory = async (item: InventoryItem) => {
    const id = getInventoryId(item);
    if (!id) return;
    setHistoryItem(item);
    setHistory([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      setHistory(await listEntityAuditEvents('Inventory', id));
    } catch (requestError) {
      setHistoryError(requestError instanceof Error ? requestError.message : 'Unable to load movement history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const copyProductId = async (productId: string) => {
    try {
      await navigator.clipboard.writeText(productId);
      setCopiedProductId(productId);
      window.setTimeout(() => setCopiedProductId(null), 1600);
    } catch {
      setError('Could not copy the product ID.');
    }
  };

  if (loading && inventory.length === 0) return <LoadingState message="Loading inventory..." />;

  return (
    <section className="page-panel inventory-page">
      <PageHeader
        eyebrow="Logistics"
        title="Inventory Stock & Movement"
        description="Monitor warehouse stock levels, inventory updates, and historical movements."
        actions={canCreateInventory ? (
          <button type="button" className="button button--primary" onClick={() => { setError(null); setShowCreateForm(true); }}>
            Add inventory
          </button>
        ) : undefined}
      />

      {error && !showCreateForm ? <ErrorState message={error} /> : null}

      {showCreateForm && canCreateInventory ? (
        <div className="inventory-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setShowCreateForm(false); }}>
          <section className="inventory-modal crud-modal inventory-add-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-create-title">
            <div className="panel-card__header crud-modal__header">
              <div><p className="eyebrow">Stock entry</p><h3 id="inventory-create-title">Add inventory</h3></div>
              <button type="button" className="modal-close-button" aria-label="Close add inventory dialog" onClick={() => { if (!submitting) setShowCreateForm(false); }} disabled={submitting}>×</button>
            </div>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <form id="inventory-add-form" className="form-grid inventory-add-form" onSubmit={handleCreate}>
              <label><span>Product</span><select value={form.productId} onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))} required>
                <option value="">Select product</option>
                {products.map((product) => { const id = product._id ?? product.id ?? product.sku; return <option key={id} value={id}>{product.name}</option>; })}
              </select></label>
              <label><span>Warehouse</span><select value={form.warehouseId} onChange={(event) => setForm((current) => ({ ...current, warehouseId: event.target.value }))} required>
                <option value="">Select warehouse</option>
                {warehouses.map((warehouse) => { const id = warehouse._id ?? warehouse.id ?? warehouse.code; return <option key={id} value={id}>{warehouse.name} ({warehouse.code})</option>; })}
              </select></label>
              <label><span>Quantity</span><input type="number" min="0" step="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} required /></label>
              <div className="action-row crud-modal__footer">
                <button type="button" className="button button--ghost" onClick={() => { if (!submitting) setShowCreateForm(false); }} disabled={submitting}>Cancel</button>
                <button type="submit" className="button button--primary" disabled={submitting}>{submitting ? 'Saving...' : 'Add inventory'}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <article className="panel-card inventory-ledger">
        <div className="panel-card__header">
          <div><h3>Inventory Log</h3></div>
          <button type="button" className="button button--ghost" onClick={() => void loadInventory()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <form className="inventory-filters" onSubmit={(event) => { event.preventDefault(); setSearchTerm(searchInput); }}>
          <input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search item number or PID" aria-label="Search item number or product ID" />
          <button type="submit" className="button button--ghost">Search</button>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as InventoryFilter)} aria-label="Filter inventory by stock status">
            <option value="all">All statuses</option>
            <option value="in-stock">In stock</option>
            <option value="low-stock">Low stock</option>
            <option value="out-of-stock">Out of stock</option>
          </select>
        </form>

        {filteredInventory.length === 0 ? (
          <EmptyState title="No inventory found" description={searchTerm || statusFilter !== 'all' ? 'Adjust the search or stock status filter.' : canCreateInventory ? 'Create an inventory record to begin tracking stock.' : 'Inventory records will appear here when stock is available.'} />
        ) : (
          <div className="table-wrap inventory-table-wrap">
            <table className="inventory-table">
              <thead><tr><th>Product ID / SKU</th><th>Product Name</th><th>Warehouse Location</th><th>Current Stock</th><th>Status</th><th>Last Movement</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredInventory.map((item) => {
                  const product = typeof item.productId === 'object' ? item.productId : null;
                  const warehouse = typeof item.warehouseId === 'object' ? item.warehouseId : null;
                  const productId = getProductId(item);
                  const itemId = getInventoryId(item);
                  const stockStatus = getStockStatus(Number(item.quantity ?? 0));
                  return (
                    <tr key={itemId || `${productId}-${warehouse?.code ?? warehouse?.name ?? 'warehouse'}`}>
                      <td>
                        <div className="inventory-identifier" title={productId || product?.sku || 'Product ID unavailable'}>
                          <span>{product?.sku ?? 'SKU unavailable'}</span>
                          {productId ? <><code>{productId}</code><button type="button" className="inventory-copy-button" onClick={() => void copyProductId(productId)} aria-label={`Copy product ID ${productId}`} title={copiedProductId === productId ? 'Copied' : 'Copy product ID'}>{copiedProductId === productId ? '✓' : '▢'}</button></> : null}
                        </div>
                      </td>
                      <td title={product?.name ?? 'Product details unavailable'}>{product?.name ?? 'Unknown product'}</td>
                      <td title={warehouse ? `${warehouse.name} — ${warehouse.location}` : 'Warehouse details unavailable'}>{warehouse?.location || warehouse?.name || (typeof item.warehouseId === 'string' ? item.warehouseId : 'Unknown warehouse')}</td>
                      <td className="quantity-cell">{Number(item.quantity ?? 0).toLocaleString()}</td>
                      <td><span className={`inventory-stock-badge inventory-stock-badge--${stockStatus}`}>{stockStatusLabels[stockStatus]}</span></td>
                      <td className="timestamp-cell">{formatTimestamp(item.updatedAt ?? item.createdAt)}</td>
                      <td><div className="inventory-row-actions">
                        <button type="button" className="button button--primary" onClick={() => setSelectedItem(item)}>View Details</button>
                        {canUpdateInventory ? <button type="button" className="button button--ghost" onClick={() => { setEditingItem(item); setQuantityDraft(String(item.quantity ?? 0)); }}>Edit Stock</button> : null}
                        {canDeleteInventory ? <button type="button" className="button button--danger" onClick={() => void handleDeleteInventory(item)} disabled={deletingId === itemId}>{deletingId === itemId ? 'Deleting...' : 'Delete'}</button> : null}
                        <button type="button" className="button button--ghost inventory-history-button" onClick={() => void openHistory(item)} aria-label="View movement history" title="View movement history">History</button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel-card inventory-overview">
        <div className="panel-card__header"><div><p className="eyebrow">Stock by location</p><h3>Warehouse distribution</h3></div><span className="page-tag">{warehouseStock.length} locations with linked stock</span></div>
        {warehouseStock.length === 0 ? <EmptyState title="No warehouse totals available" description="Inventory records with linked warehouses will appear in this view." /> : (
          <div className="warehouse-stock-chart" role="img" aria-label="Inventory units grouped by warehouse">
            {warehouseStock.map((entry) => <div className="warehouse-stock-chart__item" key={entry.label}><strong>{entry.units}</strong><div className="warehouse-stock-chart__track"><i style={{ height: `${Math.max(4, (entry.units / maxWarehouseStock) * 100)}%` }} /></div><span title={entry.label}>{entry.label}</span></div>)}
          </div>
        )}
      </article>

      <details className="inventory-low-stock">
        <summary>Low stock watchlist <span>{lowStockItems.length} records below {LOW_STOCK_THRESHOLD} units</span></summary>
        {lowStockItems.length === 0 ? <p className="empty-inline">Everything is above the low-stock threshold.</p> : (
          <ul className="watchlist">{lowStockItems.map((item) => {
            const product = typeof item.productId === 'object' ? item.productId : null;
            const warehouse = typeof item.warehouseId === 'object' ? item.warehouseId : null;
            return <li key={getInventoryId(item)}><div><strong>{product?.name ?? 'Unknown product'}</strong><span>{warehouse?.name ?? 'Unknown warehouse'}</span></div><strong className="text-danger">{Number(item.quantity).toLocaleString()} units</strong></li>;
          })}</ul>
        )}
      </details>

      {selectedItem ? (() => {
        const product = typeof selectedItem.productId === 'object' ? selectedItem.productId : null;
        const warehouse = typeof selectedItem.warehouseId === 'object' ? selectedItem.warehouseId : null;
        const status = getStockStatus(Number(selectedItem.quantity ?? 0));
        return <div className="inventory-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedItem(null); }}>
          <section className="inventory-modal crud-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-details-title">
            <div className="panel-card__header crud-modal__header"><div><p className="eyebrow">Stock record</p><h3 id="inventory-details-title">Inventory details</h3></div><button type="button" className="modal-close-button" aria-label="Close inventory details" onClick={() => setSelectedItem(null)}>×</button></div>
            <dl className="inventory-detail-list"><div><dt>Product</dt><dd>{product?.name ?? 'Unknown product'}</dd></div><div><dt>SKU</dt><dd>{product?.sku ?? 'Not available'}</dd></div><div><dt>Product ID</dt><dd>{getProductId(selectedItem) || 'Not available'}</dd></div><div><dt>Warehouse</dt><dd>{warehouse?.name ?? 'Unknown warehouse'}</dd></div><div><dt>Location</dt><dd>{warehouse?.location ?? 'Not available'}</dd></div><div><dt>Current stock</dt><dd>{Number(selectedItem.quantity ?? 0).toLocaleString()}</dd></div><div><dt>Status</dt><dd><span className={`inventory-stock-badge inventory-stock-badge--${status}`}>{stockStatusLabels[status]}</span></dd></div><div><dt>Last movement</dt><dd>{formatTimestamp(selectedItem.updatedAt ?? selectedItem.createdAt)}</dd></div></dl>
            <button type="button" className="button button--ghost" onClick={() => { setSelectedItem(null); void openHistory(selectedItem); }}>View movement history</button>
          </section>
        </div>;
      })() : null}

      {editingItem ? <div className="inventory-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingItem(null); }}>
        <section className="inventory-modal crud-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-edit-title">
          <div className="panel-card__header crud-modal__header"><div><p className="eyebrow">Stock adjustment</p><h3 id="inventory-edit-title">Edit Stock</h3></div><button type="button" className="modal-close-button" aria-label="Close stock adjustment" onClick={() => setEditingItem(null)}>×</button></div>
          <form className="inventory-edit-form" onSubmit={(event) => void handleSaveQuantity(event)}>
            <label><span>Quantity</span><input type="number" min="0" step="1" value={quantityDraft} onChange={(event) => setQuantityDraft(event.target.value)} required /></label>
            <button type="submit" className="button button--primary" disabled={submitting}>{submitting ? 'Saving...' : 'Save Stock'}</button>
          </form>
        </section>
      </div> : null}

      {historyItem ? <div className="inventory-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryItem(null); }}>
        <section className="inventory-modal inventory-history-modal crud-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-history-title">
          <div className="panel-card__header crud-modal__header"><div><p className="eyebrow">Immutable record</p><h3 id="inventory-history-title">Movement history</h3></div><button type="button" className="modal-close-button" aria-label="Close movement history" onClick={() => setHistoryItem(null)}>×</button></div>
          {historyLoading ? <LoadingState message="Loading movement history..." /> : historyError ? <ErrorState message={historyError} /> : history.length === 0 ? <EmptyState title="No movement history" description="No audit events are recorded for this inventory item." /> : (
            <ul className="inventory-history-list">{history.map((event) => {
              const actor = typeof event.performedBy === 'object' && event.performedBy ? event.performedBy.name : 'System';
              return <li key={event._id ?? event.id ?? `${event.eventType}-${event.timestamp}`}><div><strong>{event.eventType.replaceAll('_', ' ')}</strong><span>{actor}</span></div><time>{formatTimestamp(event.timestamp ?? event.createdAt)}</time></li>;
            })}</ul>
          )}
        </section>
      </div> : null}
    </section>
  );
}

export default Inventory;
