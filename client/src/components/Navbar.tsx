import { NavLink } from 'react-router-dom';
import { hasPermission } from '../permissions';
import type { User } from '../types';
import './Navbar.css';

const navigationItems = [
  {
    label: 'Dashboard',
    to: '/',
  },
  {
    label: 'Shipments',
    to: '/shipments',
  },
  {
    label: 'Inventory',
    to: '/inventory',
  },
  {
    label: 'Products',
    to: '/products',
  },
  {
    label: 'Warehouses',
    to: '/warehouses',
  },
  {
    label: 'Audit',
    to: '/audit',
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
          <span className="navbar-brand__mark" aria-hidden="true">AT</span>
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
