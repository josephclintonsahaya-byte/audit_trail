import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import PageHeader from '../components/PageHeader';
import Pagination from '../components/Pagination';
import { hasPermission } from '../permissions';
import { changeUserPassword, createUser, deleteUser, listUsers, updateUser } from '../services/userService';
import type { ManagedUser, User } from '../types';

type UserForm = { name: string; email: string; role: User['role']; password: string; confirmPassword: string };
const emptyForm: UserForm = { name: '', email: '', role: 'staff', password: '', confirmPassword: '' };
const roleLabel: Record<User['role'], string> = { admin: 'Admin', manager: 'Manager', staff: 'Staff' };

function Users({ user }: { user: User | null }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState('Unable to load user registry');
  const [notice, setNotice] = useState<string | null>(null);
  const latestLoadId = useRef(0);
  const saveRefreshPending = useRef(false);
  const canManage = hasPermission(user, 'user:manage');

  const loadUsers = useCallback(async (afterSave = false): Promise<boolean> => {
    if (afterSave) saveRefreshPending.current = true;
    const loadId = latestLoadId.current + 1;
    latestLoadId.current = loadId;
    try {
      setLoading(true);
      const result = await listUsers(page, 20, search, roleFilter);
      if (loadId !== latestLoadId.current) return false;
      setUsers(result.users);
      setTotalPages(result.totalPages);
      setTotal(result.total);
      setError(null);
      saveRefreshPending.current = false;
      return true;
    } catch (requestError) {
      if (loadId !== latestLoadId.current) return false;
      setErrorTitle(saveRefreshPending.current ? 'Save succeeded, but registry refresh failed' : 'Unable to load user registry');
      setError(requestError instanceof Error ? requestError.message : 'Unable to load users.');
      return false;
    } finally {
      if (loadId === latestLoadId.current) setLoading(false);
    }
  }, [page, search, roleFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUsers();
  }, [loadUsers]);

  const closeForm = () => { setForm(emptyForm); setEditingId(null); setFormOpen(false); };
  const openCreate = () => { setForm(emptyForm); setEditingId(null); setFormOpen(true); setError(null); };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if ((!editingId || form.password || form.confirmPassword) && form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      setErrorTitle('Unable to save user');
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    let profileUpdated = false;
    try {
      if (editingId) {
        await updateUser(editingId, { name: form.name, email: form.email, role: form.role });
        profileUpdated = true;
        if (form.password || form.confirmPassword) {
          await changeUserPassword(editingId, form.password, form.confirmPassword);
        }
      } else {
        await createUser({ name: form.name, email: form.email, role: form.role, password: form.password, confirmPassword: form.confirmPassword });
      }
      closeForm();
      setNotice(editingId ? 'User details updated.' : 'User created successfully.');
      await loadUsers(true);
    } catch (requestError) {
      setErrorTitle(profileUpdated ? 'Profile updated, but password change failed' : 'Unable to save user');
      setError(requestError instanceof Error ? requestError.message : 'Unable to save user.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (managedUser: ManagedUser) => {
    const id = managedUser._id ?? managedUser.id;
    if (!id || !canManage) return;
    setEditingId(id);
    setForm({ name: managedUser.name, email: managedUser.email, role: managedUser.role, password: '', confirmPassword: '' });
    setFormOpen(true);
    setNotice(null);
    setError(null);
    setErrorTitle('Unable to save user');
  };

  const handleDelete = async (managedUser: ManagedUser) => {
    const id = managedUser._id ?? managedUser.id;
    if (!id || !canManage || !window.confirm(`Delete the account for ${managedUser.name}? This cannot be undone.`)) return;
    try {
      await deleteUser(id);
      setNotice(`User ${managedUser.name} deleted.`);
      setError(null);
      if (users.length === 1 && page > 1) setPage((current) => current - 1);
      else await loadUsers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete user.');
    }
  };

  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  if (loading && users.length === 0 && !error) return <LoadingState message="Loading users..." />;

  return (
    <section className="page-panel users-page">
      <PageHeader eyebrow="Administration" title="User Management" description="Manage account profiles and assign application roles."
        actions={canManage ? <button type="button" className="button button--primary" onClick={openCreate}>Add New User</button> : undefined} />

      {error ? <ErrorState title={errorTitle} message={error} /> : null}
      {notice ? <p className="users-notice" role="status">{notice}</p> : null}

      {formOpen && canManage ? (
        <div className="inventory-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
          <section className="inventory-modal users-modal crud-modal" role="dialog" aria-modal="true" aria-labelledby="user-form-title">
            <div className="panel-card__header crud-modal__header">
              <div><p className="eyebrow">Account access</p><h3 id="user-form-title">{editingId ? 'Edit user' : 'Add new user'}</h3></div>
              <button type="button" className="modal-close-button" aria-label="Close user dialog" onClick={closeForm}>×</button>
            </div>
            <form className="form-grid users-form" onSubmit={handleSubmit}>
              <label><span>Name</span><input autoComplete="name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} minLength={2} maxLength={100} required /></label>
              <label><span>Email</span><input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} maxLength={254} required /></label>
              <label><span>Role</span><select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as User['role'] }))}>
                <option value="staff">Staff</option><option value="manager">Manager</option><option value="admin">Admin</option>
              </select></label>
              {!editingId ? <>
                <label><span>Password</span><input type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} minLength={8} maxLength={128} required /></label>
                <label><span>Confirm password</span><input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} minLength={8} maxLength={128} required /></label>
                <p className="users-help">Use 8–128 characters. Passwords are securely hashed before storage.</p>
              </> : <>
                <div className="users-password-section"><p className="eyebrow">Password</p><p className="users-help">Leave both fields empty to keep the current password.</p></div>
                <label><span>New password</span><input type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} minLength={8} maxLength={128} /></label>
                <label><span>Confirm new password</span><input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} minLength={8} maxLength={128} /></label>
              </>}
              <div className="action-row"><button type="submit" className="button button--primary" disabled={submitting}>{submitting ? 'Saving...' : editingId ? 'Save changes' : 'Create user'}</button>
                <button type="button" className="button button--ghost" onClick={closeForm}>Cancel</button></div>
            </form>
          </section>
        </div>
      ) : null}

      <article className="panel-card users-registry">
        <div className="panel-card__header">
          <div><h3>User Registry</h3><p className="section-description">{total} account{total === 1 ? '' : 's'}</p></div>
          <button type="button" className="button button--ghost" onClick={() => void loadUsers()} disabled={loading}>Refresh</button>
        </div>
        <form className="users-filters" onSubmit={applySearch}>
          <label className="users-search"><span className="sr-only">Search users</span><input type="search" placeholder="Search by name or email" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
          <label className="users-role-filter"><span className="sr-only">Filter by role</span><select value={roleFilter} onChange={(event) => { setPage(1); setRoleFilter(event.target.value); }}>
            <option value="">All roles</option><option value="admin">Admin</option><option value="manager">Manager</option><option value="staff">Staff</option>
          </select></label>
          <button type="submit" className="button button--ghost">Search</button>
        </form>
        {loading && users.length > 0 ? <p className="users-loading" role="status">Updating registry…</p> : null}
        {users.length === 0 && !loading ? <EmptyState title={search || roleFilter ? 'No matching users' : 'No users found'} description={search || roleFilter ? 'Try another search or role filter.' : 'User accounts will appear here when they are created.'} /> : null}
        {users.length > 0 ? <>
          <div className="table-wrap users-table-wrap"><table className="users-table">
            <thead><tr><th>User ID</th><th>Username / Name</th><th>Email</th><th>Role</th>{canManage ? <th>Actions</th> : null}</tr></thead>
            <tbody>{users.map((managedUser) => {
              const id = managedUser._id ?? managedUser.id ?? '';
              return <tr key={id || managedUser.email}>
                <td><code title={id}>{id || '—'}</code></td>
                <td><strong>{managedUser.name}</strong>{managedUser.email === user?.email ? <span className="page-tag users-you">You</span> : null}</td>
                <td>{managedUser.email}</td><td><span className={`users-role-badge users-role-badge--${managedUser.role}`}>{roleLabel[managedUser.role]}</span></td>
                {canManage ? <td><div className="row-actions users-actions"><button type="button" className="button button--ghost" onClick={() => handleEdit(managedUser)}>Edit</button><button type="button" className="button button--danger" onClick={() => void handleDelete(managedUser)}>Delete</button></div></td> : null}
              </tr>;
            })}</tbody>
          </table></div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </> : null}
      </article>
    </section>
  );
}

export default Users;
