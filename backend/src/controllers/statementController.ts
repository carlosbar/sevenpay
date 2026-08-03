// src/controllers/statementController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';
import { ScopeTarget, ActionTarget } from '../config/security.enums';

class StatementController {

	/**
	 * @openapi
	 * /api/v1/statements/history:
	 *   get:
	 *     summary: Retrieve immutable transaction financial ledger logs for a specific consumer
	 *     description: Fetches transactional history records from the append-only ledger. Requires both tenantId and endUserId query parameters. Enforces identity cross-checks to prevent horizontal privilege escalation for END_USER scopes.
	 *     tags:
	 *       - Financial Statement
	 *     security:
	 *       - BearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: tenantId
	 *         required: true
	 *         schema:
	 *           type: string
	 *       - in: query
	 *         name: endUserId
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Financial ledger logs compiled successfully
	 *       403:
	 *         description: Access denied due to identity mismatch fraud detection
	 *       422:
	 *         description: Validation failed due to missing required filtration query vectors
	 */
	public async getHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		try {
			const context = req.userContext;

			if (!context) {
				throw { statusCode: 401, message: 'Security framework violation. Authenticated transaction profile context missing.' };
			}

			const limit = parseInt(req.query.limit as string, 10) || 20;
			const offset = parseInt(req.query.offset as string, 10) || 0;
			
			let targetTenantId = req.query.tenantId as string || null;
			let targetEndUserId = req.query.endUserId as string || null;

			// 1. Strict identity cross-check rule for the END_USER authority layer
			if (context.scope === ScopeTarget.END_USER) {
				// Prevent fraud by forcing the filter vectors to match the securely encrypted token context
				if (!context.endUserId || !context.tenantId) {
					throw { statusCode: 403, message: 'Security violation. Your account token lacks valid consumer mapping contexts.' };
				}
				
				// Enforce alignment or override query inputs with token metadata parameters
				if (targetEndUserId !== context.endUserId || targetTenantId !== context.tenantId) {
					throw { statusCode: 403, message: 'Access denied. Security matrix mismatch detected. You are strictly forbidden from auditing third-party ledger histories.' };
				}
			}

			// 2. Enforce strict parameter presence barrier for administrative or validated lookups
			if (!targetTenantId || !targetEndUserId) {
				throw { statusCode: 422, message: 'Validation failed. Both tenantId and endUserId query parameters are strictly required for this ledger transaction.' };
			}

			const queryParams: any[] = [limit, offset, targetEndUserId, targetTenantId];

			// 3. High-Performance Unified Query Strategy cross-checking relations directly from PostgreSQL 18
			const statementQuery = `
				SELECT t.id, t.advance_request_id AS "advanceRequestId", t.type, t.amount_cents::text AS "amountCents", t.created_at AS "createdAt"
				FROM financial_transactions t
				JOIN end_users u ON u.id = t.end_user_id
				WHERE t.end_user_id = $3 
				  AND u.tenant_id = $4
				ORDER BY t.created_at DESC
				LIMIT $1 OFFSET $2;
			`;

			const ledgerResult = await db.query(statementQuery, queryParams);

			// 4. Dispatch standard unified success payload back to UI grid
			res.status(200).json({
				result: 'success',
				data: {
					transactions: ledgerResult.rows
				}
			});

		} catch (error) {
			next(error);
		}
	}
}

const statementController = new StatementController();

// Map route setup contract structure for automated node server injection framework
export const routeConfig = {
	method: 'get',
	path: '/api/v1/statements/history',
	handler: [
		// 🛡️ Universal policy configuration matrix checking administrative credentials for the operational GET verb
		authorize([
			{ method: 'GET', scope: ScopeTarget.MASTER,   action: ActionTarget.READ },
			{ method: 'GET', scope: ScopeTarget.TENANT,   action: ActionTarget.READ },
			{ method: 'GET', scope: ScopeTarget.END_USER, action: ActionTarget.READ }
		]),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => statementController.getHistory(req, res, next)
	]
};
