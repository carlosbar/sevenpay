// src/middlewares/authMiddleware.ts
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './types';
import { ResourceTarget, ScopeTarget, ActionTarget, PermissionGuardTuple } from '../config/security.enums';

/**
 * Strict Enum-Based Access Control (RBAC) Gate Guard
 * Evaluates fine-grained multi-tenant tuple structures injected directly by each controller.
 */
export const authorize = (resource: ResourceTarget, allowedPolicies: PermissionGuardTuple[]) => {
	return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
		const context = req.userContext;

		// 1. Assert platform security context presence
		if (!context) {
			res.status(401).json({ result: 'error', reason: 'Security framework violation. Identity token context missing.' });
			return;
		}

		// 2. Extract current operator metadata from the decrypted JWT payload
		const currentScope = context.scope as ScopeTarget;
		
		// Automatically determine the runtime execution action based on the RESTful HTTP Verb
		let currentAction: ActionTarget = ActionTarget.READ;
		if (req.method === 'POST') currentAction = ActionTarget.CREATE;
		if (req.method === 'PUT') currentAction = ActionTarget.UPDATE;
		if (req.method === 'DELETE') currentAction = ActionTarget.DELETE;

		// 3. Evaluate the security policy tuple array
		const hasValidCredentials = allowedPolicies.some(([scope, action]) => {
			return scope === currentScope && action === currentAction;
		});

		if (!hasValidCredentials) {
			res.status(403).json({ 
				result: 'error', 
				reason: `Access denied. Insufficient role privileges to perform ${currentAction} operations over the ${resource} layer.` 
			});
			return;
		}

		// 4. Security clearance approved. Pass execution vector down to the operational controller pipeline.
		next();
	};
};
