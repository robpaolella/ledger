import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import TwoFASetupPage from './pages/TwoFASetupPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import BudgetPage from './pages/BudgetPage';
import ReportsPage from './pages/ReportsPage';
import NetWorthPage from './pages/NetWorthPage';
import ImportPage from './pages/ImportPage';
import SettingsPage from './pages/SettingsPage';
import MockupPage from './pages/MockupPage';
import QAPage from './pages/QAPage';
import MobileHeader from './components/MobileHeader';
import BottomTabBar from './components/BottomTabBar';
import { NAV_ITEMS } from './lib/navItems';
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiFetch } from './lib/api';
import { useIsMobile } from './hooks/useIsMobile';

function getInitialTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('ledger-theme');
  if (stored === 'dark' || stored === 'light') return stored;
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('ledger-theme', theme);
  }, [theme]);

  const toggle = () => setTheme(t => t === 'light' ? 'dark' : 'light');
  return { theme, toggle };
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)] flex items-center justify-center">
        <div className="text-[var(--text-secondary)] text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Redirect to forced 2FA setup if required (but not if already on that page)
  if (user.twofaSetupRequired && location.pathname !== '/setup-2fa') {
    return <Navigate to="/setup-2fa" replace />;
  }

  return <>{children}</>;
}

function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();
  const { addToast } = useToast();
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('ledger-sidebar-collapsed') === 'true');

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('ledger-sidebar-collapsed', String(next));
      return next;
    });
  };

  const showFab = isMobile && location.pathname === '/transactions';

  const handlePermissionDenied = useCallback((e: Event) => {
    const msg = (e as CustomEvent).detail || 'Permission denied';
    addToast(msg, 'error');
  }, [addToast]);

  useEffect(() => {
    window.addEventListener('permission-denied', handlePermissionDenied);
    return () => window.removeEventListener('permission-denied', handlePermissionDenied);
  }, [handlePermissionDenied]);

  return (
    <div className="flex app-shell-height bg-[var(--bg-main)] font-sans">
      {/* Sidebar */}
      <div
        className="bg-[var(--bg-sidebar)] flex flex-col shrink-0 desktop-only overflow-hidden"
        style={{ width: sidebarCollapsed ? 64 : 220, transition: 'width 200ms ease' }}
      >
        {/* Logo / Expand toggle */}
        <div
          className="flex items-center border-b border-[rgba(255,255,255,0.08)] dark:border-[rgba(255,255,255,0.06)]"
          style={{ padding: sidebarCollapsed ? '20px 0 16px' : '20px 20px 16px', justifyContent: sidebarCollapsed ? 'center' : 'space-between' }}
        >
          {sidebarCollapsed ? (
            <div
              onClick={toggleSidebar}
              className="text-[var(--nav-inactive-text)] hover:text-[var(--sidebar-text)] cursor-pointer flex items-center justify-center transition-colors"
              title="Expand sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" /><line x1="20" y1="4" x2="20" y2="20" />
              </svg>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[#3b82f6] to-[#10b981] flex items-center justify-center shrink-0">
                  <span className="text-white text-sm font-extrabold font-mono">$</span>
                </div>
                <span className="text-[var(--sidebar-text)] text-base font-bold tracking-[-0.02em] whitespace-nowrap">Ledger</span>
              </div>
              <button
                onClick={toggleSidebar}
                className="bg-transparent border-none text-[var(--nav-inactive-text)] hover:text-[var(--sidebar-text)] hover:bg-white/5 cursor-pointer p-1 rounded flex items-center justify-center transition-colors"
                title="Collapse sidebar"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" /><line x1="4" y1="4" x2="4" y2="20" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 flex flex-col gap-0.5" style={{ padding: sidebarCollapsed ? '12px 8px' : '12px 10px' }}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.to);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={sidebarCollapsed ? item.label : undefined}
                className={`flex items-center gap-2.5 rounded-lg text-[13px] no-underline transition-colors ${
                  isActive
                    ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-text)] font-semibold'
                    : 'text-[var(--nav-inactive-text)] font-normal hover:bg-white/5'
                }`}
                style={{ padding: sidebarCollapsed ? '9px 0' : '9px 12px', justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}
              >
                <span className="shrink-0 flex">{item.icon}</span>
                {!sidebarCollapsed && item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className="border-t border-[rgba(255,255,255,0.08)] dark:border-[rgba(255,255,255,0.06)]"
          style={{ padding: sidebarCollapsed ? 8 : 12 }}
        >
          {/* Theme toggle */}
          {sidebarCollapsed ? (
            <div
              onClick={toggleTheme}
              className="flex justify-center text-[var(--nav-inactive-text)] hover:text-[var(--sidebar-text)] cursor-pointer transition-colors mb-3.5"
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {theme === 'light' ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              )}
            </div>
          ) : (
            <button
              onClick={toggleTheme}
              className="sidebar-card flex items-center gap-2.5 w-full text-[12px] font-medium text-[var(--nav-inactive-text)] hover:text-[var(--sidebar-text)] cursor-pointer rounded-lg whitespace-nowrap overflow-hidden mb-2"
              style={{ padding: '8px 10px' }}
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              <span className="flex shrink-0">
                {theme === 'light' ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                )}
              </span>
              {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </button>
          )}

          {/* User card */}
          <div
            onClick={() => navigate('/settings?tab=preferences')}
            className={`flex items-center rounded-lg overflow-hidden mb-2 cursor-pointer${sidebarCollapsed ? '' : ' sidebar-card'}`}
            style={sidebarCollapsed
              ? { justifyContent: 'center', padding: 0 }
              : { justifyContent: 'flex-start', gap: 10, padding: '8px 10px' }
            }
            title={sidebarCollapsed ? user?.displayName ?? 'Preferences' : undefined}
          >
            {/* Avatar */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-[12px]"
              style={{ background: '#1e3a5f', color: '#60a5fa' }}
            >
              {user?.displayName?.charAt(0).toUpperCase() ?? '?'}
            </div>
            {!sidebarCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-[var(--sidebar-text)] leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                    {user?.displayName}
                  </div>
                </div>
                {/* Sign out icon */}
                <div
                  onClick={(e) => { e.stopPropagation(); logout(); }}
                  className="shrink-0 flex items-center justify-center text-[var(--nav-inactive-text)] hover:text-[var(--sidebar-text)] cursor-pointer transition-colors"
                  title="Sign out"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                </div>
              </>
            )}
          </div>

          {/* Version */}
          <div className="text-center text-[10px] font-mono pt-0.5" style={{ color: 'rgba(148,163,184,0.45)' }}>
            {sidebarCollapsed ? 'v1.0' : 'v1.0.0'}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        <MobileHeader />
        <div className="flex-1 py-7 px-9 mobile-main-content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/net-worth" element={<NetWorthPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </div>
      {showFab && (
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('open-add-transaction'));
          }}
          className="mobile-only fixed z-10 flex items-center gap-1 cursor-pointer border-none"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
            background: 'var(--btn-primary-bg)',
            color: 'var(--btn-primary-text)',
            padding: '10px 24px',
            borderRadius: 20,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Transaction
        </button>
      )}
      <BottomTabBar />
    </div>
  );
}

export default function App() {
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);

  useEffect(() => {
    apiFetch<{ data: { setupRequired: boolean } }>('/setup/status', { skipAuth: true })
      .then(res => setSetupRequired(res.data.setupRequired))
      .catch(() => setSetupRequired(false));
  }, []);

  if (setupRequired === null) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)] flex items-center justify-center">
        <div className="text-[var(--text-secondary)] text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {setupRequired ? (
            <Route path="*" element={<SetupPage />} />
          ) : (
            <>
              {import.meta.env.DEV && <Route path="/mockup" element={<MockupPage />} />}
              {import.meta.env.DEV && <Route path="/qa" element={<QAPage />} />}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/setup-2fa" element={<ProtectedRoute><TwoFASetupPage /></ProtectedRoute>} />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              />
            </>
          )}
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
