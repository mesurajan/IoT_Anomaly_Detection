import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { Role } from "@/lib/types";
import type { ReactNode } from "react";

export function ProtectedRoute({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: Role[];
}) {
  const { user } = useAuth();
  const location = useLocation();

  // Not logged in
  if (!user) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  // Role check (safe + normalized)
  if (roles && roles.length > 0) {
    const userRole = user.role?.toLowerCase();

    const allowedRoles = roles.map((r) => r.toLowerCase());

    if (!userRole || !allowedRoles.includes(userRole)) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}