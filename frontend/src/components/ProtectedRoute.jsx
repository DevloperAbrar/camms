import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/auth.store';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, role } = useAuthStore();

  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/login" replace />;

  return children;
}