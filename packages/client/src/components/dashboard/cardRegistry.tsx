import type { FC, HTMLAttributes } from 'react';
import BudgetCard from './cards/BudgetCard';
import NetWorthCard from './cards/NetWorthCard';
import InvestmentsCard from './cards/InvestmentsCard';
import SpendingCard from './cards/SpendingCard';
import TransactionsCard from './cards/TransactionsCard';
import RecurringCard from './cards/RecurringCard';
import ReviewsCard from './cards/ReviewsCard';

export type DashboardCardId =
  | 'budget' | 'networth' | 'investments'
  | 'spending' | 'transactions' | 'recurring' | 'reviews';

export interface DashboardCardProps {
  /** useSortable attributes+listeners; spread on the card header (drag region). */
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;
}

export const CARDS: Record<DashboardCardId, { Component: FC<DashboardCardProps>; defaultColumn: 'left' | 'right' }> = {
  budget: { Component: BudgetCard, defaultColumn: 'left' },
  networth: { Component: NetWorthCard, defaultColumn: 'left' },
  investments: { Component: InvestmentsCard, defaultColumn: 'left' },
  spending: { Component: SpendingCard, defaultColumn: 'right' },
  transactions: { Component: TransactionsCard, defaultColumn: 'right' },
  recurring: { Component: RecurringCard, defaultColumn: 'right' },
  reviews: { Component: ReviewsCard, defaultColumn: 'right' },
};

/** Registry order doubles as the default within-column order. */
export const CARD_ORDER: DashboardCardId[] = [
  'budget', 'networth', 'investments', 'spending', 'transactions', 'recurring', 'reviews',
];
