import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as api from "../lib/api";
import type { ChangePasswordPayload, UpdateProfilePayload, User } from "../lib/api";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (payload: UpdateProfilePayload) => Promise<void>;
  changePassword: (payload: ChangePasswordPayload) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await api.getMe();
        if (!cancelled) {
          setUser(response.user);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (usernameOrEmail: string, password: string) => {
    const response = await api.login(usernameOrEmail, password);
    setUser(response.user);
  }, []);

  const signup = useCallback(async (username: string, email: string, password: string) => {
    const response = await api.signup(username, email, password);
    setUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (payload: UpdateProfilePayload) => {
    const response = await api.updateProfile(payload);
    setUser(response.user);
  }, []);

  const changePassword = useCallback(async (payload: ChangePasswordPayload) => {
    await api.changePassword(payload);
  }, []);

  const uploadAvatar = useCallback(async (file: File) => {
    const response = await api.uploadAvatar(file);
    const baseUrl = response.user.avatarUrl?.split("?")[0] ?? null;
    setUser({
      ...response.user,
      avatarUrl: baseUrl ? `${baseUrl}?v=${Date.now()}` : null,
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      signup,
      logout,
      updateProfile,
      changePassword,
      uploadAvatar,
    }),
    [user, loading, login, signup, logout, updateProfile, changePassword, uploadAvatar],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}
