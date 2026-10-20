import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { hasPermission } from '../permissions';
import { createProduct, deleteProduct, listProducts, updateProduct } from '../services/productService';
import type { Product, ProductStatus, User } from '../types';

type ProductFormState = {
  name: string;
  sku: string;
  category: string;
  price: string;
  quantity: string;
  status: ProductStatus;
};

const defaultForm: ProductFormState = {
  name: '',
  sku: '',
  category: '',
  price: '0',
  quantity: '0',
  status: 'active',
};

function Products({ user }: { user: User | null }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProductStatus>('all');
  const [form, setForm] = useState<ProductFormState>(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canCreateProducts = hasPermission(user, 'product:create');
  const canUpdateProducts = hasPermission(user, 'product:update');
  const canDeleteProducts = hasPermission(user, 'product:delete');
  const canManageProducts = canCreateProducts || canUpdateProducts;

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      const productResponse = await listProducts();
      setProducts(productResponse);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load products.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProducts();
  }, [loadProducts]);

  const filteredProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSearch = !query || [product.name, product.sku, product.category].some((field) => field.toLowerCase().includes(query));
      const matchesStatus = statusFilter === 'all' || product.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [products, searchTerm, statusFilter]);

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
    setFormOpen(false);
    setError(null);
  };

  const openCreateForm = () => {
    setForm(defaultForm);
    setEditingId(null);
    setError(null);
    setFormOpen(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const payload: Partial<Product> = {
        name: form.name,
        sku: form.sku,
        category: form.category,
        price: Number(form.price),
        quantity: Number(form.quantity),
        status: form.status,
      };

      if (editingId) {
        await updateProduct(editingId, payload);
      } else {
        await createProduct(payload);
      }

      resetForm();
      await loadProducts();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save product.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (product: Product) => {
    setForm({
      name: product.name,
      sku: product.sku,
      category: product.category,
      price: String(product.price),
      quantity: String(product.quantity),
      status: product.status,
    });
    setEditingId(product._id ?? product.id ?? null);
    setError(null);
    setFormOpen(true);
  };

  const handleDelete = async (product: Product) => {
    if (!window.confirm(`Delete ${product.name}?`)) {
      return;
    }

    const id = product._id ?? product.id ?? '';
    if (!id) return;
    setDeletingId(id);
    try {
      await deleteProduct(id);
      await loadProducts();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete product.');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <LoadingState message="Loading products..." />;
  }

  return (
    <section className="page-panel">
      <PageHeader
        eyebrow="Catalog"
        title="Products"
        description="Manage product records and monitor catalog availability."
        meta={<span className="page-tag">{user ? `Signed in as ${user.name}` : 'Public access'}</span>}
        actions={canCreateProducts ? (
          <div className="page-header__actions">
            <span className="page-tag">{user ? `Signed in as ${user.name}` : 'Public access'}</span>
            <button type="button" className="button button--primary" onClick={openCreateForm}>Add product</button>
          </div>
        ) : null}
      />

      <div className="page-grid page-grid--single">
        <article className="panel-card">
          <div className="panel-card__header">
            <h3>Catalog</h3>
            <button type="button" className="button button--ghost" onClick={() => void loadProducts()}>
              Refresh
            </button>
          </div>

          <div className="toolbar">
            <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search products" aria-label="Search products" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | ProductStatus)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {error && !formOpen ? <ErrorState message={error} /> : null}

          {!canManageProducts ? (
            <p className="empty-inline">Read-only access. Contact an administrator to manage catalog products.</p>
          ) : null}

          {filteredProducts.length === 0 ? (
            <EmptyState
              title="No products found"
              description={canCreateProducts
                ? 'Adjust the search or create a product to continue.'
                : 'Adjust the search or contact a catalog manager if you expect products here.'}
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Qty</th>
                    <th>Status</th>
                    {canUpdateProducts || canDeleteProducts ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => (
                    <tr key={product._id ?? product.id ?? product.sku}>
                      <td><strong>{product.name}</strong></td>
                      <td><code className="sku-cell">{product.sku}</code></td>
                      <td>{product.category}</td>
                      <td className="price-cell">${Number(product.price).toFixed(2)}</td>
                      <td className="quantity-cell">{product.quantity}</td>
                      <td><StatusBadge status={product.status} /></td>
                      {canUpdateProducts || canDeleteProducts ? (
                        <td>
                          <div className="row-actions">
                            {canUpdateProducts ? (
                              <button type="button" className="button button--ghost" onClick={() => handleEdit(product)}>Edit</button>
                            ) : null}
                            {canDeleteProducts ? (
                              <button type="button" className="button button--danger" onClick={() => handleDelete(product)} disabled={deletingId === (product._id ?? product.id)}>
                                {deletingId === (product._id ?? product.id) ? 'Deleting...' : 'Delete'}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>

      {formOpen ? (
        <div className="inventory-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !submitting) resetForm();
        }}>
          <section className="inventory-modal crud-modal" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
            <div className="panel-card__header crud-modal__header">
              <div><p className="eyebrow">Catalog item</p><h3 id="product-form-title">{editingId ? 'Edit product' : 'Add product'}</h3></div>
              <button type="button" className="modal-close-button" aria-label="Close product dialog" onClick={resetForm} disabled={submitting}>×</button>
            </div>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <form className="form-grid" onSubmit={handleSubmit}>
              <label>
                <span>Name</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                <span>SKU</span>
                <input value={form.sku} onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))} required />
              </label>
              <label>
                <span>Category</span>
                <input value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} required />
              </label>
              <label>
                <span>Price</span>
                <input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} required />
              </label>
              <label>
                <span>Quantity</span>
                <input type="number" min="0" step="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} required />
              </label>
              <label>
                <span>Status</span>
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ProductStatus }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>

              <div className="action-row crud-modal__footer">
                <button type="submit" className="button button--primary" disabled={submitting}>
                  {submitting ? 'Saving...' : editingId ? 'Save changes' : 'Create product'}
                </button>
                <button type="button" className="button button--ghost" onClick={resetForm} disabled={submitting}>Cancel</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export default Products;
