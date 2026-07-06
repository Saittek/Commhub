import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppRoute, GuestRoute, OnboardingRoute } from "./components/RouteGuards";
import { AuthProvider } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import AuthPage from "./pages/AuthPage";

const AppPage = lazy(() => import("./pages/AppPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));

function RouteFallback() {
  return (
    <div className="loading-screen">
      <p>Loading...</p>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<GuestRoute />}>
              <Route path="/" element={<AuthPage />} />
              <Route path="/auth" element={<Navigate to="/" replace />} />
            </Route>
            <Route element={<OnboardingRoute />}>
              <Route
                path="/onboarding"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <OnboardingPage />
                  </Suspense>
                }
              />
            </Route>
            <Route element={<AppRoute />}>
              <Route
                path="/app"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <AppPage />
                  </Suspense>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
