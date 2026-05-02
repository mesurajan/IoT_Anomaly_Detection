import { lazy, Suspense, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { AppLayout } from "@/components/sentinel/AppLayout";
import { LoadingBlock } from "@/components/sentinel/States";
import { useBackendStatus } from "@/lib/hooks";
import { loadOverrideFromStorage, loadRuntimeConfig } from "@/lib/config";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Logs = lazy(() => import("./pages/Logs"));
const ReplayDetection = lazy(() => import("./pages/ReplayDetection"));
const LiveCapture = lazy(() => import("./pages/LiveCapture"));
const Retraining = lazy(() => import("./pages/Retraining"));
const Models = lazy(() => import("./pages/Models"));
const Kibana = lazy(() => import("./pages/Kibana"));
const Health = lazy(() => import("./pages/Health"));
const Audit = lazy(() => import("./pages/Audit"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function ShellRoute({ children }: { children: React.ReactNode }) {
  const { online } = useBackendStatus();
  return <AppLayout online={online}>{children}</AppLayout>;
}

function RootRedirect() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Navigate to="/dashboard" replace />;
}

const App = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadOverrideFromStorage();
    loadRuntimeConfig().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Initializing console...
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner theme="dark" richColors closeButton />
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<div className="p-6"><LoadingBlock label="Loading page..." /></div>}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<RootRedirect />} />

                <Route path="/dashboard" element={<ProtectedRoute><ShellRoute><Dashboard /></ShellRoute></ProtectedRoute>} />
                <Route path="/users" element={<ProtectedRoute roles={["admin"]}><ShellRoute><AdminUsers /></ShellRoute></ProtectedRoute>} />
                <Route path="/alerts" element={<ProtectedRoute><ShellRoute><Alerts /></ShellRoute></ProtectedRoute>} />
                <Route path="/logs" element={<ProtectedRoute><ShellRoute><Logs /></ShellRoute></ProtectedRoute>} />
                <Route path="/kibana" element={<ProtectedRoute><ShellRoute><Kibana /></ShellRoute></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute roles={["admin"]}><ShellRoute><SettingsPage /></ShellRoute></ProtectedRoute>} />

              

                <Route path="/monitoring" element={<Navigate to="/detection" replace />} />
                <Route path="/detection" element={<ProtectedRoute roles={["admin"]}><ShellRoute><ReplayDetection /></ShellRoute></ProtectedRoute>} />
                <Route path="/live-capture" element={<ProtectedRoute roles={["admin"]}><ShellRoute><LiveCapture /></ShellRoute></ProtectedRoute>} />
                <Route path="/retraining" element={<ProtectedRoute roles={["admin"]}><ShellRoute><Retraining /></ShellRoute></ProtectedRoute>} />
                <Route path="/models" element={<ProtectedRoute roles={["admin"]}><ShellRoute><Models /></ShellRoute></ProtectedRoute>} />
                <Route path="/health" element={<ProtectedRoute roles={["admin"]}><ShellRoute><Health /></ShellRoute></ProtectedRoute>} />
                <Route path="/audit" element={<ProtectedRoute roles={["admin"]}><ShellRoute><Audit /></ShellRoute></ProtectedRoute>} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
