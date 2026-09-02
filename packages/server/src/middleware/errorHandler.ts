import { Request, Response, NextFunction } from 'express';

/**
 * Global error handler — one JSON shape for everything that escaped a route.
 * Upload errors from multer map to client-side statuses; everything else is a
 * 500 whose message is only exposed when LEDGER_DEBUG=1 (a self-host commonly
 * runs without NODE_ENV=production, so "not production" is not a safe gate).
 */
export function errorHandler(err: Error & { code?: string; name?: string }, _req: Request, res: Response, _next: NextFunction): void {
  if (err.name === 'MulterError') {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'File is too large' : `Upload rejected: ${err.message}` });
    return;
  }

  console.error('Unhandled error:', err);

  const statusCode = res.statusCode && res.statusCode >= 400 ? res.statusCode : 500;
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : err.message,
    ...(process.env.LEDGER_DEBUG === '1' && { details: err.message }),
  });
}
