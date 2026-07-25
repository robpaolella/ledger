import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { useToast } from './context/ToastContext';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import TwoFASetupPage from './pages/TwoFASetupPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import BudgetPage from './pages/BudgetPage';
import CategoryDetailPage from './pages/CategoryDetailPage';
import ReportsPage from './pages/ReportsPage';
import AccountsPage from './pages/AccountsPage';
import AccountDetailPage from './pages/AccountDetailPage';
import ImportPage from './pages/ImportPage';
import SettingsPage from './pages/SettingsPage';
import MockupPage from './pages/MockupPage';
import QAPage from './pages/QAPage';
import RecurringPage from './pages/RecurringPage';
import InvestmentsPage from './pages/InvestmentsPage';
import ReviewsPage from './pages/ReviewsPage';
import MobileHeader from './components/MobileHeader';
import BottomTabBar from './components/BottomTabBar';
import Sidebar from './components/Sidebar';
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiFetch } from './lib/api';
import { loadCategoryEmojis } from './lib/categoryMeta';
import { useIsMobile } from './hooks/useIsMobile';

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
  const location = useLocation();
  const { addToast } = useToast();
  const isMobile = useIsMobile();

  const showFab = isMobile && location.pathname === '/transactions';

  const handlePermissionDenied = useCallback((e: Event) => {
    const msg = (e as CustomEvent).detail || 'Permission denied';
    addToast(msg, 'error');
  }, [addToast]);

  useEffect(() => {
    window.addEventListener('permission-denied', handlePermissionDenied);
    return () => window.removeEventListener('permission-denied', handlePermissionDenied);
  }, [handlePermissionDenied]);

  // Stored per-category emoji overrides: load once at app start so every page
  // reflects them on cold entry. The Categories settings page refreshes the
  // shared map directly as it edits (setCategoryEmojiOverrides).
  useEffect(() => { loadCategoryEmojis(); }, []);

  return (
    <div className="flex app-shell-height bg-bg font-sans">
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        <MobileHeader />
        <div className="flex-1 py-7 px-9 mobile-main-content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/accounts/:id" element={<AccountDetailPage />} />
            <Route path="/net-worth" element={<Navigate to="/accounts" replace />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="/budget/category" element={<CategoryDetailPage />} />
            <Route path="/recurring" element={<RecurringPage />} />
            <Route path="/investments" element={<InvestmentsPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/reviews" element={<ReviewsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
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
            fontFamily: "'Hanken Grotesk', sans-serif",
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
    <ThemeProvider>
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
    </ThemeProvider>
  );
}
