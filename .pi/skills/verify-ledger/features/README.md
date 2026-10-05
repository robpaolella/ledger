# Ledger feature map

Start with [verify-ledger](../SKILL.md): synthetic data only, real UI actions,
phone and desktop proof, and cleanup. This is a starter map grounded in App.tsx,
the corresponding pages, API routes, and the demo seed; it is not an exhaustive suite.

| Flow | Entry points and states |
| --- | --- |
| [Transactions and import](transactions-import.md) | Transactions; Dashboard Transaction/View All; Import CSV, duplicate/transfer review, denied bank connection management |
| [Budgets and reports](budgets-reports.md) | Budget month/owner/category detail; Reports annual desktop and monthly phone views |
| [Accounts, categories and assets](accounts-categories-assets.md) | Settings Accounts/Categories; Net Worth balances, holdings and asset methods |
| [Settings and permissions](settings-permissions.md) | Settings/Preferences, profile persistence, owner/admin/member restrictions |

Use each listed entry point relevant to the change, including phone navigation.
Record empty, populated, validation-error and permission-denied states where applicable.
Never mistake January–March 2026 fixtures for current-month data.
