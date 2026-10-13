import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../components/Header';
import Navbar from '../components/Navbar';
import type { User } from '../types';

type LayoutProps = {
  user: User;
  onLogout: () => void;
};

function Layout({ user, onLogout }: LayoutProps) {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMenu = () => {
    if (window.matchMedia('(max-width: 1024px)').matches) {
      setMobileMenuOpen((open) => !open);
      return;
    }
    setSidebarVisible((visible) => !visible);
  };

  return (
    <div className={`app-shell${sidebarVisible ? '' : ' app-shell--sidebar-hidden'}`}>
      <Navbar
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />
      <div className="app-main">
        <Header
          user={user}
          onLogout={onLogout}
          sidebarOpen={window.matchMedia('(max-width: 1024px)').matches ? mobileMenuOpen : sidebarVisible}
          onToggleMenu={toggleMenu}
        />
        <main className="page-shell">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
