// src/controllers/statementController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';

class StatementController {

	/**
	 * @openapi
	 * /api/v1/statements/history:
	 *   get:
	 *     summary: Retrieve immutable transaction financial ledger logs
	 *     description: Fetches transactional history records from the append-only ledger. Applies strict multi-tenant boundary filtration based on JWT contexts to shield horizontal data access.
	 *     tags:
	 *       - Financial Statement
	 *     security:
	 *       - BearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *           default: 20
	 *         description: Maximum quantity of logs returned per request partition
	 *       - in: query
	 *         name: offset
	 *         schema:
	 *           type: integer
	 *           default: 0
	 *         description: Number of initial ledger log lines to skip for pagination
	 *     responses:
	 *       200:
	 *         description: Financial ledger query executed successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 result:
	 *                   type: string
	 *                   example: "success"
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     transactions:
	 *                       type: array
	 *                       items:
	 *                         type: object
	 *                         properties:
	 *                           id:
	 *                             type: string
	 *                             format: uuid
	 *                           advanceRequestId:
	 *                             type: string
	 *                             format: uuid
	 *                           type:
	 *                             type: string
	 *                             example: "DEBIT"
	 *                           amountCents:
	 *                             type: string
	 *                             example: "50000"
	 *                           createdAt:
	 *                             type: string
	 *                             format: date-time
	 *       401:
	 *         description: Missing or invalid authentication token context
	 *       403:
	 *         description: Lack of authorization matrix profile parameters
	 */
	public async getHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		try {
			const context = req.userContext;

			if (!context) {
				throw { statusCode: 401, message: 'Security framework violation. Authenticated transaction profile context missing.' };
			}

			// 1. Extract dynamic configuration inputs for pagination control
			const limit = parseInt(req.query.limit as string, 10) || 20;
			const offset = parseInt(req.query.offset as string, 10) || 0;

			let statementQuery = '';
			const queryParams: any[] = [limit, offset];

			// 2. Multi-tenant routing rule gate based on user security scope matrix
			if (context.scope === 'END_USER') {
				// Rigid data encapsulation: End users are locked exclusively into their signed end_user_id
				if (!context.endUserId) {
					throw { statusCode: 403, message: 'Context violation. This authenticated account is not mapped to a consumer profile.' };
				}

				statementQuery = `
					SELECT id, advance_request_id, type, amount_cents::text AS "amountCents", created_at AS "createdAt"
					FROM financial_transactions
					WHERE end_user_id = $3
					ORDER BY created_at DESC
					LIMIT $1 OFFSET $2;
				`;
				queryParams.push(context.endUserId);
			} else if (context.scope === 'TENANT') {
				// Isolation verification for business tenant operators
				if (!context.tenantId) {
					throw { statusCode: 403, message: 'Context violation. This authenticated account is not mapped to a business enterprise tenant.' };
				}

				statementQuery = `
					SELECT t.id, t.advance_request_id, t.type, t.amount_cents::text AS "amountCents", t.created_at AS "createdAt"
					FROM financial_transactions t
					JOIN end_users u ON u.id = t.end_user_id
					WHERE u.tenant_id = $3
					ORDER BY t.created_at DESC
					LIMIT $1 OFFSET $2;
				`;
				queryParams.push(context.tenantId);
			} else {
				// Global master dashboard visibility access for auditing management teams (SYSADMIN, MASTER_ADMIN)
				statementQuery = `
					SELECT id, advance_request_id, type, amount_cents::text AS "amountCents", created_at AS "createdAt"
					FROM financial_transactions
					ORDER BY created_at DESC
					LIMIT $1 OFFSET $2;
				`;
			}

			// 3. Execute isolated parameterized transaction log fetch from Postgres pool
			const ledgerResult = await db.query(statementQuery, queryParams);

			// 4. Dispatch standard unified success payload back to UI grid
			res.status(200).json({
				result: 'success',
				data: {
					transactions: ledgerResult.rows
				}
			});

		} catch (error) {
			next(error); // Bubble exception up to global json envelope parser middleware
		}
	}
}

const statementController = new StatementController();

// Map route setup contract structure for automated node server injection framework
export const routeConfig = {
	method: 'get',
	path: '/api/v1/statements/history',
	handler: [
		authorize('read'), // Asserts RBAC permission rules allow data extraction view
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => statementController.getHistory(req, res, next)
	]
};
