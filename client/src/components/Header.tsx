import type { User } from '../types';

type HeaderProps = {
  user: User;
  onLogout: () => void;
  sidebarOpen: boolean;
  onToggleMenu: () => void;
};

function Header({ user, onLogout, sidebarOpen, onToggleMenu }: HeaderProps) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar__menu-button"
        aria-label="Toggle navigation menu"
        aria-expanded={sidebarOpen}
        aria-controls="primary-navigation"
        onClick={onToggleMenu}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div className="topbar__intro">
        <p className="eyebrow">Operations workspace</p>
        <h1>Logistics Audit Platform</h1>
      </div>

      <div className="auth-panel--logged-in">
        <span className="user-avatar" aria-hidden="true">
          {user.name.trim().slice(0, 1).toUpperCase()}
        </span>
        <div>
          <span className="eyebrow">{user.role}</span>
          <strong>{user.name}</strong>
        </div>
        <button type="button" className="button button--ghost" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </header>
  );
}

export default Header;