// src/middlewares/authMiddleware.ts
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './types';
import { ScopeTarget, ActionTarget } from '../config/security.enums';

// Strategy locations telling the guard where to capture the requested resource IDs
export type IdSourceLocation = 'query' | 'body' | 'params';

export interface PolicyGuardRule {
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	scope: ScopeTarget;
	action: ActionTarget;
	/** Dynamically validates if the extracted Tenant UUID belongs to the token holder context */
	validateTenantIdFrom?: IdSourceLocation;
	/** Dynamically validates if the extracted EndUser UUID belongs to the token holder context */
	validateEndUserIdFrom?: IdSourceLocation;
}

/**
 * High-Performance Universal Matrix Guard Middleware
 * Features automated anti-fraud horizontal cross-checking for multi-tenant data containment.
 */
export const authorize = (rulesMatrix: PolicyGuardRule[]) => {
	return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
		const context = req.userContext;

		if (!context) {
			res.status(401).json({ result: 'error', reason: 'Security framework violation. Identity token context missing.' });
			return;
		}

		const currentMethod = req.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
		const currentScope = context.scope as ScopeTarget;

		// Helper method to dynamically fish target IDs from incoming request vectors safely
		const extractId = (loc: IdSourceLocation | undefined, key: string): string | null => {
			if (!loc) return null;
			return (req[loc] && req[loc][key]) ? (req[loc][key] as string) : null;
		};

		// Evaluate matrix policies to find a valid rule matching the transaction signature
		const hasValidCredentials = rulesMatrix.some(rule => {
			// A. Match baseline signature
			const matchSignature = rule.method === currentMethod && rule.scope === currentScope;
			if (!matchSignature) return false;

			// MASTER scope is omnipotent and bypasses cross-checks
			if (currentScope === ScopeTarget.MASTER) return true;

			// B. Enforce Horizontal Tenant Cross-Check Bounds via strict validation
			if (rule.validateTenantIdFrom) {
				const requestedTenantId = extractId(rule.validateTenantIdFrom, 'tenantId');
				if (!requestedTenantId || requestedTenantId !== context.tenantId) {
					return false;
				}
			}

			// C. Enforce Horizontal EndUser Cross-Check Bounds via strict validation
			if (rule.validateEndUserIdFrom) {
				const requestedEndUserId = extractId(rule.validateEndUserIdFrom, 'endUserId');
				if (!requestedEndUserId || requestedEndUserId !== context.endUserId) {
					return false;
				}
			}

			return true;
		});

		if (!hasValidCredentials) {
			res.status(403).json({ 
				result: 'error', 
				reason: `Access denied. Anti-fraud security violation triggered over the requested multi-tenant resource boundaries.` 
			});
			return;
		}

		next();
	};
};
