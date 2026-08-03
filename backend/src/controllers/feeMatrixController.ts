// src/controllers/feeMatrixController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';
import { validateBody, ValidationSchema } from '../middlewares/validationMiddleware';
import { ScopeTarget, ActionTarget } from '../config/security.enums';

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
	 *     summary: Create or Update corporate pricing rules for a specific tier
	 *     description: Handles fine-grained fee matrix deployment. Evaluates HTTP method to perform creation (POST) or mutation (PUT) driven by strict RESTful isolation boundaries. Restricted to master operations.
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
	 *               feePercentage:
	 *                 type: number
	 *                 example: 5.50
	 *               maxAdvancePercentage:
	 *                 type: number
	 *                 example: 32.00
	 *     responses:
	 *       200:
	 *         description: Pricing profile record successfully modified
	 *       201:
	 *         description: Pricing profile record successfully initialized
	 */
	public async upsertMatrix(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		const { tenantId, installmentsCount, feePercentage, maxAdvancePercentage } = req.body;

		try {
			// 1. Perform explicit operational parameters semantic validation
			const isNegativeMonths = Math.sign(installmentsCount) === -1;
			const isZeroMonths = installmentsCount === 0;
			if (isNegativeMonths || isZeroMonths || !Number.isInteger(installmentsCount)) {
				throw { statusCode: 422, errorToken: 'MATRIX_INSTALLMENTS_INVALID' };
			}

			const isNegativeFee = Math.sign(feePercentage) === -1;
			if (isNegativeFee || feePercentage > 100) {
				throw { statusCode: 422, errorToken: 'MATRIX_FEE_PERCENTAGE_OUT_OF_BOUNDS' };
			}

			const isNegativeMargin = Math.sign(maxAdvancePercentage) === -1;
			if (isNegativeMargin || maxAdvancePercentage > 100) {
				throw { statusCode: 422, errorToken: 'MATRIX_FEE_PERCENTAGE_OUT_OF_BOUNDS' };
			}

			const isPutRequest = req.method === 'PUT';
			let findQuery = '';
			let queryParams: any[] = [];

			if (isPutRequest) {
				// 2A. Execution pipeline for PUT (UPDATE) operations targeting existing keys
				findQuery = `
					UPDATE tenant_fee_matrices 
					SET fee_percentage = $1, max_advance_percentage = $2, updated_at = NOW()
					WHERE tenant_id = $3 AND installments_count = $4
					RETURNING id, created_at AS "createdAt", updated_at AS "updatedAt";
				`;
				queryParams = [feePercentage, maxAdvancePercentage, tenantId, installmentsCount];
			} else {
				// 2B. Execution pipeline for POST (CREATE) operations enforcing unique constraint bounds
				const checkQuery = `SELECT id FROM tenant_fee_matrices WHERE tenant_id = $1 AND installments_count = $2;`;
				const checkRes = await db.query(checkQuery, [tenantId, installmentsCount]);
				if (checkRes.rows.length > 0) {
					throw { statusCode: 409, message: 'Conflict detected. A fee configuration rule for this installment count tier already exists.' };
				}

				findQuery = `
					INSERT INTO tenant_fee_matrices (tenant_id, installments_count, fee_percentage, max_advance_percentage)
					VALUES ($1, $2, $3, $4)
					RETURNING id, created_at AS "createdAt", updated_at AS "updatedAt";
				`;
				queryParams = [tenantId, installmentsCount, feePercentage, maxAdvancePercentage];
			}

			const queryResult = await db.query(findQuery, queryParams);
			
			if (queryResult.rows.length === 0) {
				throw { statusCode: 404, message: 'Transaction failed. Targeted pricing matrix record not found for configuration override.' };
			}

			const matrixRow = queryResult.rows;

			// 3. Dispatch standardized success envelope back to the interface layer
			res.status(isPutRequest ? 200 : 201).json({
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
			next(error);
		}
	}
}

const feeMatrixController = new FeeMatrixController();

// Export a single unified specification contract supporting multi-method routing arrays
export const routeConfig = {
	method: ['post', 'put'],
	path: '/api/v1/admin/fee-matrices',
	handler: [
		// 🛡️ Decoupled authentication layer evaluating specific Restful intent dynamically
		authorize([
			{ method: 'POST', scope: ScopeTarget.MASTER, action: ActionTarget.CREATE },
			{ method: 'PUT',  scope: ScopeTarget.MASTER, action: ActionTarget.UPDATE }
		]),
		validateBody(feeMatrixSchema),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => feeMatrixController.upsertMatrix(req, res, next)
	]
};
