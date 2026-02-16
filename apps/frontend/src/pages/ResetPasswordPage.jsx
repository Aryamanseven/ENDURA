import { Navigate } from "react-router-dom";

// Clerk handles password reset — redirect to login
export default function ResetPasswordPage() {
  return <Navigate to="/login" replace />;
}
