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
	 *     description: Fetches transactional history records from the append-only ledger. Requires both tenantId and endUserId query parameters. Perimeter protection and anti-fraud cross-checks are managed entirely by the declarative route guard layer.
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
	 *         description: Strict UUID identifier of the target corporate partner company
	 *       - in: query
	 *         name: endUserId
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Strict UUID identifier of the target consumer profile
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *           default: 20
	 *       - in: query
	 *         name: offset
	 *         schema:
	 *           type: integer
	 *           default: 0
	 *     responses:
	 *       200:
	 *         description: Financial ledger logs compiled successfully
	 *       422:
	 *         description: Validation failed due to missing required filtration query vectors
	 */
	public async getHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		try {
			const context = req.userContext;

			if (!context) {
				throw { statusCode: 401, errorToken: 'AUTH_CREDENTIALS_INVALID' };
			}

			// 1. Extract and enforce pagination and strict data isolation parameter constraints
			const limit = parseInt(req.query.limit as string, 10) || 20;
			const offset = parseInt(req.query.offset as string, 10) || 0;
			const targetTenantId = req.query.tenantId as string || null;
			const targetEndUserId = req.query.endUserId as string || null;

			// 2. Enforce strict parameter presence barrier to isolate ledger lookups before database scan
			if (!targetTenantId || !targetEndUserId) {
				throw { statusCode: 422, errorToken: 'QUERY_FILTRATION_VECTORS_REQUIRED' };
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
		// 🛡️ Advanced Declarative Security Matrix protecting properties via automated validation cross-checks
		authorize([
			{ method: 'GET', scope: ScopeTarget.MASTER,   action: ActionTarget.READ },
			{ method: 'GET', scope: ScopeTarget.TENANT,   action: ActionTarget.READ, validateTenantIdFrom: 'query' },
			{ method: 'GET', scope: ScopeTarget.END_USER, action: ActionTarget.READ, validateTenantIdFrom: 'query', validateEndUserIdFrom: 'query' }
		]),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => statementController.getHistory(req, res, next)
	]
};
