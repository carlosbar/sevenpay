// src/controllers/tenantCreateController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { PoolClient } from 'pg';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';
import { validateBody, ValidationSchema } from '../middlewares/validationMiddleware';

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

                        // 1. Enforce strict platform scope isolation barrier (Only global MASTER operations allowed)
                        if (context.scope !== 'MASTER') {
                                throw { statusCode: 403, message: 'Access denied. Corporate onboarding is restricted to core fintech administrators.' };
                        }

                        // 2. Validate clean formatting parameters for the CNPJ identifier string
                        const cleanCnpj = cnpj.replace(/\D/g, '');
                        if (cleanCnpj.length !== 14) {
                                throw { statusCode: 422, message: 'Validation failed. The CNPJ parameter must contain exactly 14 numeric digits.' };
                        }

                        // 3. Assert input strings match the strict PostgreSQL native ENUM constraints
                        if (businessType !== 'HR' && businessType !== 'REAL_ESTATE') {
                                throw { statusCode: 422, message: 'Validation failed. The businessType parameter must be explicitly set to either "HR" or "REAL_ESTATE".' };
                        }

                        const globalLimit = BigInt(globalCreditLimitCents);

                        await client.query('BEGIN');
                        // 4. High-Performance PostgreSQL Upsert Query (Idempotent 3FN compliant pattern)
                        // Utilizes the unique constraint over the clean cnpj column to catch conflicts and trigger data rewrite
                        const upsertQuery = `
                                INSERT INTO tenants (cnpj, name, business_type, global_credit_limit_cents)
                                VALUES ($1, $2, $3, $4)
                                ON CONFLICT (cnpj)
                                DO UPDATE SET
                                        name = EXCLUDED.name,
                                        business_type = EXCLUDED.business_type,
                                        global_credit_limit_cents = EXCLUDED.global_credit_limit_cents,
                                        updated_at = NOW()
                                RETURNING id, created_at AS "createdAt", updated_at AS "updatedAt";
                        `;

                        const queryResult = await client.query(upsertQuery, [
                                cleanCnpj,
                                name,
                                businessType,
                                globalLimit.toString()
                        ]);

                        const tenantRow = queryResult.rows[0];

                        // 5. Clear old matrix rules if it's an update operation to maintain 3FN consistency
                        const deleteMatrixQuery = `DELETE FROM tenant_fee_matrices WHERE tenant_id = $1;`;
                        await client.query(deleteMatrixQuery, [tenantRow.id]);

                        // 6. Map and loop over the pricingMatrix array to populate configuration tiers dynamically
                        const insertMatrixQuery = `
                                INSERT INTO tenant_fee_matrices (tenant_id, installments_count, fee_percentage, max_advance_percentage)
                                VALUES ($1, $2, $3, $4);
                        `;

                        for (const tier of pricingMatrix) {
                                const { installmentsCount, feePercentage, maxAdvancePercentage } = tier;
                                
                                // Clean evaluation driven by sign checking to prevent code clipping crashes
                                const isZeroOrNegativeMonths = Math.sign(installmentsCount) === 0 || Math.sign(installmentsCount) === -1;
                                const isNegativeFee = Math.sign(feePercentage) === -1;
                                const isNegativeMargin = Math.sign(maxAdvancePercentage) === -1;

                                if (isZeroOrNegativeMonths || isNegativeFee || isNegativeMargin) {
                                        throw { statusCode: 422, message: 'Unprocessable entity data entries discovered inside the pricing matrix bundle.' };
                                }

                                await client.query(insertMatrixQuery, [
                                        tenantRow.id,
                                        installmentsCount,
                                        feePercentage,
                                        maxAdvancePercentage
                                ]);
                        }

                        await client.query('COMMIT');

                        // 7. Dispatch standard unified success payload back to the admin control grid
                        res.status(200).json({
                                result: 'success',
                                data: {
                                        tenantId: tenantRow.id,
                                        name,
                                        cnpj: cleanCnpj,
                                        globalCreditLimitCents: globalLimit.toString(),
                                        createdAt: tenantRow.createdAt,
                                        updatedAt: tenantRow.updatedAt,
                                        pricingMatrixDeployedCount: pricingMatrix.length
                                }
                        });

                } catch (error) {
                        await client.query('ROLLBACK');
                        next(error); // Route runtime data constraint exceptions straight to the envelope parser
                } finally {
                        client.release();
                }
        }
}

const tenantCreateController = new TenantCreateController();

// Export the dynamic automated discovery route specification mapping contract
export const routeConfig = {
	method: 'post',
	path: '/api/v1/admin/tenants',
	handler: [
		authorize('TENANT', 'CREATE'),
		validateBody(createTenantSchema),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => tenantCreateController.createTenant(req, res, next)
	]
};
