// src/controllers/tenantCreateController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { PoolClient } from 'pg';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';
import { validateBody, ValidationSchema } from '../middlewares/validationMiddleware';

// Strict body verification matrix enforcing pricing matrix arrays
const createTenantSchema: ValidationSchema = {
	cnpj: { type: 'string', required: true },
	name: { type: 'string', required: true },
	businessType: { type: 'string', required: true },
	globalCreditLimitCents: { type: 'number', required: true },
	pricingMatrix: { type: 'array', required: true } // Array of objects: { installmentsCount, feePercentage, maxAdvancePercentage }
};

class TenantCreateController {

	/**
	 * @openapi
	 * /api/v1/admin/tenants:
	 *   post:
	 *     summary: Provision a new B2B Corporate Tenant with multiple installment fee matrices
	 *     description: Creates a business tenant corporate portfolio and atomizes its multi-tiered payment schedule rules inside the database ledger using atomic transactions.
	 *     tags:
	 *       - Corporate Provisioning
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
	 *                 example: "Imobiliaria Beta LTDA"
	 *               businessType:
	 *                 type: string
	 *                 example: "REAL_ESTATE"
	 *               globalCreditLimitCents:
	 *                 type: integer
	 *                 example: 80000000
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
	 */
	public async createTenant(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		const { cnpj, name, businessType, globalCreditLimitCents, pricingMatrix } = req.body;
		const client: PoolClient = await db.getClient();

		try {
			const context = req.userContext;

			if (!context) {
				throw { statusCode: 401, message: 'Security framework violation. Authenticated profile context missing.' };
			}

			if (context.scope !== 'MASTER') {
				throw { statusCode: 403, message: 'Access denied. Corporate B2B provisioning is restricted to master operators.' };
			}

			await client.query('BEGIN');
			// 1. Insert the main B2B Tenant Core Account Header
			const insertTenantQuery = `
				INSERT INTO tenants (cnpj, name, business_type, global_credit_limit_cents)
				VALUES ($1, $2, $3, $4)
				RETURNING id, cnpj, name, business_type AS "businessType", global_credit_limit_cents::text AS "globalCreditLimitCents";
			`;
			const tenantRes = await client.query(insertTenantQuery, [cnpj, name, businessType, globalCreditLimitCents]);
			const newTenant = tenantRes.rows[0];

			// 2. Map and loop over the pricingMatrix array to populate configuration tiers dynamically
			const insertMatrixQuery = `
				INSERT INTO tenant_fee_matrices (tenant_id, installments_count, fee_percentage, max_advance_percentage)
				VALUES ($1, $2, $3, $4);
			`;

			for (const tier of pricingMatrix) {
				const { installmentsCount, feePercentage, maxAdvancePercentage } = tier;
				
				// Standard business validation inside loop layers
				if (installmentsCount  tenantCreateController.createTenant(req, res, next)
	]
};
