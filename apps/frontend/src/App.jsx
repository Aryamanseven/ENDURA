import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import { FitnessProvider } from "./FitnessContext.jsx";
import { ThemeProvider } from "./ThemeContext.jsx";
import AppLayout from "./components/AppLayout.jsx";
import CustomCursor from "./components/CustomCursor.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import RunHistoryPage from "./pages/RunHistoryPage.jsx";
import RunDetailPage from "./pages/RunDetailPage.jsx";
import RacePredictionPage from "./pages/RacePredictionPage.jsx";
import CertificatesPage from "./pages/CertificatesPage.jsx";
import AccountPage from "./pages/AccountPage.jsx";

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function GuestRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  return (
    <>
      <CustomCursor />
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />

        {/* Auth — guests only */}
        <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
        <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
        <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />
        <Route path="/reset-password" element={<GuestRoute><ResetPasswordPage /></GuestRoute>} />

        {/* Protected — inside AppLayout */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/runs" element={<RunHistoryPage />} />
          <Route path="/runs/:id" element={<RunDetailPage />} />
          <Route path="/predictions" element={<RacePredictionPage />} />
          <Route path="/certificates" element={<CertificatesPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <FitnessProvider>
            <AppRoutes />
          </FitnessProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
