import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import Onboarding from "./pages/onboarding/Onboarding";
import ClassroomPage from "./pages/classroom/ClassroomPage";
import CreateClassroom from "./pages/classroom/CreateClassroom";
import ScrollToTop from "./components/ScrollToTop";

const queryClient = new QueryClient();

const AuthSpinner = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

/**
 * Requires authentication AND completed onboarding.
 * - Not logged in  → /login
 * - Logged in, onboarding pending → /onboarding
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) return <AuthSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!user?.onboardingCompleted) return <Navigate to="/onboarding" replace />;

  return <>{children}</>;
}

/**
 * Only accessible while onboarding is NOT yet complete.
 * - Not logged in       → /login
 * - Already onboarded   → /dashboard (skip back to app)
 */
function OnboardingRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) return <AuthSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.onboardingCompleted) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

/**
 * Redirects authenticated users away from guest pages (login/register).
 * - Onboarding not done → /onboarding
 * - Already onboarded   → /dashboard
 */
function GuestRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) return <AuthSpinner />;
  if (isAuthenticated) {
    return <Navigate to={user?.onboardingCompleted ? '/dashboard' : '/onboarding'} replace />;
  }

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
            <ScrollToTop />
            <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
            <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
            <Route path="/onboarding" element={<OnboardingRoute><Onboarding /></OnboardingRoute>} />

            {/* Classroom-only authenticated routes */}
            <Route path="/dashboard" element={<ProtectedRoute><CreateClassroom /></ProtectedRoute>} />
            <Route path="/classroom/create" element={<ProtectedRoute><CreateClassroom /></ProtectedRoute>} />
            <Route path="/classroom/:id" element={<ProtectedRoute><ClassroomPage /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
