import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiFetch } from '../lib/api';

/** Open-review count for nav badges. Refetches on navigation and on the
 *  `reviews-changed` window event (flagging/approving on the current page
 *  doesn't change the route). */
export function useOpenReviewCount(): number {
  const [count, setCount] = useState(0);
  const { pathname } = useLocation();
  useEffect(() => {
    const refetch = () => apiFetch<{ data: { open: number } }>('/reviews/count').then((r) => setCount(r.data.open)).catch(() => {});
    refetch();
    window.addEventListener('reviews-changed', refetch);
    return () => window.removeEventListener('reviews-changed', refetch);
  }, [pathname]);
  return count;
}
