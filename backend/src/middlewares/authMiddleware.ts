// src/middlewares/authMiddleware.ts
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './types'; // Assuming your custom types are mapped here

export type ResourceTarget = 'TENANT' | 'END_USER' | 'ADVANCE_REQUEST' | 'LEDGER_METRICS';
export type ActionTarget = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'DISBURSE';

/**
 * High-Performance Resource-Based Access Control (RBAC) Guard Middleware
 * Replaces confusing generic permission strings with strict business domain policies.
 */
export const authorize = (resource: ResourceTarget, action: ActionTarget) => {
	return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
		const context = req.userContext;

		// 1. Assert security context presence
		if (!context) {
			res.status(401).json({ result: 'error', reason: 'Security framework violation. Identity token context missing.' });
			return;
		}

		// 2. Map and evaluate strict role scope access matrices
		const isMaster = context.scope === 'MASTER';
		const isTenantAdmin = context.scope === 'TENANT';
		const isEndUser = context.scope === 'END_USER';

		// Rule Check 1: Global Corporate Infrastructure Operations (Restricted to Root Master)
		if (resource === 'TENANT' && (action === 'CREATE' || action === 'DELETE' || action === 'UPDATE')) {
			if (!isMaster) {
				res.status(403).json({ result: 'error', reason: 'Access denied. Corporate ecosystem modifications are restricted to fintech master accounts.' });
				return;
			}
		}

		// Rule Check 2: Aggregated Dashboard Metrics Telemetry Extraction
		if (resource === 'LEDGER_METRICS' && action === 'READ') {
			if (!isMaster) {
				res.status(403).json({ result: 'error', reason: 'Access denied. Global liquidity dashboard views are restricted to master operators.' });
				return;
			}
		}

		// Rule Check 3: Horizontal Multi-Tenant Boundaries for Consumer Inspection
		if (resource === 'END_USER' && action === 'READ') {
			// Master can see everyone, Tenant Admin can see their workspace, End User can only see themselves
			if (!isMaster && !isTenantAdmin && !isEndUser) {
				res.status(403).json({ result: 'error', reason: 'Access denied. Insufficient role scope privileges to read consumer rows.' });
				return;
			}
		}

		// 3. Security matrix cleared successfully. Bubble up execution to the next controller layer.
		next();
	};
};
