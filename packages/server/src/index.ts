import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { db, sqlite } from './db/index.js';
import { migrateAccountOwners } from './db/migrate-account-owners.js';
import { migrateSimplefin } from './db/migrate-simplefin.js';
import { migrateAssetsDepreciation } from './db/migrate-assets-depreciation.js';
import { migrateRolesPermissions } from './db/migrate-roles-permissions.js';
import { migrateDevStorage } from './db/migrate-dev-storage.js';
import { migrate2FA } from './db/migrate-2fa.js';
import { migrateCategorySortOrder } from './db/migrate-category-sort-order.js';
import { migrateTransactionSplits } from './db/migrate-transaction-splits.js';
import { authenticate } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/accounts.js';
import categoryRoutes from './routes/categories.js';
import userRoutes from './routes/users.js';
import transactionRoutes from './routes/transactions.js';
import dashboardRoutes from './routes/dashboard.js';
import budgetRoutes from './routes/budgets.js';
import reportRoutes from './routes/reports.js';
import balanceRoutes from './routes/balances.js';
import assetRoutes from './routes/assets.js';
import networthRoutes from './routes/networth.js';
import importRoutes from './routes/import.js';
import simplefinRoutes from './routes/simplefin.js';
import setupRoutes from './routes/setup.js';
import twofaRoutes from './routes/twofa.js';
import devRoutes from './routes/dev.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// Run migrations
migrateAccountOwners(sqlite);
migrateSimplefin(sqlite);
migrateAssetsDepreciation(sqlite);
migrateRolesPermissions(sqlite);
migrateDevStorage(sqlite);
migrate2FA(sqlite);
migrateCategorySortOrder(sqlite);
migrateTransactionSplits(sqlite);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors(isProd ? { origin: false } : { origin: 'http://localhost:5173', credentials: true }));
app.use((req, res, next) => {
  // Skip JSON body parsing for multipart file uploads
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) return next();
  express.json()(req, res, next);
});

// Auth middleware — applied to all /api/* routes
app.use('/api', authenticate);

// Routes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/auth/2fa', twofaRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/balances', balanceRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/networth', networthRoutes);
app.use('/api/import', importRoutes);
app.use('/api/simplefin', simplefinRoutes);
if (!isProd) {
  app.use('/api/dev', devRoutes);
}

// Global error handler (must be after all routes)
app.use(errorHandler);

// Production: serve client static files and SPA fallback
if (isProd) {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*path', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}${isProd ? ' (production)' : ''}`);
});

export { app, db };
