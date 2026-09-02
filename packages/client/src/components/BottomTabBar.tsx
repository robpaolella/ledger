import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TAB_BAR_ITEMS, MORE_MENU_ITEMS, MORE_ROUTES, icons } from '../lib/navItems';
import BottomSheet from './BottomSheet';

const MORE_DESCRIPTIONS: Record<string, string> = {
  '/accounts': 'Balances, assets & net worth',
  '/reports': 'Income & expense breakdown',
  '/recurring': 'Bills, income & subscriptions',
  '/investments': 'Holdings & portfolio',
  '/reviews': 'Transactions waiting on someone',
  '/settings': 'Accounts, categories, users',
  '/import': 'CSV & bank sync import',
};

export default function BottomTabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [showMore, setShowMore] = useState(false);

  const isMoreActive = MORE_ROUTES.some(r =>
    r === '/' ? pathname === '/' : pathname.startsWith(r)
  );

  const isTabActive = (to: string) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to);

  return (
    <div className="mobile-only">
      {/* More Menu Bottom Sheet */}
      <BottomSheet isOpen={showMore} onClose={() => setShowMore(false)}>
        <div className="flex flex-col gap-3">
          {MORE_MENU_ITEMS.map((item) => {
            const active = isTabActive(item.to);
            return (
              <div
                key={item.to}
                onClick={() => {
                  navigate(item.to);
                  setShowMore(false);
                }}
                className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer bg-surface border border-line rounded-[10px] ${active ? 'border-l-[3px] border-l-primary' : ''}`}
              >
                <span className={`text-xl shrink-0 ${active ? 'text-primary' : 'text-content-3'}`}>
                  {item.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${active ? 'text-primary' : 'text-content'}`}>
                    {item.label}
                  </div>
                  <div className="text-[11px] text-content-2 mt-px">
                    {MORE_DESCRIPTIONS[item.to]}
                  </div>
                </div>
                <span className="text-content-3 text-sm shrink-0">›</span>
              </div>
            );
          })}
        </div>
      </BottomSheet>

      {/* Tab Bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 flex justify-around items-center bg-surface border-t border-line select-none pt-2.5 pb-[max(22px,env(safe-area-inset-bottom))]"
      >
        {TAB_BAR_ITEMS.map((tab) => {
          const active = isTabActive(tab.to);
          return (
            <div
              key={tab.to}
              onClick={() => {
                navigate(tab.to);
                setShowMore(false);
              }}
              className={`flex flex-col items-center justify-center gap-1 min-w-16 min-h-12 cursor-pointer tab-bar-icon ${active ? 'text-primary' : 'text-content-3'}`}
            >
              {tab.icon}
              <span className={`text-[10px] ${active ? 'font-semibold' : 'font-normal'}`}>{tab.label}</span>
            </div>
          );
        })}

        {/* More Tab */}
        <div
          onClick={() => setShowMore(!showMore)}
          className={`flex flex-col items-center justify-center gap-1 min-w-16 min-h-12 cursor-pointer tab-bar-icon ${(isMoreActive || showMore) ? 'text-primary' : 'text-content-3'}`}
        >
          {icons.more}
          <span className={`text-[10px] ${isMoreActive ? 'font-semibold' : 'font-normal'}`}>More</span>
        </div>
      </div>
    </div>
  );
}
