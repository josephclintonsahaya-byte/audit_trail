import { NavLink } from 'react-router-dom';
import { hasPermission } from '../permissions';
import type { User } from '../types';
import './Navbar.css';

const navigationItems = [
  {
    label: 'Dashboard',
    to: '/',
    icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z" /></svg>,
  },
  {
    label: 'Shipments',
    to: '/shipments',
    icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v12H3zM14 10h4l3 4v4h-7z" /><circle cx="7.5" cy="18" r="1.5" /><circle cx="17.5" cy="18" r="1.5" /></svg>,
  },
  {
    label: 'Inventory',
    to: '/inventory',
    icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5M12 13v8" /></svg>,
  },
  {
    label: 'Products',
    to: '/products',
    icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5v8l-9 5-9-5V8l9-5ZM3 8l9 5 9-5M12 13v8M7.5 5.5l9 5" /></svg>,
  },
  {
    label: 'Warehouses',
    to: '/warehouses',
    icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V8l9-5 9 5v13M7 21v-8h10v8M7 9h.01M12 9h.01M17 9h.01M3 21h18" /></svg>,
  },
  {
    label: 'Audit',
    to: '/audit',
    icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.3 2.3 4.8-5" /></svg>,
  },
];

type NavbarProps = {
  user: User;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

function Navbar({ user, mobileOpen, onCloseMobile }: NavbarProps) {
  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside className={`sidebar${mobileOpen ? ' sidebar--open' : ''}`}>
        <NavLink className="sidebar-brand" to="/" aria-label="Audit Trail home" onClick={onCloseMobile} title="Audit Trail">
          <span className="navbar-brand__mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.3 2.3 4.8-5" /></svg></span>
          <span>
            <strong>Audit Trail</strong>
            <small>Logistics Forensics</small>
          </span>
        </NavLink>

        <nav id="primary-navigation" className="sidebar-navigation" aria-label="Main navigation">
          <p className="sidebar-section-label">Workspace</p>
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              className="sidebar-navigation__link"
              to={item.to}
              end={item.to === '/'}
              onClick={onCloseMobile}
              title={item.label}
              aria-label={item.label}
            >
              <span className="sidebar-navigation__icon">{item.icon}</span>
              <span className="sidebar-navigation__label">{item.label}</span>
            </NavLink>
          ))}
          <p className="sidebar-section-label sidebar-section-label--administration">Administration</p>
          {hasPermission(user, 'user:manage') ? (
            <NavLink
              className="sidebar-navigation__link"
              to="/users"
              onClick={onCloseMobile}
              title="Users"
              aria-label="Users"
            >
              <span className="sidebar-navigation__icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 8v6M23 11h-6" /></svg></span>
              <span className="sidebar-navigation__label">Users</span>
            </NavLink>
          ) : null}
          <NavLink
            className="sidebar-navigation__link"
            to="/settings"
            onClick={onCloseMobile}
            title="Settings"
            aria-label="Settings"
          >
            <span className="sidebar-navigation__icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.7Z" /></svg></span>
            <span className="sidebar-navigation__label">Settings</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer__workspace">
            <span className="sidebar-footer__indicator" aria-hidden="true" />
            <span>
              <strong>Operations workspace</strong>
              <small>Shipment forensics & audit</small>
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}

export default Navbar;
