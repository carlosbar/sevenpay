// src/controllers/tenantSyncController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { PoolClient } from 'pg';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';
import { validateBody, ValidationSchema } from '../middlewares/validationMiddleware';

// Schema validation for the batch endpoint wrapper structure
const syncSchema: ValidationSchema = {
	users: { type: 'string', required: true } // We will assert the array payload structure inside the handler
};

interface SyncUserPayload {
	externalId: string;
	name: string;
	monthlyContractValueCents: number;
}

class TenantSyncController {

	/**
	 * @openapi
	 * /api/v1/tenants/sync-users:
	 *   post:
	 *     summary: Bulk sync or onboard end users for a corporate tenant
	 *     description: Processes an array of consumer contract records. Performs an atomic upsert operation (insert or update on conflict) while isolating horizontal domain boundaries via JWT tenant data.
	 *     tags:
	 *       - Tenant Workspace
	 *     security:
	 *       - BearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - users
	 *             properties:
	 *               users:
	 *                 type: array
	 *                 items:
	 *                   type: object
	 *                   required:
	 *                     - externalId
	 *                     - name
	 *                     - monthlyContractValueCents
	 *                   properties:
	 *                     externalId:
	 *                       type: string
	 *                       example: "EMP-9988"
	 *                     name:
	 *                       type: string
	 *                       example: "Carlos Barcellos"
	 *                     monthlyContractValueCents:
	 *                       type: integer
	 *                       example: 450000
	 *     responses:
	 *       200:
	 *         description: Batch data synchronization executed successfully
	 *       403:
	 *         description: Context boundary exception or unauthorized scope parameter
	 *       422:
	 *         description: Invalid matrix array payload structure
	 */
	public async syncUsers(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		const { users } = req.body;
		const context = req.userContext;
		const client: PoolClient = await db.getClient();

		try {
			if (!context) {
				throw { statusCode: 401, message: 'Security framework violation. Authenticated profile context missing.' };
			}

			// 1. Enforce strict B2B isolation boundaries (Only corporate TENANT managers allowed)
			if (context.scope !== 'TENANT' || !context.tenantId) {
				throw { statusCode: 403, message: 'Access denied. Corporate user onboarding synchronization is restricted to tenant operators.' };
			}

			// 2. Validate structural integrity of the input array batch payload
			if (!Array.isArray(users) || users.length === 0) {
				throw { statusCode: 422, message: 'Validation failed. The property "users" must be a non-empty array block.' };
			}

			await client.query('BEGIN');

			let processedCount = 0;

			// 3. Loop through payload executing high-performance upsert operations
			for (const user of users as SyncUserPayload[]) {
				if (!user.externalId || !user.name || !user.monthlyContractValueCents) {
					throw { statusCode: 422, message: 'Processing aborted. Corrupted matrix attributes found inside the users payload block.' };
				}

				if (!Number.isInteger(user.monthlyContractValueCents) || user.monthlyContractValueCents <= 0) {
					throw { statusCode: 422, message: 'Processing aborted. Contract numerical entries must be valid non-negative integer cents.' };
				}

				const contractValue = BigInt(user.monthlyContractValueCents);

				// High-Performance PostgreSQL Upsert Query (Third Normal Form compliant)
				// If external_id exists under this tenant, update metadata and reset active available margin
				const upsertQuery = `
					INSERT INTO end_users (tenant_id, external_id, name, monthly_contract_value_cents, margin_available_cents, status)
					VALUES ($1, $2, $3, $4, $4, 'ACTIVE')
					ON CONFLICT (tenant_id, external_id) 
					DO UPDATE SET 
						name = EXCLUDED.name,
						monthly_contract_value_cents = EXCLUDED.monthly_contract_value_cents,
						margin_available_cents = EXCLUDED.monthly_contract_value_cents - (
							SELECT COALESCE(SUM(i.gross_amount_cents), 0)
							FROM advance_installments i
							WHERE i.end_user_id = end_users.id AND i.status IN ('PENDING', 'OVERDUE')
						),
						updated_at = NOW()
					RETURNING id;
				`;

				await client.query(upsertQuery, [
					context.tenantId,
					user.externalId,
					user.name,
					contractValue.toString()
				]);

				processedCount++;
			}

			await client.query('COMMIT');

			// 4. Dispatch standard unified success payload back to the business dashboard
			res.status(200).json({
				result: 'success',
				data: {
					synchronizedRecordsCount: processedCount,
					targetTenantId: context.tenantId
				}
			});

		} catch (error) {
			await client.query('ROLLBACK');
			next(error);
		} finally {
			client.release();
		}
	}
}

const tenantSyncController = new TenantSyncController();

// Export the dynamic automated discovery route specification mapping contract
export const routeConfig = {
	method: 'post',
	path: '/api/v1/tenants/sync-users',
	handler: [
		authorize('create'), // Asserts the enterprise operator holds write matrix clearance parameters
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => tenantSyncController.syncUsers(req, res, next)
	]
};
