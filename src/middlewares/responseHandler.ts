// src/middlewares/responseHandler.ts
import { Request, Response, NextFunction } from 'express';

/**
 * Global Error Handling Middleware.
 * Intercepts all runtime exceptions and forces the uniform JSON {"result": "error", "reason": "..."} envelope.
 */
export function errorHandler(
  err: any, 
  req: Request, 
  res: Response, 
  next: NextFunction
): void {
  console.error('Core Engine Exception Caught:', err);

  // PostgreSQL specific error handling examples
  if (err.code === '23505') { // Unique violation code
    res.status(409).json({
      result: 'error',
      reason: 'A record with these unique identifiers already exists in the system database.'
    });
    return;
  }

  const statusCode = err.statusCode || 500;
  const reasonMessage = err.message || 'An unexpected internal ledger or processing error occurred.';

  res.status(statusCode).json({
    result: 'error',
    reason: reasonMessage
  });
}
