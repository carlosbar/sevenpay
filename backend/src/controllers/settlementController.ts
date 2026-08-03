// src/controllers/settlementController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { PoolClient } from 'pg';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';
import { validateBody, ValidationSchema } from '../middlewares/validationMiddleware';
import { ResourceTarget, ScopeTarget, ActionTarget } from '../config/security.enums';

const settlementSchema: ValidationSchema = {
	tenantId: { type: 'string', required: true, format: 'uuid' },
	billingCompetence: { type: 'string', required: true } // Format: 'YYYY-MM'
};

class SettlementController {

	/**
	 * @openapi
	 * /api/v1/settlements/clear-competence:
	 *   post:
	 *     summary: Settle all outstanding installments for a specific tenant competence
	 *     description: Processes bulk payment clearance for a specific month. Updates amortization logs, restores end-user credit margins, and appends CREDIT vectors into the immutable ledger. Restricted to master operations.
	 *     tags:
	 *       - Financial Settlement
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
	 *               - billingCompetence
	 *             properties:
	 *               tenantId:
	 *                 type: string
	 *                 format: uuid
	 *                 example: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
	 *               billingCompetence:
	 *                 type: string
	 *                 example: "2026-08"
	 *     responses:
	 *       200:
	 *         description: Competence settlement executed and balances reconciled successfully
	 *       422:
	 *         description: Processing error due to missing outstanding balances
	 *       500:
	 *         description: Infrastructure or environment configuration error
	 */
	public async settleCompetence(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		const { tenantId, billingCompetence } = req.body;
		const client: PoolClient = await db.getClient();

		try {
			await client.query('BEGIN');

			// 1. Fetch and Lock all pending or overdue installments for this tenant and competence
			const fetchInstallmentsQuery = `
				SELECT i.id, i.end_user_id, i.gross_amount_cents, i.advance_request_id
				FROM advance_installments i
				JOIN end_users u ON u.id = i.end_user_id
				WHERE u.tenant_id = $1 
				  AND i.billing_competence = $2 
				  AND i.status IN ('PENDING', 'OVERDUE')
				FOR UPDATE;
			`;
			const installmentsRes = await client.query(fetchInstallmentsQuery, [tenantId, billingCompetence]);

			if (installmentsRes.rowCount === 0) {
				throw { statusCode: 422, message: 'Reconciliation aborted. No pending or overdue installments found for this target competence.' };
			}

			let totalBatchSettledCents = BigInt(0);

			// 2. Loop through each installment to restore margin and log ledger entry
			for (const row of installmentsRes.rows) {
				const installmentId = row.id;
				const endUserId = row.end_user_id;
				const grossAmount = BigInt(row.gross_amount_cents);
				const requestId = row.advance_request_id;

				totalBatchSettledCents += grossAmount;

				// Update installment lifecycle status to PAID
				await client.query(
					`UPDATE advance_installments SET status = 'PAID', updated_at = NOW() WHERE id = $1`,
					[installmentId]
				);

				// Restore the available credit margin of the end user
				await client.query(
					`UPDATE end_users SET margin_available_cents = margin_available_cents + $1, updated_at = NOW() WHERE id = $2`,
					[grossAmount.toString(), endUserId]
				);

				// Append an immutable CREDIT record into the audit ledger log
				const insertLedgerQuery = `
					INSERT INTO financial_transactions (advance_request_id, end_user_id, type, amount_cents)
					VALUES ($1, $2, 'CREDIT', $3);
				`;
				await client.query(insertLedgerQuery, [requestId, endUserId, grossAmount.toString()]);
			}

			// 3. Register the consolidated batch record for corporate tracking
			const insertBatchQuery = `
				INSERT INTO tenant_settlement_batches (tenant_id, billing_competence, total_settled_cents)
				VALUES ($1, $2, $3) RETURNING id;
			`;
			const batchRes = await client.query(insertBatchQuery, [tenantId, billingCompetence, totalBatchSettledCents.toString()]);
			const batchId = batchRes.rows[0].id;

			await client.query('COMMIT');

			// Dispatch standard success response envelope
			res.status(200).json({
				result: 'success',
				data: {
					settlementBatchId: batchId,
					totalLiquidatedCents: totalBatchSettledCents.toString(),
					processedInstallmentsCount: installmentsRes.rowCount
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

const settlementController = new SettlementController();

// Export the dynamic automated discovery route specification mapping contract
export const routeConfig = {
	method: 'post',
	path: '/api/v1/settlements/clear-competence',
	handler: [
		// 🛡️ Multi-rule matrix enforcing POST operation, MASTER scope, and DISBURSE actions for bulk liquidation
		authorize([
			{ method: 'POST', scope: ScopeTarget.MASTER, action: ActionTarget.DISBURSE }
		]),
		validateBody(settlementSchema),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => settlementController.settleCompetence(req, res, next)
	]
};
