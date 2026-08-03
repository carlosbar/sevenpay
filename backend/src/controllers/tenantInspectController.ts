// src/controllers/tenantInspectController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';

class TenantInspectController {

	/**
	 * @openapi
	 * /api/v1/admin/tenants/inspect:
	 *   get:
	 *     summary: Deep 360 inspect of a specific B2B tenant corporate workspace
	 *     description: Compiles complete tenant profile telemetry, including its full pricing fee matrix tier configuration, allocated credit ceilings, and linked end-user registries. Enforces strict horizontal multitenant encryption boundaries.
	 *     tags:
	 *       - Administration Lookup
	 *     security:
	 *       - BearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: tenantId
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *         description: The company UUID (Optional for TENANT scope, strictly required for MASTER auditing operations)
	 *     responses:
	 *       200:
	 *         description: Tenant corporate metrics ledger block extracted successfully
	 *       403:
	 *         description: Access denied due to multitenant context tampering attempts
	 */
	public async inspectTenant(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		try {
			const context = req.userContext;

			if (!context) {
				throw { statusCode: 401, message: 'Security framework violation. Authenticated profile context missing.' };
			}

			let targetTenantId: string | null = null;

			// 1. Enforce strict cryptographic validation over multi-tenant boundary lines
			if (context.scope === 'TENANT') {
				if (!context.tenantId) {
					throw { statusCode: 403, message: 'Context violation. Operator account is not bound to a corporate tenant.' };
				}
				targetTenantId = context.tenantId; // Corporate operators are physically locked inside their domain
			} else if (context.scope === 'MASTER') {
				targetTenantId = (req.query.tenantId as string) || null;
				if (!targetTenantId) {
					throw { statusCode: 422, message: 'Processing failed. Master auditing scope queries must supply a target tenantId parameter.' };
				}
			} else {
				throw { statusCode: 403, message: 'Access denied. End users are forbidden from pulling corporate metadata.' };
			}

			// 2. Fetch Core Tenant Registration Data
			const tenantQuery = `
				SELECT id, cnpj, name, business_type AS "businessType", global_credit_limit_cents::text AS "globalCreditLimitCents", created_at AS "createdAt"
				FROM tenants WHERE id = $1;
			`;
			const tenantRes = await db.query(tenantQuery, [targetTenantId]);

			if (tenantRes.rowCount === 0) {
				throw { statusCode: 404, message: 'Target company tenant workspace record not found in the infrastructure database.' };
			}

			// 3. Fetch its entire active Pricing Fee Matrix rules grid layout
			const matrixQuery = `
				SELECT id, installments_count AS "installmentsCount", fee_percentage AS "feePercentage", max_advance_percentage AS "maxAdvancePercentage"
				FROM tenant_fee_matrices WHERE tenant_id = $1 ORDER BY installments_count ASC;
			`;
			const matrixRes = await db.query(matrixQuery, [targetTenantId]);

			// 4. Fetch the linked credit consumers roster list for the grid panel layout
			const usersQuery = `
				SELECT id, external_id AS "externalId", name, monthly_contract_value_cents::text AS "monthlyContractValueCents", margin_available_cents::text AS "marginAvailableCents", status
				FROM end_users WHERE tenant_id = $1 ORDER BY name ASC LIMIT 50;
			`;
			const usersRes = await db.query(usersQuery, [targetTenantId]);

			// 5. Dispatch standard unified success envelope payload data structure back to UI
			res.status(200).json({
				result: 'success',
				data: {
					tenant: tenantRes.rows[0],
					feeMatrices: matrixRes.rows,
					endUsersPreview: usersRes.rows
				}
			});

		} catch (error) {
			next(error);
		}
	}
}

const tenantInspectController = new TenantInspectController();

export const routeConfig = {
	method: 'get',
	path: '/api/v1/admin/tenants/inspect',
	handler: [
		authorize('read'),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => tenantInspectController.inspectTenant(req, res, next)
	]
};
