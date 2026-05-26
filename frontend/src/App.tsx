import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import type { PageKey } from "./components/PageTabs";
import { useAuth } from "./hooks/useAuth";
import { Alerts } from "./pages/Alerts";
import { Backtest } from "./pages/Backtest";
import { Dashboard } from "./pages/Dashboard";
import { Data } from "./pages/Data";
import { Forecasts } from "./pages/Forecasts";
import { Inspector } from "./pages/Inspector";
import { Login } from "./pages/Login";

const NAV_KEY = "df:activePage";
const VALID_PAGES: PageKey[] = ["dashboard", "forecasts", "alerts", "backtest", "data", "inspector"];

function loadPage(): PageKey {
  const cached =
    typeof window !== "undefined" ? localStorage.getItem(NAV_KEY) : null;
  return cached && VALID_PAGES.includes(cached as PageKey)
    ? (cached as PageKey)
    : "dashboard";
}

export default function App() {
  const { user, signOut } = useAuth();
  const [page, setPage] = useState<PageKey>(loadPage);

  useEffect(() => {
    try {
      localStorage.setItem(NAV_KEY, page);
    } catch {
      /* localStorage may be unavailable */
    }
  }, [page]);

  if (!user) {
    return <Login />;
  }

  return (
    <div className="app-frame">
      <Sidebar
        active={page}
        onNavigate={setPage}
        user={user}
        onSignOut={signOut}
      />
      <div className="app-content">
        {page === "dashboard" && <Dashboard />}
        {page === "forecasts" && <Forecasts />}
        {page === "alerts" && <Alerts />}
        {page === "backtest" && <Backtest />}
        {page === "data" && <Data />}
        {page === "inspector" && <Inspector />}
      </div>
    </div>
  );
}
