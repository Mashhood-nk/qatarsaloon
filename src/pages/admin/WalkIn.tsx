import { Navigate } from "react-router";

// Walk-ins are now part of "Add booking". Old links keep working.
export function WalkIn() {
  return <Navigate to="/admin/new?mode=now" replace />;
}
