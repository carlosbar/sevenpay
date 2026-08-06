import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';
import { ScopeTarget, ActionTarget } from '../config/security.enums';

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
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *         description: The company UUID parameter utilized by the dynamic matrix route guard layer to isolate data visibility.
	 *     responses:
	 *       200:
	 *         description: Tenant corporate metrics ledger block extracted successfully
	 *       403:
	 *         description: Access denied due to multitenant context tampering attempts
	 *       422:
	 *         description: Processing failed due to missing required filtration query vectors
	 */
	public async inspectTenant(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		try {
			const context = req.userContext;
			const targetTenantId = req.query.tenantId as string || null;

			if (!context) {
				throw { statusCode: 401, errorToken: 'AUTH_CREDENTIALS_INVALID' };
			}

			// 1. Enforce strict parameter presence barrier to isolate ledger lookups before database scan
			if (!targetTenantId) {
				throw { statusCode: 422, errorToken: 'QUERY_TENANT_ID_REQUIRED' };
			}

			// 2. Fetch Core Tenant Registration Data
			const tenantQuery = `
				SELECT id, cnpj, name, business_type AS "businessType", global_credit_limit_cents::text AS "globalCreditLimitCents", created_at AS "createdAt"
				FROM tenants WHERE id = $1;
			`;
			const tenantRes = await db.query(tenantQuery, [targetTenantId]);

			if (tenantRes.rowCount === 0) {
				throw { statusCode: 404, errorToken: 'TENANT_RECORD_NOT_FOUND' };
			}

			// 3. Fetch its entire active Pricing Fee Matrix rules grid layout
			const matrixQuery = `
				SELECT id, installments_count AS "installmentsCount", fee_percentage AS "feePercentage", max_advance_percentage AS "maxAdvancePercentage"
				FROM tenant_fee_matrices WHERE tenant_id = $1 ORDER BY installments_count ASC;
			`;
			const matrixRes = await db.query(matrixQuery, [targetTenantId]);
			// 4. Fetch the linked credit consumers roster list matching real database columns
			// FIXED HOOK: Removed the non-existent 'margin_available_cents' column to avoid database compiler crash
			const usersQuery = `
				SELECT id, external_id AS "externalId", name, monthly_contract_value_cents::text AS "monthlyContractValueCents", status
				FROM end_users WHERE tenant_id = $1 ORDER BY name ASC LIMIT 50;
			`;
			const usersRes = await db.query(usersQuery, [targetTenantId]);

			// 5. Dispatch standard unified success envelope payload data structure back to UI
			// FIXED CONTRACT: Renamed 'feeMatrices' to 'pricingMatrix' to ensure bilateral symmetry with the UI data pipeline
			res.status(200).json({
				result: 'success',
				data: {
					tenant: tenantRes.rows[0],
					pricingMatrix: matrixRes.rows,
					endUsersPreview: usersRes.rows
				}
			});

		} catch (error) {
			next(error);
		}
	}
}

const tenantInspectController = new TenantInspectController();

// Export the dynamic automated discovery route specification mapping contract
export const routeConfig = {
	method: 'get',
	path: '/api/v1/admin/tenants/inspect',
	handler: [
		// 🛡️ Advanced Security Matrix protecting parameters via automated validation cross-checks
		authorize([
			{ method: 'GET', scope: ScopeTarget.MASTER, action: ActionTarget.READ },
			{ method: 'GET', scope: ScopeTarget.TENANT, action: ActionTarget.READ, validateTenantIdFrom: 'query' }
		]),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => tenantInspectController.inspectTenant(req, res, next)
	]
};
