// src/controllers/tenantCreateController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { PoolClient } from 'pg';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';
import { validateBody, ValidationSchema } from '../middlewares/validationMiddleware';
import { ScopeTarget, ActionTarget } from '../config/security.enums';

// Schema validation mapping to enforce input integrity before database write
const tenantCreateSchema: ValidationSchema = {
	cnpj: { type: 'string', required: true },
	name: { type: 'string', required: true },
	businessType: { type: 'string', required: true }, // Must match custom ENUM: 'HR' or 'REAL_ESTATE'
	globalCreditLimitCents: { type: 'number', required: true },
	pricingMatrix: { type: 'array', required: true } // Enforces multi-tiered payment rules array
};

class TenantCreateController {

	/**
	 * @openapi
	 * /api/v1/admin/tenants:
	 *   post:
	 *     summary: Atomic Upsert (Onboard or Update) a B2B client company (Tenant) with multiple installment fee matrices
	 *     description: Provisions a new corporate tenant inside the core infrastructure or updates an existing one on CNPJ conflict, expanding its multi-tiered payment schedule rules using atomic transactions. Restricted to system administrators.
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
	 *                 description: Clean CNPJ string with exactly 14 numeric characters
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
	 *                 description: Maximum funding limit assigned to the portfolio in raw cents
	 *               pricingMatrix:
	 *                 type: array
	 *                 items:
	 *                   type: object
	 *                   properties:
	 *                     installmentsCount:
	 *                       type: integer
	 *                       example: 1
	 *                     feePercentage:
	 *                       type: number
	 *                       example: 3.50
	 *                     maxAdvancePercentage:
	 *                       type: number
	 *                       example: 30.00
	 *     responses:
	 *       200:
	 *         description: Tenant corporate record and pricing matrix upserted successfully
	 *       422:
	 *         description: Validation failed due to corrupt parameters or unsupported business type
	 */
	public async createTenant(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		const { cnpj, name, businessType, globalCreditLimitCents, pricingMatrix } = req.body;
		const context = req.userContext;
		const client: PoolClient = await db.getClient();

		try {
			if (!context) {
				throw { statusCode: 401, message: 'Security framework violation. Authenticated profile context missing.' };
			}

			// 1. Validate clean formatting parameters for the CNPJ identifier string
			const cleanCnpj = cnpj.replace(/\D/g, '');
			if (cleanCnpj.length !== 14) {
				throw { statusCode: 422, message: 'Validation failed. The CNPJ parameter must contain exactly 14 numeric digits.' };
			}

			// 2. Assert input strings match the strict PostgreSQL native ENUM constraints
			if (businessType !== 'HR' && businessType !== 'REAL_ESTATE') {
				throw { statusCode: 422, message: 'Validation failed. The businessType parameter must be explicitly set to either "HR" or "REAL_ESTATE".' };
			}

			const globalLimit = BigInt(globalCreditLimitCents);

			await client.query('BEGIN');

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
					throw { statusCode: 444, message: 'Update failed. No partner company found with the provided CNPJ identifier.' };
				}

				const targetId = updateRes.rows[0].id;
				await client.query(`DELETE FROM tenant_fee_matrices WHERE tenant_id = $1;`, [targetId]);
				newTenant = { id: targetId };

			} else {
				// 1B. Execution pipeline for POST (CREATE) operations
				// Enforces strict collision boundaries to block silent data overwrites
				const checkRes = await client.query(`SELECT id FROM tenants WHERE cnpj = $1;`, [cleanCnpj]);
				if (checkRes.rows.length > 0) {
					throw { statusCode: 409, message: 'Conflict detected. A corporate partner with this CNPJ registry already exists.' };
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

			for (const tier of pricingMatrix) {
				const { installmentsCount, feePercentage, maxAdvancePercentage } = tier;

				const isZeroOrNegativeMonths = Math.sign(installmentsCount) === 0 || Math.sign(installmentsCount) === -1;
				const isNegativeFee = Math.sign(feePercentage) === -1;
				const isNegativeMargin = Math.sign(maxAdvancePercentage) === -1;

				if (isZeroOrNegativeMonths || isNegativeFee || isNegativeMargin) {
					throw { statusCode: 422, message: 'Unprocessable structural entries inside the pricing matrix bundle.' };
				}

				await client.query(insertMatrixQuery, [newTenant.id, installmentsCount, feePercentage, maxAdvancePercentage]);
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
