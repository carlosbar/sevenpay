// src/middlewares/authMiddleware.ts
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './types';
import { ResourceTarget, ScopeTarget, ActionTarget } from '../config/security.enums';

// Explicit type checking structure representing a single cryptographic policy rule
export interface PolicyGuardRule {
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	scope: ScopeTarget;
	action: ActionTarget;
}

/**
 * Universal Matrix-Based Access Control (MBAC) Guard Middleware
 * Dynamically cross-checks HTTP Operations, Scopes, and Required Actions via injected arrays.
 */
export const authorize = (resource: ResourceTarget, rulesMatrix: PolicyGuardRule[]) => {
	return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
		const context = req.userContext;

		// 1. Assert security context presence
		if (!context) {
			res.status(401).json({ result: 'error', reason: 'Security framework violation. Identity token context missing.' });
			return;
		}

		// 2. Extract operational vectors from the active traffic request and token
		const currentMethod = req.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
		const currentScope = context.scope as ScopeTarget;

		// 3. Evaluate matrix policies to grant access execution clearance
		// Iterates over the array checking if the tuple rules match the incoming transaction signature
		const hasValidCredentials = rulesMatrix.some(rule => {
			return rule.method === currentMethod && 
			       rule.scope === currentScope && 
			       (rule.action === ActionTarget.CREATE || 
			        rule.action === ActionTarget.UPDATE || 
			        rule.action === ActionTarget.READ || 
			        rule.action === ActionTarget.DELETE);
		});

		if (!hasValidCredentials) {
			res.status(403).json({ 
				result: 'error', 
				reason: `Access denied. Insufficient administrative policy permissions to perform ${currentMethod} operations over the ${resource} domain.` 
			});
			return;
		}

		// 4. Security clearance verified successfully. Bubble up execution to the controller layer.
		next();
	};
};
const tenantCreateController = new TenantCreateController();

// Export the dynamic automated discovery route specification mapping contract
export const routeConfig = {
	method: 'post',
	path: '/api/v1/admin/tenants',
	handler: [
		// 🛡️ Multi-rule policy configuration array mapping exact operational matrices
		authorize(ResourceTarget.TENANT, [
			{ method: 'POST', scope: ScopeTarget.MASTER, action: ActionTarget.CREATE },
			{ method: 'PUT',  scope: ScopeTarget.MASTER, action: ActionTarget.UPDATE }
		]), 
		validateBody(createTenantSchema),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => tenantCreateController.createTenant(req, res, next)
	]
};
