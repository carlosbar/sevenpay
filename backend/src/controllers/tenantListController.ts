// src/controllers/tenantListController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';

class TenantListController {

	/**
	 * @openapi
	 * /api/v1/admin/tenants:
	 *   get:
	 *     summary: List all corporate tenants
	 *     description: Retrieves a paginated list of all B2B partner companies provisioned in the ecosystem. Restricted to master operations.
	 *     tags:
	 *       - Admin Dashboard
	 *     security:
	 *       - BearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *           default: 10
	 *         description: Maximum number of records to return
	 *       - in: query
	 *         name: offset
	 *         schema:
	 *           type: integer
	 *           default: 0
	 *         description: Initial rows to skip for pagination
	 *     responses:
	 *       200:
	 *         description: Tenant registers fetched successfully
	 *       401:
	 *         description: Authenticated profile context missing
	 *       403:
	 *         description: Access denied for non-master operators
	 */
	public async listTenants(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		try {
			const context = req.userContext;

			if (!context) {
				throw { statusCode: 401, message: 'Security framework violation. Authenticated profile context missing.' };
			}

			// Enforce master operational barrier
			if (context.scope !== 'MASTER') {
				throw { statusCode: 403, message: 'Access denied. Corporate listing is restricted to core fintech administrators.' };
			}

			const limit = parseInt(req.query.limit as string, 10) || 10;
			const offset = parseInt(req.query.offset as string, 10) || 0;

			const query = `
				SELECT id, cnpj, name, business_type AS "businessType", global_credit_limit_cents::text AS "globalCreditLimitCents", created_at AS "createdAt"
				FROM tenants
				ORDER BY name ASC
				LIMIT $1 OFFSET $2;
			`;

			const result = await db.query(query, [limit, offset]);

			res.status(200).json({
				result: 'success',
				data: {
					tenants: result.rows
				}
			});

		} catch (error) {
			next(error);
		}
	}
}

const tenantListController = new TenantListController();

export const routeConfig = {
	method: 'get',
	path: '/api/v1/admin/tenants',
	handler: [
		authorize('read'),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => tenantListController.listTenants(req, res, next)
	]
};
