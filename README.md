# Ledger

[![Docker Hub](https://img.shields.io/docker/v/robpaolella/ledger?sort=semver&label=Docker%20Hub)](https://hub.docker.com/r/robpaolella/ledger)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Your Money. Your Data.**

A self-hosted personal finance app for households. Track income, expenses, budgets, net worth, and investments — with role-based access, bank sync, and a mobile-friendly UI. All data stays on your server in a single SQLite file.

## Features

- **Dashboard** — Financial summaries, spending breakdown, and recent transactions
- **Transactions** — Search, filters, pagination, bulk changes, splits, and reimbursements
- **Review queue** — Transactions that need a category or a second look
- **Import** — CSV files or bank sync, with categorization review, duplicate detection, and transfer detection
- **Budget** — Monthly budget vs. actual by category, including shared accounts
- **Recurring** — Bills and income that repeat, and whether each has come due
- **Accounts and Net Worth** — Account balances, investment holdings, and depreciating assets (straight-line and declining balance), with joint accounts for shared ownership
- **Reports** — Annual income/expense breakdown with expandable categories
- **Investments** — Holdings and their value over time
- **Daily Bank Sync** — Automatic transaction and balance import every day via [SimpleFIN Bridge](https://beta-bridge.simplefin.org/), with manual sync on demand
- **Auto-Categorizing** — Suggestions from your household's rules and transaction history
- **Notifications** — In-app notices, including bank-sync failures
- **Users and Permissions** — Owner / Admin / Member roles with 18 granular permissions
- **Two-Step Sign-In** — Extra protection for your account
- **Phone-Friendly** — App bar, navigation drawer, bottom sheets, and card layouts on small screens
- **Dark Mode** — System-aware with manual toggle

### Optional extras

Owner and admin only, and each is off until you set it up:

- **AI categorizing** — Uses a local Ollama server
- **Amazon order matching** — Matches Amazon orders to transactions
- **Investment benchmarks** — Needs the `TIINGO_TOKEN` server setting

## Quick Start

Pull and run with Docker Compose:

```bash
curl -O https://raw.githubusercontent.com/robpaolella/ledger/main/docker-compose.yml
docker compose up -d
```

Open [http://localhost:3001](http://localhost:3001). On first launch, the app walks you through creating an owner account — no default credentials.

### Or pull the image directly:

```bash
docker pull robpaolella/ledger:latest
docker run -d -p 3001:3001 -v ./data:/app/packages/server/data robpaolella/ledger:latest
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4 |
| Backend | Express 5, TypeScript, Drizzle ORM |
| Database | SQLite (better-sqlite3) |
| Auth | JWT, bcrypt |
| Bank Sync | SimpleFIN Bridge API |
| Deploy | Docker, Docker Compose |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | Auto-generated | Signing key for auth tokens. If not set, a random secret is generated and persisted in the data volume. |
| `PORT` | `3001` | Server port |
| `NODE_ENV` | `production` | Set automatically in Docker |

## Local Development

### Prerequisites

- Node.js 20+ and npm 9+

```bash
npm install
npm run dev
```

This starts the Express API (port 3001) and Vite dev server (port 5173). Open [http://localhost:5173](http://localhost:5173).

## Database Management

```bash
npm run db:backup                              # backup
npm run db:restore backups/ledger-XXXXXX.db    # restore
npm run db:reset                               # reset and re-seed (dev only)
```

The SQLite database is volume-mounted at `./data/` and persists across container rebuilds.

## License

[MIT](LICENSE)
