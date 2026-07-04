import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppRoute, GuestRoute, OnboardingRoute } from "./components/RouteGuards";
import { AuthProvider } from "./context/AuthContext";
import { VoiceProvider } from "./context/VoiceContext";
import AppPage from "./pages/AppPage";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";

export default function App() {
  return (
    <AuthProvider>
      <VoiceProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<GuestRoute />}>
              <Route path="/" element={<AuthPage />} />
            </Route>
            <Route element={<OnboardingRoute />}>
              <Route path="/onboarding" element={<OnboardingPage />} />
            </Route>
            <Route element={<AppRoute />}>
              <Route path="/app" element={<AppPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </VoiceProvider>
    </AuthProvider>
  );
}
