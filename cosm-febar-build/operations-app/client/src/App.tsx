import { createBrowserRouter, RouterProvider, NavLink, Outlet } from 'react-router';
import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@databricks/appkit-ui/react';
import { FilterContext, useFilters, VENUE_OPTIONS, WINDOW_OPTIONS } from './lib/filters';
import { OverviewPage } from './pages/OverviewPage';
import { LiveTransactionsPage } from './pages/LiveTransactionsPage';
import { RecommenderPage } from './pages/RecommenderPage';
import { GeniePage } from './pages/GeniePage';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 text-sm font-medium rounded-md transition-colors ${
    isActive
      ? 'bg-accent text-accent-foreground'
      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
  }`;

function GlobalFilters() {
  const [venue, setVenue] = useState('ALL');
  const [days, setDays] = useState(90);

  return (
    <FilterContext.Provider value={{ venue, days, setVenue, setDays }}>
      <Outlet />
    </FilterContext.Provider>
  );
}

function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 h-16 flex items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="text-xl font-black tracking-[0.2em] text-foreground">COSM</span>
            <span className="hidden sm:inline text-sm text-muted-foreground border-l border-border/70 pl-3">
              Operations Center
            </span>
          </div>
          <nav className="flex items-center gap-1 ml-auto md:ml-4 overflow-x-auto">
            <NavLink to="/" end className={navLinkClass}>
              Overview
            </NavLink>
            <NavLink to="/transactions" className={navLinkClass}>
              Live Transactions
            </NavLink>
            <NavLink to="/recommender" className={navLinkClass}>
              Recommender
            </NavLink>
            <NavLink to="/ask" className={navLinkClass}>
              Ask Cosm
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-8">
        <Outlet />
      </main>
    </div>
  );
}

export function VenueWindowFilter() {
  const { venue, days, setVenue, setDays } = useFilters();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={venue} onValueChange={setVenue}>
        <SelectTrigger className="w-[170px]" aria-label="Venue">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VENUE_OPTIONS.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v, 10))}>
        <SelectTrigger className="w-[150px]" aria-label="Time window">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {WINDOW_OPTIONS.map((w) => (
            <SelectItem key={w.days} value={String(w.days)}>
              {w.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <GlobalFilters />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <OverviewPage /> },
          { path: '/transactions', element: <LiveTransactionsPage /> },
          { path: '/recommender', element: <RecommenderPage /> },
          { path: '/ask', element: <GeniePage /> },
          { path: '*', element: <OverviewPage /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
