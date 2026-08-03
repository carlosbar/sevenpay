// backend/src/middlewares/authMiddleware.ts
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './types';
import { ScopeTarget, ActionTarget } from '../config/security.enums';

export interface PolicyGuardRule {
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	scope: ScopeTarget | string; // 🔄 FIXED: Accept both Enum and raw string descriptors from DB
	action: ActionTarget | string;
	validateTenantIdFrom?: 'query' | 'body' | 'params';
	validateEndUserIdFrom?: 'query' | 'body' | 'params';
}

/**
 * High-Performance Universal Matrix Guard Middleware
 * Features automated anti-fraud horizontal cross-checking for multi-tenant data containment.
 */
export const authorize = (rulesMatrix: PolicyGuardRule[]) => {
	return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
		const context = req.userContext;

		if (!context) {
			res.status(401).json({ result: 'error', errorToken: 'AUTH_TOKEN_MISSING', reason: 'Identity token context missing.' });
			return;
		}

		// 🔄 FIXED: Enforce absolute uppercase normalization across execution strings
		const currentMethod = req.method.toUpperCase();
		const currentScope = String(context.scope).toUpperCase();

		const extractId = (loc: 'query' | 'body' | 'params' | undefined, key: string): string | null => {
			if (!loc) return null;
			return (req[loc] && req[loc][key]) ? String(req[loc][key]) : null;
		};

		// Evaluate matrix policies to find a valid rule matching the transaction signature
		const hasValidCredentials = rulesMatrix.some(rule => {
			const ruleMethod = rule.method.toUpperCase();
			const ruleScope = String(rule.scope).toUpperCase();

			// A. Match baseline HTTP signature and Role Scope parameters
			const matchSignature = ruleMethod === currentMethod && ruleScope === currentScope;
			if (!matchSignature) return false;

			// MASTER scope is omnipotent and bypasses cross-checks
			if (currentScope === 'MASTER') return true;

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
			// 🔄 DIAGNOSTIC EDGE: Returns 403 instead of blind 401 to clearly state signature mismatch vs missing token
			res.status(403).json({ 
				result: 'error', 
				errorToken: 'RBAC_FORBIDDEN_MATRIX',
				reason: `Access denied. Insufficient administrative privileges for scope ${currentScope} over method ${currentMethod}.` 
			});
			return;
		}

		next();
	};
};
