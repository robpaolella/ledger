import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canLinkAccounts } from './investments/emptyState';
import { noAccountsPointer, type NoAccountsPlace } from '../lib/noAccounts';

/** One line telling a household with no accounts to add one first; renders nothing otherwise. */
export default function NoAccountsPointer({ loaded, count, place, className = '' }: { loaded: boolean; count: number; place: NoAccountsPlace; className?: string }) {
  const { user, hasPermission } = useAuth();
  const copy = noAccountsPointer({ loaded, count, place, canAdd: hasPermission('accounts.create'), canLinkBank: canLinkAccounts(user) });
  if (!copy) return null;
  return (
    <p className={`text-content-3 text-sm m-0 ${className}`}>
      {copy.before}{copy.link && <Link to="/accounts" className="font-semibold text-primary">{copy.link}</Link>}{copy.after}
    </p>
  );
}
