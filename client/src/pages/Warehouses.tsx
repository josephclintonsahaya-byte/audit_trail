import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { hasPermission } from '../permissions';
import { createWarehouse, deleteWarehouse, listWarehouses, updateWarehouse } from '../services/warehouseService';
import type { InventoryStatus, User, Warehouse } from '../types';

type WarehouseForm = {
  name: string;
  code: string;
  location: string;
  status: InventoryStatus;
};

const emptyForm: WarehouseForm = {
  name: '',
  code: '',
  location: '',
  status: 'active',
};

function Warehouses({ user }: { user: User | null }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState<WarehouseForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canCreate = hasPermission(user, 'warehouse:create');
  const canUpdate = hasPermission(user, 'warehouse:update');
  const canDelete = hasPermission(user, 'warehouse:delete');

  const loadWarehouses = useCallback(async () => {
    try {
      setLoading(true);
      const response = await listWarehouses();
      setWarehouses(response);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load warehouses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWarehouses();
  }, [loadWarehouses]);

  const filteredWarehouses = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return warehouses.filter((warehouse) =>
      [warehouse.name, warehouse.code, warehouse.location].some((value) => value.toLowerCase().includes(query)),
    );
  }, [searchTerm, warehouses]);

  const closeForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(false);
  };

  const openCreateForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError(null);
    setNotice(null);
    setFormOpen(true);
  };

  const openEditForm = (warehouse: Warehouse) => {
    const id = warehouse._id ?? warehouse.id;
    if (!id || !canUpdate) return;
    setForm({
      name: warehouse.name,
      code: warehouse.code,
      location: warehouse.location,
      status: warehouse.status,
    });
    setEditingId(id);
    setError(null);
    setNotice(null);
    setFormOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const wasEditing = Boolean(editingId);
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      if (editingId) {
        await updateWarehouse(editingId, form);
      } else {
        await createWarehouse(form);
      }
      closeForm();
      setNotice(wasEditing ? 'Warehouse details updated.' : 'Warehouse created successfully.');
      await loadWarehouses();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save warehouse.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (warehouse: Warehouse) => {
    const id = warehouse._id ?? warehouse.id;
    if (!id || !canDelete || !window.confirm(`Delete warehouse ${warehouse.name}?`)) return;
    setDeletingId(id);
    setError(null);
    setNotice(null);
    try {
      await deleteWarehouse(id);
      setNotice(`Warehouse ${warehouse.name} deleted.`);
      await loadWarehouses();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete warehouse.');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading && warehouses.length === 0) {
    return <LoadingState message="Loading warehouses..." />;
  }

  return (
    <section className="page-panel">
      <PageHeader
        eyebrow="Network"
        title="Warehouses"
        description="Review and manage the locations supporting your fulfillment network."
        actions={(
          <div className="page-header__actions">
            <span className="page-tag">{user ? `Signed in as ${user.name}` : 'Public access'}</span>
            {canCreate ? <button type="button" className="button button--primary" onClick={openCreateForm}>Add warehouse</button> : null}
          </div>
        )}
      />

      {notice ? <p className="users-notice" role="status">{notice}</p> : null}
      {error ? <ErrorState message={error} onRetry={() => void loadWarehouses()} /> : null}

      <article className="panel-card">
        <div className="panel-card__header">
          <div>
            <h3>Warehouse Directory</h3>
            <p className="section-description">{warehouses.length} registered location{warehouses.length === 1 ? '' : 's'}</p>
          </div>
          <button type="button" className="button button--ghost" onClick={() => void loadWarehouses()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="toolbar">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search name, code, or location"
            aria-label="Search warehouses"
          />
        </div>

        {filteredWarehouses.length > 0 ? (
          <div className="warehouse-location-grid" aria-label="Warehouse location overview">
            {filteredWarehouses.slice(0, 4).map((warehouse) => (
              <article className="warehouse-location-card" key={warehouse._id ?? warehouse.id ?? warehouse.code}>
                <span className="warehouse-location-card__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
                </span>
                <div className="warehouse-location-card__body">
                  <div className="warehouse-location-card__heading"><strong>{warehouse.code} · {warehouse.name}</strong><StatusBadge status={warehouse.status} /></div>
                  <span>{warehouse.location}</span>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {filteredWarehouses.length === 0 ? (
          <EmptyState
            title={searchTerm ? 'No matching warehouses' : 'No warehouses yet'}
            description={searchTerm ? 'Try a different warehouse name, code, or location.' : canCreate ? 'Add a warehouse to register a fulfillment location.' : 'Warehouse locations will appear here when they are registered.'}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Warehouse</th>
                  <th>Code</th>
                  <th>Location</th>
                  <th>Status</th>
                  {canUpdate || canDelete ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filteredWarehouses.map((warehouse) => {
                  const id = warehouse._id ?? warehouse.id ?? '';
                  return (
                    <tr key={id || warehouse.code}>
                      <td><strong>{warehouse.name}</strong></td>
                      <td><span className="warehouse-code">{warehouse.code}</span></td>
                      <td>{warehouse.location}</td>
                      <td><StatusBadge status={warehouse.status} /></td>
                      {canUpdate || canDelete ? (
                        <td>
                          <div className="row-actions">
                            {canUpdate ? <button type="button" className="button button--ghost" onClick={() => openEditForm(warehouse)}>Edit</button> : null}
                            {canDelete ? (
                              <button type="button" className="button button--danger" onClick={() => void handleDelete(warehouse)} disabled={deletingId === id}>
                                {deletingId === id ? 'Deleting...' : 'Delete'}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {formOpen ? (
        <div className="inventory-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) closeForm(); }}>
          <section className="inventory-modal crud-modal" role="dialog" aria-modal="true" aria-labelledby="warehouse-form-title">
            <div className="panel-card__header crud-modal__header">
              <div><p className="eyebrow">Network location</p><h3 id="warehouse-form-title">{editingId ? 'Edit warehouse' : 'Add warehouse'}</h3></div>
              <button type="button" className="modal-close-button" aria-label="Close warehouse dialog" onClick={closeForm} disabled={submitting}>×</button>
            </div>
            <form className="form-grid" onSubmit={(event) => void handleSubmit(event)}>
              <label>
                <span>Name</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={150} required />
              </label>
              <label>
                <span>Code</span>
                <input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} maxLength={64} required />
              </label>
              <label>
                <span>Location</span>
                <input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} maxLength={200} required />
              </label>
              <label>
                <span>Status</span>
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as InventoryStatus }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              {error ? <p className="text-danger" role="alert">{error}</p> : null}
              <div className="action-row crud-modal__footer">
                <button type="submit" className="button button--primary" disabled={submitting}>
                  {submitting ? 'Saving...' : editingId ? 'Save changes' : 'Create warehouse'}
                </button>
                <button type="button" className="button button--ghost" onClick={closeForm} disabled={submitting}>Cancel</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export default Warehouses;
