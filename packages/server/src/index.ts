import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { db, sqlite } from './db/index.js';
import { uploadsDir } from './services/uploads.js';
import { runMigrations } from './db/migrate.js';
import { authenticate } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/accounts.js';
import financialInstitutionRoutes from './routes/financialInstitutions.js';
import categoryRoutes from './routes/categories.js';
import userRoutes from './routes/users.js';
import transactionRoutes from './routes/transactions.js';
import merchantRoutes from './routes/merchants.js';
import categoryRuleRoutes from './routes/categoryRules.js';
import reviewRoutes from './routes/reviews.js';
import notificationRoutes from './routes/notifications.js';
import investmentRoutes from './routes/investments.js';
import dashboardRoutes from './routes/dashboard.js';
import budgetRoutes from './routes/budgets.js';
import reportRoutes from './routes/reports.js';
import balanceRoutes from './routes/balances.js';
import assetRoutes from './routes/assets.js';
import networthRoutes from './routes/networth.js';
import importRoutes from './routes/import.js';
import simplefinRoutes from './routes/simplefin.js';
import llmRoutes from './routes/llm.js';
import amazonRoutes from './routes/amazon.js';
import benchmarkRoutes from './routes/benchmarks.js';
import setupRoutes from './routes/setup.js';
import twofaRoutes from './routes/twofa.js';
import recurringRoutes from './routes/recurring.js';
import { errorHandler } from './middleware/errorHandler.js';
import { startDailyScheduler } from './services/scheduler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// Run migrations (the full ordered chain lives in db/migrate.ts, shared with the seed)
runMigrations(sqlite);

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
app.use('/api/financial-institutions', financialInstitutionRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/merchants', merchantRoutes);
app.use('/api/category-rules', categoryRuleRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/balances', balanceRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/networth', networthRoutes);
app.use('/api/import', importRoutes);
app.use('/api/simplefin', simplefinRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/amazon', amazonRoutes);
app.use('/api/benchmarks', benchmarkRoutes);

// Uploaded images (account avatars, merchant logos) — public (referenced by <img>),
// served in dev + prod, before the SPA catch-all. Harden the response so a stored
// file can never execute as script in this origin: a locked-down CSP, no MIME
// sniffing, and a non-inline disposition (belt-and-suspenders on top of the
// raster-only + magic-byte checks in services/uploads.ts).
app.use('/uploads', (_req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  next();
}, express.static(uploadsDir));

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

// Daily SimpleFIN auto-pull (+ benchmark prices + budget-exceeded sweep) with
// boot catch-up + retry — guarantees at-least-once per day the server is up.
startDailyScheduler();

export { app, db };
