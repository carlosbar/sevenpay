// src/controllers/feeMatrixController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';
import { validateBody, ValidationSchema } from '../middlewares/validationMiddleware';

// Schema validation matrix to shield the engine against corrupt pricing inputs
const feeMatrixSchema: ValidationSchema = {
	tenantId: { type: 'string', required: true, format: 'uuid' },
	installmentsCount: { type: 'number', required: true },
	feePercentage: { type: 'number', required: true },
	maxAdvancePercentage: { type: 'number', required: true }
};

class FeeMatrixController {

	/**
	 * @openapi
	 * /api/v1/admin/fee-matrices:
	 *   post:
	 *     summary: Atomic Upsert (Onboard or Update) pricing rules for a tenant tier
	 *     description: Provisions pricing fee matrices or updates pre-existing operational configurations dynamically on constraint conflict. Restricted to master operations.
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
	 *               - tenantId
	 *               - installmentsCount
	 *               - feePercentage
	 *               - maxAdvancePercentage
	 *             properties:
	 *               tenantId:
	 *                 type: string
	 *                 format: uuid
	 *                 example: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
	 *               installmentsCount:
	 *                 type: integer
	 *                 example: 2
	 *                 description: Target installment count boundary index
	 *               feePercentage:
	 *                 type: number
	 *                 example: 5.50
	 *                 description: Percentage cost applied to the transaction volume
	 *               maxAdvancePercentage:
	 *                 type: number
	 *                 example: 32.00
	 *                 description: Ceiling percentage allowed from the nominal contract value
	 *     responses:
	 *       200:
	 *         description: Pricing profile record successfully upserted into the infrastructure
	 *       422:
	 *         description: Validation failed due to corrupt metrics or boundary limits
	 */
	public async upsertMatrix(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		const { tenantId, installmentsCount, feePercentage, maxAdvancePercentage } = req.body;
		const context = req.userContext;

		try {
			if (!context) {
				throw { statusCode: 401, message: 'Security framework violation. Authenticated profile context missing.' };
			}

			// 1. Enforce strict platform scope isolation barrier (Only global MASTER roles allowed)
			if (context.scope !== 'MASTER') {
				throw { statusCode: 403, message: 'Access denied. Pricing configuration matrix is restricted to core fintech administrators.' };
			}

			// 2. Perform business logic data validations
			if (installmentsCount <= 0 || !Number.isInteger(installmentsCount)) {
				throw { statusCode: 422, message: 'Validation failed. The installmentsCount parameter must be a positive integer value.' };
			}

			if (feePercentage < 0 || feePercentage > 100) {
				throw { statusCode: 422, message: 'Validation failed. The feePercentage parameter must be a floating numeric factor between 0.00 and 100.00.' };
			}

			if (maxAdvancePercentage < 0 || maxAdvancePercentage > 100) {
				throw { statusCode: 422, message: 'Validation failed. The maxAdvancePercentage parameter must be a floating numeric factor between 0.00 and 100.00.' };
			}

			// 3. High-Performance PostgreSQL Upsert Query (Idempotent 3FN compliant pattern)
			// Catches unique constraint conflict over (tenant_id, installments_count) composite keys
			const upsertQuery = `
				INSERT INTO tenant_fee_matrices (tenant_id, installments_count, fee_percentage, max_advance_percentage)
				VALUES ($1, $2, $3, $4)
				ON CONFLICT (tenant_id, installments_count) 
				DO UPDATE SET 
					fee_percentage = EXCLUDED.fee_percentage,
					max_advance_percentage = EXCLUDED.max_advance_percentage,
					updated_at = NOW()
				RETURNING id, created_at AS "createdAt", updated_at AS "updatedAt";
			`;

			const queryResult = await db.query(upsertQuery, [
				tenantId,
				installmentsCount,
				feePercentage,
				maxAdvancePercentage
			]);

			const matrixRow = queryResult.rows[0];

			// 4. Dispatch standard unified success payload back to the admin grid view layout
			res.status(200).json({
				result: 'success',
				data: {
					feeMatrixId: matrixRow.id,
					tenantId,
					installmentsCount,
					feePercentage,
					maxAdvancePercentage,
					createdAt: matrixRow.createdAt,
					updatedAt: matrixRow.updatedAt
				}
			});

		} catch (error) {
			next(error); // Route runtime constraint errors straight to the standard envelope middleware
		}
	}
}

const feeMatrixController = new FeeMatrixController();

// Export the dynamic automated discovery route specification mapping contract
export const routeConfig = {
	method: 'post',
	path: '/api/v1/admin/fee-matrices',
	handler: [
		authorize('update'), // Protects the layer checking RBAC profile settings before operational injection
		validateBody(feeMatrixSchema),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => feeMatrixController.upsertMatrix(req, res, next)
	]
};
