// src/controllers/endUserListController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';

class EndUserListController {

	/**
	 * @openapi
	 * /api/v1/end-users:
	 *   get:
	 *     summary: List registered credit consumers (End Users)
	 *     description: Retrieves registered consumers. If accessed by a corporate TENANT role, forces isolation constraints to display only users belonging to that specific workspace.
	 *     tags:
	 *       - Administration Lookup
	 *     security:
	 *       - BearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *           default: 20
	 *         description: Maximum number of consumer records to return
	 *       - in: query
	 *         name: offset
	 *         schema:
	 *           type: integer
	 *           default: 0
	 *         description: Initial rows to skip for pagination
	 *     responses:
	 *       200:
	 *         description: End user profiles compiled successfully
	 *       403:
	 *         description: Access denied due to context boundary violations
	 */
	public async listEndUsers(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		try {
			const context = req.userContext;

			if (!context) {
				throw { statusCode: 401, message: 'Security framework violation. Authenticated profile context missing.' };
			}

			const limit = parseInt(req.query.limit as string, 10) || 20;
			const offset = parseInt(req.query.offset as string, 10) || 0;

			let findQuery = '';
			const queryParams: any[] = [limit, offset];

			// Multi-tenant boundary logic gate implementation
			if (context.scope === 'TENANT') {
				if (!context.tenantId) {
					throw { statusCode: 403, message: 'Context violation. Operator account is not bound to a corporate tenant.' };
				}
				// Force filtration to lock the company workspace context securely
				findQuery = `
					SELECT id, external_id AS "externalId", name, monthly_contract_value_cents::text AS "monthlyContractValueCents", margin_available_cents::text AS "marginAvailableCents", status, created_at AS "createdAt"
					FROM end_users
					WHERE tenant_id = $3
					ORDER BY name ASC
					LIMIT $1 OFFSET $2;
				`;
				queryParams.push(context.tenantId);
			} else if (context.scope === 'MASTER') {
				// Master roles (SYSADMIN) fetch data across the global scope grid layout
				findQuery = `
					SELECT id, tenant_id AS "tenantId", external_id AS "externalId", name, monthly_contract_value_cents::text AS "monthlyContractValueCents", margin_available_cents::text AS "marginAvailableCents", status, created_at AS "createdAt"
					FROM end_users
					ORDER BY name ASC
					LIMIT $1 OFFSET $2;
				`;
			} else {
				throw { statusCode: 403, message: 'Access denied. End users lack authority to perform administrative queries.' };
			}

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

export const routeConfig = {
	method: 'get',
	path: '/api/v1/end-users',
	handler: [
		authorize('read'),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => endUserListController.listEndUsers(req, res, next)
	]
};
