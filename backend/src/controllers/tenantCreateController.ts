import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { PoolClient } from 'pg';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';
import { validateBody, ValidationSchema } from '../middlewares/validationMiddleware';
import { ScopeTarget, ActionTarget } from '../config/security.enums';
import { isValidCnpj } from '../utils/cnpjValidator';

// Strict interface contract ensuring safe data compilation inside execution loops
export interface PricingTierInput {
	installmentsCount: number;
	feePercentage: number;
	maxAdvancePercentage: number;
}

// Flexible metadata validation schema allowing standard administrative path requests
const tenantCreateSchema: ValidationSchema = {
	cnpj: { type: 'string', required: true },
	name: { type: 'string', required: true },
	businessType: { type: 'string', required: true },
	globalCreditLimitCents: { type: 'number', required: true },
	pricingMatrix: { type: 'array', required: true }
};

class TenantCreateController {

	/**
	 * @openapi
	 * /api/v1/admin/tenants:
	 *   post:
	 *     summary: Atomic Upsert a B2B client company (Tenant) with multiple installment fee matrices
	 *     description: Provisions a new corporate tenant inside the core infrastructure or updates an existing one using atomic transactions.
	 *     tags:
	 *       - Admin Dashboard
	 *     security:
	 *       - BearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - cnpj
	 *               - name
	 *               - businessType
	 *               - globalCreditLimitCents
	 *               - pricingMatrix
	 *             properties:
	 *               cnpj:
	 *                 type: string
	 *                 example: "12345678000199"
	 *               name:
	 *                 type: string
	 *                 example: "Imobiliaria Alpha LTDA"
	 *               businessType:
	 *                 type: string
	 *                 enum: [HR, REAL_ESTATE]
	 *                 example: "REAL_ESTATE"
	 *               globalCreditLimitCents:
	 *                 type: integer
	 *                 format: int64
	 *                 example: 50000000
	 *               pricingMatrix:
	 *                 type: array
	 *                 items:
	 *                   type: object
	 *                   properties:
	 *                     installmentsCount:
	 *                       type: integer
	 *                     feePercentage:
	 *                       type: number
	 *                     maxAdvancePercentage:
	 *                       type: number
	 */
	public async createTenant(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		const { cnpj, name, businessType, globalCreditLimitCents, pricingMatrix } = req.body;
		const context = req.userContext;
		const client: PoolClient = await db.getClient();

		try {
			if (!context) {
				throw { statusCode: 401, errorToken: 'AUTH_CREDENTIALS_INVALID' };
			}

			// 1. Validate clean formatting parameters for the CNPJ identifier string
			const cleanCnpj = String(cnpj).replace(/\D/g, '');
			if (cleanCnpj.length !== 14) {
				throw { statusCode: 422, errorToken: 'TENANT_CNPJ_INVALID_FORMAT' };
			}
			if (!isValidCnpj(cleanCnpj)) {
				throw { statusCode: 422, errorToken: 'TENANT_CNPJ_INVALID_CHECKSUM' };
			}

			const globalLimit = BigInt(globalCreditLimitCents);

			await client.query('BEGIN');

			// 2. Assert the business type maps to a registered lookup row (business_types.code)
			const businessTypeRes = await client.query(`SELECT code FROM business_types WHERE code = $1;`, [businessType]);
			if (businessTypeRes.rows.length === 0) {
				throw { statusCode: 422, errorToken: 'TENANT_BUSINESS_TYPE_UNSUPPORTED' };
			}

			const isPutRequest = req.method === 'PUT';
			let newTenant: { id: string };
			if (isPutRequest) {
				// 1A. Execution pipeline for PUT (UPDATE) operations
				// Updates basic corporate metadata and drops old fee rows to maintain 3FN consistency
				const updateTenantQuery = `
					UPDATE tenants 
					SET name = $1, business_type = $2, global_credit_limit_cents = $3, updated_at = NOW()
					WHERE cnpj = $4
					RETURNING id;
				`;
				const updateRes = await client.query(updateTenantQuery, [name, businessType, globalLimit.toString(), cleanCnpj]);

				if (updateRes.rows.length === 0) {
					throw { statusCode: 444, errorToken: 'TENANT_NOT_FOUND_FOR_UPDATE' };
				}

				const targetId = updateRes.rows[0].id;
				await client.query(`DELETE FROM tenant_fee_matrices WHERE tenant_id = $1;`, [targetId]);
				newTenant = { id: targetId };

			} else {
				// 1B. Execution pipeline for POST (CREATE) operations
				// Enforces strict collision boundaries to block silent data overwrites
				const checkRes = await client.query(`SELECT id FROM tenants WHERE cnpj = $1;`, [cleanCnpj]);
				if (checkRes.rows.length > 0) {
					throw { statusCode: 409, errorToken: 'TENANT_CNPJ_ALREADY_EXISTS' };
				}

				const insertTenantQuery = `
					INSERT INTO tenants (cnpj, name, business_type, global_credit_limit_cents)
					VALUES ($1, $2, $3, $4)
					RETURNING id;
				`;
				const insertRes = await client.query(insertTenantQuery, [cleanCnpj, name, businessType, globalLimit.toString()]);
				newTenant = insertRes.rows[0];
			}

			// 2. Map and loop over the pricingMatrix array to populate configuration tiers dynamically
			const insertMatrixQuery = `
				INSERT INTO tenant_fee_matrices (tenant_id, installments_count, fee_percentage, max_advance_percentage)
				VALUES ($1, $2, $3, $4);
			`;

			for (const tier of (pricingMatrix as PricingTierInput[])) {
				const { installmentsCount, feePercentage, maxAdvancePercentage } = tier;

				// 🛡️ RECALIBRATED MATRIX VALIDATION: Allows 0 for fees or margins, blocks strictly negative targets
				const isZeroOrNegativeMonths = Number(installmentsCount) <= 0;
				const isNegativeFee = Number(feePercentage) < 0;
				const isNegativeMargin = Number(maxAdvancePercentage) < 0;

				if (isZeroOrNegativeMonths || isNegativeFee || isNegativeMargin) {
					throw { statusCode: 422, errorToken: 'TENANT_MATRIX_VALUES_INVALID' };
				}

				await client.query(insertMatrixQuery, [
					newTenant.id, 
					installmentsCount, 
					String(feePercentage), 
					String(maxAdvancePercentage)
				]);
			}

			await client.query('COMMIT');

			res.status(isPutRequest ? 200 : 201).json({
				result: 'success',
				data: { tenantId: newTenant.id, pricingMatrixDeployedCount: pricingMatrix.length }
			});

		} catch (error) {
			await client.query('ROLLBACK');
			next(error);
		} finally {
			client.release();
		}
	}
}

const tenantCreateController = new TenantCreateController();

// Export the dynamic automated discovery route specification mapping contract
export const routeConfig = {
	method: ['post', 'put'],
	path: '/api/v1/admin/tenants',
	handler: [
		// 🛡️ Multi-rule policy configuration matrix driven exclusively by strict RESTful intent
		authorize([
			{ method: 'POST', scope: ScopeTarget.MASTER, action: ActionTarget.CREATE },
			{ method: 'PUT',  scope: ScopeTarget.MASTER, action: ActionTarget.UPDATE }
		]), 
		validateBody(tenantCreateSchema),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => tenantCreateController.createTenant(req, res, next)
	]
};
