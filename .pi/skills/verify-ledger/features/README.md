# Ledger feature map

Start with [verify-ledger](../SKILL.md): synthetic data only, real UI actions,
phone and desktop proof, and cleanup. This is a starter map grounded in App.tsx,
the corresponding pages, API routes, and the demo seed; it is not an exhaustive suite.

| Flow | Entry points and states |
| --- | --- |
| [Transactions and import](transactions-import.md) | Transactions; Dashboard Transaction/View All; Import CSV, duplicate/transfer review, denied bank connection management |
| [Budgets and reports](budgets-reports.md) | Budget month/category detail; Reports annual desktop and monthly phone views |
| [Accounts, categories and assets](accounts-categories-assets.md) | Accounts net worth and balances; Settings Accounts/Categories; Investments and asset methods |
| [Banks, merchants and sample coverage](sample-coverage.md) | 20 accounts across 8 institutions; 185 merchants; optional logos; entry points and current limits for reviews/rules, investments, Amazon and notifications |
| [Settings and permissions](settings-permissions.md) | Settings/Preferences, profile persistence, owner/admin/member restrictions |

Use each listed entry point relevant to the change, including phone navigation.
Record empty, populated, validation-error and permission-denied states where applicable.
Fixture transaction, budget, and balance dates span the launch month (through today)
and its preceding eight months. Use the launch month/year rather than source fixture dates.
