import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { VoiceProvider } from "../context/VoiceContext";
import { getMyServers } from "../lib/api";
import { resolveHomePath } from "../lib/navigation";

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <p>Loading...</p>
    </div>
  );
}

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

export function GuestRoute() {
  const { user, loading } = useAuth();
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setRedirectTo(null);
      return;
    }

    let cancelled = false;

    async function resolveRedirect() {
      try {
        const path = await resolveHomePath();
        if (!cancelled) {
          setRedirectTo(path);
        }
      } catch {
        if (!cancelled) {
          setRedirectTo("/onboarding");
        }
      }
    }

    void resolveRedirect();

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (user) {
    if (!redirectTo) {
      return <LoadingScreen />;
    }
    return <Navigate to={redirectTo} replace />;
  }

  return <Outlet />;
}

export function OnboardingRoute() {
  const { user, loading } = useAuth();
  const [hasServers, setHasServers] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setHasServers(null);
      return;
    }

    let cancelled = false;

    async function checkServers() {
      try {
        const response = await getMyServers();
        if (!cancelled) {
          setHasServers(response.servers.length > 0);
        }
      } catch {
        if (!cancelled) {
          setHasServers(false);
        }
      }
    }

    void checkServers();

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || (user && hasServers === null)) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (hasServers) {
    return <Navigate to="/app" replace />;
  }

  return <Outlet />;
}

export function AppRoute() {
  const { user, loading } = useAuth();
  const [hasServers, setHasServers] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setHasServers(null);
      return;
    }

    let cancelled = false;

    async function checkServers() {
      try {
        const response = await getMyServers();
        if (!cancelled) {
          setHasServers(response.servers.length > 0);
        }
      } catch {
        if (!cancelled) {
          setHasServers(false);
        }
      }
    }

    void checkServers();

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || (user && hasServers === null)) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (!hasServers) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <VoiceProvider>
      <Outlet />
    </VoiceProvider>
  );
}
