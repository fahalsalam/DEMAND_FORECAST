/**
 * Auth shared across the app via React Context.
 * Supports two roles:
 *   - "Inventory Manager" (admin demo, client-side only)
 *   - "supplier" (real backend auth against /supplier/login)
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
import { api } from "../api/client";

const AUTH_KEY = "df:auth";

export interface AuthUser {
  email: string;
  name: string;
  role: string;
  /** Present when role === "supplier" */
  supplierToken?: string;
  supplierName?: string;
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
      await new Promise((r) => setTimeout(r, 350));
      const e = email.trim().toLowerCase();

      // Admin demo (client-side only).
      if (e === DEMO_CREDS.email && password === DEMO_CREDS.password) {
        localStorage.setItem(AUTH_KEY, JSON.stringify(DEMO_USER));
        setUser(DEMO_USER);
        return { ok: true };
      }

      // Try supplier login against the backend.
      try {
        const data = await api.supplierLogin(e, password);
        const supplierUser: AuthUser = {
          email: data.email,
          name: data.supplier_name,
          role: "supplier",
          supplierToken: data.token,
          supplierName: data.supplier_name,
        };
        localStorage.setItem(AUTH_KEY, JSON.stringify(supplierUser));
        setUser(supplierUser);
        return { ok: true };
      } catch {
        // Backend unreachable or wrong credentials — fall through.
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
