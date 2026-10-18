import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import './App.css';
import './redesign.css';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './layout/Layout';
import LoadingState from './components/LoadingState';
import { clearSession, fetchCurrentUser, login } from './services/authService';
import { getStoredToken } from './services/api';
import type { User } from './types';

const AuditTrail = lazy(() => import('./pages/AuditTrail'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Login = lazy(() => import('./pages/Login'));
const Products = lazy(() => import('./pages/Products'));
const ShipmentDetails = lazy(() => import('./pages/ShipmentDetails'));
const Shipments = lazy(() => import('./pages/Shipments'));
const Settings = lazy(() => import('./pages/Settings'));
const Users = lazy(() => import('./pages/Users'));
const Warehouses = lazy(() => import('./pages/Warehouses'));

function AppRoutes() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      if (!getStoredToken()) {
        setUser(null);
        setReady(true);
        return;
      }

      try {
        const currentUser = await fetchCurrentUser();
        if (active) {
          setUser(currentUser);
        }
      } catch (requestError) {
        if (active) {
          setAuthError(requestError instanceof Error ? requestError.message : 'Unable to verify your session.');
        }
      } finally {
        if (active) {
          setReady(true);
        }
      }
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, [checkAttempt]);

  const handleLogin = async (email: string, password: string): Promise<void> => {
    const result = await login(email, password);
    setUser(result.user);
    setAuthError(null);
  };

  const handleLogout = useCallback((): void => {
    clearSession();
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const retrySessionCheck = (): void => {
    setAuthError(null);
    setReady(false);
    setCheckAttempt((attempt) => attempt + 1);
  };

  const continueToLogin = (): void => {
    clearSession();
    setUser(null);
    setAuthError(null);
    setReady(true);
    navigate('/login', { replace: true });
  };

  if (!ready) {
    return (
      <div className="app-shell app-shell--loading">
        <div className="spinner" role="status" aria-live="polite" aria-label="Checking authentication" />
      </div>
    );
  }

  if (authError) {
    return (
      <main className="login-page">
        <section className="state-panel state-panel--error" role="alert">
          <h1>Unable to verify your session</h1>
          <p>{authError}</p>
          <div className="action-row">
            <button type="button" className="button button--primary" onClick={retrySessionCheck}>
              Retry
            </button>
            <button type="button" className="button button--ghost" onClick={continueToLogin}>
              Go to login
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <Suspense fallback={<main className="page-shell"><LoadingState message="Loading workspace…" /></main>}>
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />} />
      <Route element={<ProtectedRoute ready={ready} user={user} />}>
        <Route element={user ? <Layout user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />}>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="/warehouses" element={<Warehouses user={user} />} />
          <Route path="/products" element={<Products user={user} />} />
          <Route path="/inventory" element={<Inventory user={user} />} />
          <Route path="/shipments" element={<Shipments user={user} />} />
          <Route path="/shipments/:id" element={<ShipmentDetails user={user} />} />
          <Route path="/audit" element={<AuditTrail user={user} />} />
          <Route path="/settings" element={<Settings user={user} />} />
          <Route element={<ProtectedRoute ready={ready} user={user} permission="user:manage" />}>
            <Route path="/users" element={<Users user={user} />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
    </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
