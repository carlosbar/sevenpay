// src/controllers/tenantListController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';
import { ScopeTarget, ActionTarget } from '../config/security.enums';

class TenantListController {

	/**
	 * @openapi
	 * /api/v1/admin/tenants:
	 *   get:
	 *     summary: List all corporate tenants
	 *     description: Retrieves a paginated list of all B2B partner companies provisioned in the ecosystem. Restricted exclusively to master operations with fuzzy search support.
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
	 *       - in: query
	 *         name: search
	 *         schema:
	 *           type: string
	 *         description: Fuzzy search term to scan similar or proximate partner names using trigrams
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

			const limit = parseInt(req.query.limit as string, 10) || 10;
			const offset = parseInt(req.query.offset as string, 10) || 0;
			
			/* ─── CAPTURE FUZZY SEARCH TERMS FROM INBOUND REQ STREAM ─── */
			const search = (req.query.search as string || '').trim();

			let query: string;
			let queryParams: any[];

			if (search.length > 0) {
				/* 
				   ─── TRIGRAM SIMILARITY PIPELINE REFAC ───
				   1. word_similarity(search, name) > 0.3 checks for typographic neighbors (e.g. carta/certa)
				   2. ORDER BY similarity distance (<->) pushes closest phonetic matches to the top
				*/
				query = `
					SELECT id, cnpj, name, business_type AS "businessType", global_credit_limit_cents::text AS "globalCreditLimitCents", created_at AS "createdAt"
					FROM tenants
					WHERE name % $1 OR name ILIKE $2
					ORDER BY (name <-> $1) ASC, name ASC
					LIMIT $3 OFFSET $4;
				`;
				queryParams = [search, `%${search}%`, limit, offset];
			} else {
				/* Fallback to traditional lexicographical scrolling sequence if search field is clear */
				query = `
					SELECT id, cnpj, name, business_type AS "businessType", global_credit_limit_cents::text AS "globalCreditLimitCents", created_at AS "createdAt"
					FROM tenants
					ORDER BY name ASC
					LIMIT $1 OFFSET $2;
				`;
				queryParams = [limit, offset];
			}

			const result = await db.query(query, queryParams);

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

// Export the dynamic automated discovery route specification mapping contract
export const routeConfig = {
	method: 'get',
	path: '/api/v1/admin/tenants',
	handler: [
		// 🛡️ Multi-rule matrix validation mapping exact RESTful operations and target credentials for master operators
		authorize([
			{ method: 'GET', scope: ScopeTarget.MASTER, action: ActionTarget.READ }
		]),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => tenantListController.listTenants(req, res, next)
	]
};
