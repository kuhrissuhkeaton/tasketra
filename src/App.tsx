import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { ConfirmProvider } from "./components/ConfirmDialog";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import ProjectHome from "./pages/ProjectHome";
import DecisionPublic from "./pages/DecisionPublic";
import Resources from "./pages/Resources";
import WhatsNew from "./pages/WhatsNew";
import Billing from "./pages/Billing";
import Account from "./pages/Account";
import AdminWaitlist from "./pages/AdminWaitlist";
import AdminFeedback from "./pages/AdminFeedback";
import LegalHub from "./pages/legal/LegalHub";
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import AcceptableUse from "./pages/legal/AcceptableUse";
import Cookies from "./pages/legal/Cookies";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="shell"><p className="muted" style={{ padding: 24 }}>Loading...</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminProtected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="shell"><p className="muted" style={{ padding: 24 }}>Loading...</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function Root() {
  const { user, loading } = useAuth();
  if (loading) return <div className="shell"><p className="muted" style={{ padding: 24 }}>Loading...</p></div>;
  if (user) return <Navigate to="/app" replace />;
  return <Landing />;
}

export default function App() {
  return (
    <AuthProvider>
      <ConfirmProvider>
        <Routes>
          <Route path="/" element={<Root />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/app" element={<Protected><Dashboard /></Protected>} />
          <Route path="/app/resources" element={<Protected><Resources /></Protected>} />
          <Route path="/app/whats-new" element={<Protected><WhatsNew /></Protected>} />
          <Route path="/app/billing" element={<Protected><Billing /></Protected>} />
          <Route path="/app/account" element={<Protected><Account /></Protected>} />
          <Route path="/admin/waitlist" element={<AdminProtected><AdminWaitlist /></AdminProtected>} />
          <Route path="/admin/feedback" element={<AdminProtected><AdminFeedback /></AdminProtected>} />
          <Route path="/app/projects/:id" element={<Protected><ProjectHome /></Protected>} />
          <Route path="/d/:token" element={<DecisionPublic />} />
          <Route path="/legal" element={<LegalHub />} />
          <Route path="/legal/terms" element={<Terms />} />
          <Route path="/legal/privacy" element={<Privacy />} />
          <Route path="/legal/acceptable-use" element={<AcceptableUse />} />
          <Route path="/legal/cookies" element={<Cookies />} />
        </Routes>
      </ConfirmProvider>
    </AuthProvider>
  );
}
