// src/controllers/tenantSettlementController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';

class TenantSettlementController {

	/**
	 * @openapi
	 * /api/v1/tenants/settlements:
	 *   get:
	 *     summary: Retrieve corporate settlement batches paid by a tenant
	 *     description: Fetches the historical log of consolidated bulk repayments made by a B2B tenant. Enforces multi-tenant data boundaries, restricting company operators to their own data scope.
	 *     tags:
	 *       - Tenant Workspace
	 *     security:
	 *       - BearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: tenantId
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *         description: The company UUID (Optional for TENANT scope, required for MASTER auditing scope)
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
	 *                     batches:
	 *                       type: array
	 *                       items:
	 *                         type: object
	 *                         properties:
	 *                           id:
	 *                             type: string
	 *                             format: uuid
	 *                           billingCompetence:
	 *                             type: string
	 *                             example: "2026-08"
	 *                           totalSettledCents:
	 *                             type: string
	 *                             example: "1500000"
	 *                           createdAt:
	 *                             type: string
	 *                             format: date-time
	 */
	public async getTenantBatches(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		try {
			const context = req.userContext;

			if (!context) {
				throw { statusCode: 401, message: 'Security framework violation. Authenticated profile context missing.' };
			}

			const limit = parseInt(req.query.limit as string, 10) || 10;
			const offset = parseInt(req.query.offset as string, 10) || 0;
			
			let targetTenantId: string | null = null;

			// 1. Enforce strict B2B isolation boundaries based on operational scopes
			if (context.scope === 'TENANT') {
				if (!context.tenantId) {
					throw { statusCode: 403, message: 'Context violation. Operator account is not bound to a corporate tenant.' };
				}
				// Company operators can NEVER forge or swap their company ID payload
				targetTenantId = context.tenantId;
			} else if (context.scope === 'MASTER') {
				// Master administrative operators (SYSADMIN) must supply a query parameter to inspect specific companies
				targetTenantId = (req.query.tenantId as string) || null;
				if (!targetTenantId && context.role !== 'SYSADMIN') {
					throw { statusCode: 422, message: 'Processing failed. Admin query parameters must specify a target tenantId identifier.' };
				}
			} else {
				throw { statusCode: 403, message: 'Access denied. End users are forbidden from checking corporate settlement matrices.' };
			}

			// 2. Build dynamic queries using performance-tuned indexes with explicit string casts for BIGINT cents
			let batchQuery = '';
			const queryParams: any[] = [limit, offset];

			if (targetTenantId) {
				batchQuery = `
					SELECT id, billing_competence AS "billingCompetence", total_settled_cents::text AS "totalSettledCents", created_at AS "createdAt"
					FROM tenant_settlement_batches
					WHERE tenant_id = $3
					ORDER BY created_at DESC
					LIMIT $1 OFFSET $2;
				`;
				queryParams.push(targetTenantId);
			} else {
				// Global fallback for root SYSADMIN diagnostic dashboards without specific company filter
				batchQuery = `
					SELECT id, tenant_id AS "tenantId", billing_competence AS "billingCompetence", total_settled_cents::text AS "totalSettledCents", created_at AS "createdAt"
					FROM tenant_settlement_batches
					ORDER BY created_at DESC
					LIMIT $1 OFFSET $2;
				`;
			}

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
		authorize('read'), // Protects the layer checking RBAC access matrix parameters before resource ingestion
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => tenantSettlementController.getTenantBatches(req, res, next)
	]
};
