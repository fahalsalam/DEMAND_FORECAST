/**
 * Demo-only auth shared across the app via React Context.
 *
 * Why the context: before this, `useAuth` was a plain hook with local state,
 * which meant Login.tsx and App.tsx each got their OWN copy of `user`.
 * Login's `signIn` updated Login's local state, App's state stayed null,
 * App kept rendering Login, click "did nothing". The provider gives every
 * consumer the same state instance.
 *
 * If/when a real auth backend lands, swap `signIn`'s body for a fetch
 * against /auth/login and store the returned token in memory + httpOnly cookie.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const AUTH_KEY = "df:auth";

export interface AuthUser {
  email: string;
  name: string;
  role: string;
}

const DEMO_CREDS = { email: "admin@retail.local", password: "demo1234" };

const DEMO_USER: AuthUser = {
  email: DEMO_CREDS.email,
  name: "Demo Buyer",
  role: "Inventory Manager",
};

interface AuthContextValue {
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  signOut: () => void;
  demoCreds: typeof DEMO_CREDS;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  });

  // Sync across tabs.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== AUTH_KEY) return;
      try {
        setUser(e.newValue ? (JSON.parse(e.newValue) as AuthUser) : null);
      } catch {
        setUser(null);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      // Tiny delay so the spinner reads as work, not a glitch.
      await new Promise((r) => setTimeout(r, 350));
      const e = email.trim().toLowerCase();
      if (e === DEMO_CREDS.email && password === DEMO_CREDS.password) {
        localStorage.setItem(AUTH_KEY, JSON.stringify(DEMO_USER));
        setUser(DEMO_USER);
        return { ok: true };
      }
      return { ok: false, message: "Invalid email or password." };
    },
    []
  );

  const signOut = useCallback(() => {
    localStorage.removeItem(AUTH_KEY);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, signIn, signOut, demoCreds: DEMO_CREDS }),
    [user, signIn, signOut]
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>.");
  }
  return ctx;
}
