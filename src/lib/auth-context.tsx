import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type User } from "./api";
import { SESSION_EXPIRED_EVENT } from "./sessionEvents";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  /** True when the server stopped accepting a session that was signed in a moment ago. */
  sessionExpired?: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const userRef = useRef<User | null>(null);

  async function refresh() {
    try {
      const { user } = await api.me();
      setUser(user);
      if (user) setSessionExpired(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Any request answered with 401 outside the sign-in endpoints lands here.
  // Only a person who was signed in is affected; a signed-out visitor is not
  // told their session expired.
  useEffect(() => {
    function onExpired() {
      if (!userRef.current) return;
      setSessionExpired(true);
      setUser(null);
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  async function logout() {
    await api.logout();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, sessionExpired, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
