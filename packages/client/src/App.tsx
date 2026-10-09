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
import RecurringPage from './pages/RecurringPage';
import InvestmentsPage from './pages/InvestmentsPage';
import ReviewsPage from './pages/ReviewsPage';
import MobileHeader from './components/MobileHeader';
import Sidebar from './components/Sidebar';
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import Spinner from './components/Spinner';
import { apiFetch } from './lib/api';
import { loadCategoryEmojis } from './lib/categoryMeta';

function FullScreenLoading() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <Spinner />
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullScreenLoading />;

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
  const { addToast } = useToast();

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

  if (setupRequired === null) return <FullScreenLoading />;

  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {setupRequired ? (
              <Route path="*" element={<SetupPage />} />
            ) : (
              <>
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
