// src/controllers/tenantSettlementController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';
import { ScopeTarget, ActionTarget } from '../config/security.enums';

class TenantSettlementController {

	/**
	 * @openapi
	 * /api/v1/tenants/settlements:
	 *   get:
	 *     summary: Retrieve corporate settlement batches paid by a tenant
	 *     description: Fetches the historical log of consolidated bulk repayments made by a B2B tenant. Enforces multi-tenant data boundaries via declarative route guard layers. Calculates tracking arrays linearly.
	 *     tags:
	 *       - Tenant Workspace
	 *     security:
	 *       - BearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: tenantId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *         description: Strict UUID identifier used by the dynamic matrix route guard layer to isolate data visibility.
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *           default: 10
	 *         description: Maximum number of batch records to return
	 *       - in: query
	 *         name: offset
	 *         schema:
	 *           type: integer
	 *           default: 0
	 *         description: Initial rows to skip for pagination
	 *     responses:
	 *       200:
	 *         description: Settlement history logs retrieved successfully
	 *       422:
	 *         description: Processing failed due to missing required filtration query vectors
	 */
	public async getTenantBatches(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		try {
			const context = req.userContext;

			if (!context) {
				throw { statusCode: 401, message: 'Security framework violation. Authenticated profile context missing.' };
			}

			const limit = parseInt(req.query.limit as string, 10) || 10;
			const offset = parseInt(req.query.offset as string, 10) || 0;
			const targetTenantId = req.query.tenantId as string || null;

			// 1. Enforce strict parameter presence barrier to isolate ledger lookups before database scan
			if (!targetTenantId) {
				throw { statusCode: 422, message: 'Validation failed. The tenantId query parameter is strictly required for this ledger transaction.' };
			}

			const queryParams: any[] = [limit, offset, targetTenantId];

			// 2. High-Performance Unified Query Strategy extracting historical batches with explicit string casts for BIGINT cents
			const batchQuery = `
				SELECT id, billing_competence AS "billingCompetence", total_settled_cents::text AS "totalSettledCents", created_at AS "createdAt"
				FROM tenant_settlement_batches
				WHERE tenant_id = $3
				ORDER BY created_at DESC
				LIMIT $1 OFFSET $2;
			`;

			const queryResult = await db.query(batchQuery, queryParams);

			// 3. Dispatch standard unified success envelope down to the UI panel grid layout
			res.status(200).json({
				result: 'success',
				data: {
					batches: queryResult.rows
				}
			});

		} catch (error) {
			next(error);
		}
	}
}

const tenantSettlementController = new TenantSettlementController();

// Export the dynamic automated discovery route specification mapping contract
export const routeConfig = {
	method: 'get',
	path: '/api/v1/tenants/settlements',
	handler: [
		// 🛡️ Advanced Declarative Security Matrix protecting parameters via automated validation cross-checks
		authorize([
			{ method: 'GET', scope: ScopeTarget.MASTER, action: ActionTarget.READ },
			{ method: 'GET', scope: ScopeTarget.TENANT, action: ActionTarget.READ, validateTenantIdFrom: 'query' }
		]),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => tenantSettlementController.getTenantBatches(req, res, next)
	]
};
