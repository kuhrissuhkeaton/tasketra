import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { VerifyEmailGate } from "./components/VerifyEmailGate";

// Every route is loaded on demand rather than bundled into the initial
// chunk -- ProjectHome in particular carries every tab's logic (Tasks,
// RAID, Budget, Meetings, ...) and was most of what pushed the single
// bundled chunk past Vite's 500kB warning. Splitting per route means a
// login or dashboard visit no longer pays for code it doesn't use yet.
const Login = lazy(() => import("./pages/Login"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ProjectHome = lazy(() => import("./pages/ProjectHome"));
const DecisionPublic = lazy(() => import("./pages/DecisionPublic"));
const RoadmapPublic = lazy(() => import("./pages/RoadmapPublic"));
const SharePublic = lazy(() => import("./pages/SharePublic"));
const RaciPrint = lazy(() => import("./pages/RaciPrint"));
const StakeholderPrint = lazy(() => import("./pages/StakeholderPrint"));
const RiskPrint = lazy(() => import("./pages/RiskPrint"));
const Resources = lazy(() => import("./pages/Resources"));
const WhatsNew = lazy(() => import("./pages/WhatsNew"));
const Billing = lazy(() => import("./pages/Billing"));
const Account = lazy(() => import("./pages/Account"));
const Founding = lazy(() => import("./pages/Founding"));
const MyActivity = lazy(() => import("./pages/MyActivity"));
const AdminWaitlist = lazy(() => import("./pages/AdminWaitlist"));
const AdminFeedback = lazy(() => import("./pages/AdminFeedback"));
const AdminFoundingMembers = lazy(() => import("./pages/AdminFoundingMembers"));
const AdminBroadcast = lazy(() => import("./pages/AdminBroadcast"));
const LegalHub = lazy(() => import("./pages/legal/LegalHub"));
const Terms = lazy(() => import("./pages/legal/Terms"));
const Privacy = lazy(() => import("./pages/legal/Privacy"));
const AcceptableUse = lazy(() => import("./pages/legal/AcceptableUse"));
const Cookies = lazy(() => import("./pages/legal/Cookies"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Forbidden = lazy(() => import("./pages/Forbidden"));

function RouteLoading() {
  return <div className="shell"><p className="muted" style={{ padding: 24 }}>Loading...</p></div>;
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading, sessionExpired } = useAuth();
  if (loading) return <div className="shell"><p className="muted" style={{ padding: 24 }}>Loading...</p></div>;
  if (!user) return <Navigate to={sessionExpired ? "/login?expired=1" : "/login"} replace />;
  if (user.emailVerified === false) return <VerifyEmailGate />;
  return <>{children}</>;
}

function AdminProtected({ children }: { children: React.ReactNode }) {
  const { user, loading, sessionExpired } = useAuth();
  if (loading) return <div className="shell"><p className="muted" style={{ padding: 24 }}>Loading...</p></div>;
  if (!user) return <Navigate to={sessionExpired ? "/login?expired=1" : "/login"} replace />;
  if (!user.isAdmin) return <Forbidden />;
  return <>{children}</>;
}

function Root() {
  const { user, loading } = useAuth();
  if (loading) return <div className="shell"><p className="muted" style={{ padding: 24 }}>Loading...</p></div>;
  if (user) return <Navigate to="/app" replace />;
  // Marketing/waitlist content lives on tasketra.com root, a separate site --
  // this app has no logged-out landing page of its own anymore, on any
  // hostname (including raw Netlify preview/deploy subdomains), so always
  // send a logged-out visitor straight to login.
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <ConfirmProvider>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<Root />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/app" element={<Protected><Dashboard /></Protected>} />
            <Route path="/app/resources" element={<Protected><Resources /></Protected>} />
            <Route path="/app/whats-new" element={<Protected><WhatsNew /></Protected>} />
            <Route path="/app/billing" element={<Protected><Billing /></Protected>} />
            <Route path="/app/account" element={<Protected><Account /></Protected>} />
            <Route path="/app/founding" element={<Protected><Founding /></Protected>} />
            <Route path="/app/activity" element={<Protected><MyActivity /></Protected>} />
            <Route path="/admin/waitlist" element={<AdminProtected><AdminWaitlist /></AdminProtected>} />
            <Route path="/admin/feedback" element={<AdminProtected><AdminFeedback /></AdminProtected>} />
            <Route path="/admin/founding-members" element={<AdminProtected><AdminFoundingMembers /></AdminProtected>} />
            <Route path="/admin/email-founding-members" element={<AdminProtected><AdminBroadcast /></AdminProtected>} />
            <Route path="/app/projects/:id" element={<Protected><ProjectHome /></Protected>} />
            <Route path="/app/projects/:id/print/risks" element={<Protected><RiskPrint /></Protected>} />
            <Route path="/app/projects/:id/print/raci" element={<Protected><RaciPrint /></Protected>} />
            <Route path="/app/projects/:id/print/stakeholders" element={<Protected><StakeholderPrint /></Protected>} />
            <Route path="/s/:token" element={<SharePublic />} />
            <Route path="/d/:token" element={<DecisionPublic />} />
            <Route path="/r/:token" element={<RoadmapPublic />} />
            <Route path="/legal" element={<LegalHub />} />
            <Route path="/legal/terms" element={<Terms />} />
            <Route path="/legal/privacy" element={<Privacy />} />
            <Route path="/legal/acceptable-use" element={<AcceptableUse />} />
            <Route path="/legal/cookies" element={<Cookies />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ConfirmProvider>
    </AuthProvider>
  );
}
