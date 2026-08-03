// src/controllers/endUserListController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';
import { ScopeTarget, ActionTarget } from '../config/security.enums';

class EndUserListController {

	/**
	 * @openapi
	 * /api/v1/end-users:
	 *   get:
	 *     summary: List registered credit consumers (End Users) filtered by tenant
	 *     description: Retrieves registered consumers bound strictly to a target B2B partner workspace passed via query parameters. Calculates credit margins in real-time.
	 *     tags:
	 *       - Administration Lookup
	 *     security:
	 *       - BearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: tenantId
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Strict UUID identifier to isolate and fetch consumer data rows
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
	 *         description: Consumer profiles for the specified partner compiled successfully
	 *       422:
	 *         description: Validation failed due to missing required tenant identifier vector
	 */
	public async listEndUsers(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		try {
			const context = req.userContext;

			if (!context) {
				throw { statusCode: 401, message: 'Security framework violation. Authenticated profile context missing.' };
			}

			const limit = parseInt(req.query.limit as string, 10) || 20;
			const offset = parseInt(req.query.offset as string, 10) || 0;
			const targetTenantId = req.query.tenantId as string || null;

			// 1. Enforce strict parameter presence barrier to isolate workspace lookups
			if (!targetTenantId) {
				throw { statusCode: 422, message: 'Validation failed. The tenantId query parameter is strictly required for this ledger transaction.' };
			}

			const queryParams: any[] = [limit, offset, targetTenantId];

			// 2. High-Performance Unified Query Strategy computing real-time margins directly from PostgreSQL 18
			const findQuery = `
				SELECT 
					u.id, 
					u.external_id AS "externalId", 
					u.name, 
					u.monthly_contract_value_cents::text AS "monthlyContractValueCents", 
					(
						COALESCE((u.monthly_contract_value_cents * m.max_advance_percentage / 100), 0) - 
						COALESCE((
							SELECT SUM(r.requested_amount_cents) 
							FROM advance_requests r 
							WHERE r.end_user_id = u.id 
							  AND r.status != 'REJECTED' 
							  AND r.created_at >= date_trunc('month', current_timestamp)
						), 0)
					)::text AS "marginAvailableCents", 
					u.status, 
					u.created_at AS "createdAt"
				FROM end_users u
				LEFT JOIN tenant_fee_matrices m ON m.tenant_id = u.tenant_id AND m.installments_count = 1
				WHERE u.tenant_id = $3
				ORDER BY u.name ASC
				LIMIT $1 OFFSET $2;
			`;

			const result = await db.query(findQuery, queryParams);

			res.status(200).json({
				result: 'success',
				data: {
					endUsers: result.rows
				}
			});

		} catch (error) {
			next(error);
		}
	}
}

const endUserListController = new EndUserListController();

// Export the dynamic automated discovery route specification mapping contract
export const routeConfig = {
	method: 'get',
	path: '/api/v1/end-users',
	handler: [
		// 🛡️ Universal policy configuration matrix checking administrative credentials with anti-fraud cross-checks
		authorize([
			{ method: 'GET', scope: ScopeTarget.MASTER, action: ActionTarget.READ },
			{ method: 'GET', scope: ScopeTarget.TENANT, action: ActionTarget.READ, validateTenantIdFrom: 'query' }
		]),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => endUserListController.listEndUsers(req, res, next)
	]
};
