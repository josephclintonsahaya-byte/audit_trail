import { Navigate, Outlet } from 'react-router-dom';
import { hasPermission, type Permission } from '../permissions';
import type { User } from '../types';
import LoadingState from './LoadingState';

type ProtectedRouteProps = {
  ready: boolean;
  user: User | null;
  permission?: Permission;
};

function ProtectedRoute({ ready, user, permission }: ProtectedRouteProps) {
  if (!ready) {
    return <LoadingState message="Checking your session..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (permission && !hasPermission(user, permission)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
