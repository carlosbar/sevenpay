// src/controllers/advanceController.ts
import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import { PoolClient } from 'pg';
import { authorize } from '../middlewares/authMiddleware';
import { validateBody, ValidationSchema } from '../middlewares/validationMiddleware';

const advanceSchema: ValidationSchema = {
	endUserId: { type: 'string', required: true, format: 'uuid' },
	requestedAmountCents: { type: 'number', required: true, format: 'cents' },
	installmentsTotal: { type: 'number', required: true }
};

class AdvanceController {

	/**
	 * @openapi
	 * /api/v1/advances/request:
	 *   post:
	 *     summary: Request a new credit advance payout
	 *     description: Processes a credit advance request, executing strict multi-tenant validations, delinquency gates, row locking (FOR UPDATE), cumulative monthly limits, and automatically provisions future amortization installments using 64-bit integer cents. Computes user margins dynamically in real-time.
	 *     tags:
	 *       - Advances
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - endUserId
	 *               - requestedAmountCents
	 *               - installmentsTotal
	 *             properties:
	 *               endUserId:
	 *                 type: string
	 *                 format: uuid
	 *                 example: "f1e2d3c4-b5a6-7f8e-9d0c-1b2a3f4e5d6c"
	 *               requestedAmountCents:
	 *                 type: integer
	 *                 format: int64
	 *                 example: 50000
	 *               installmentsTotal:
	 *                 type: integer
	 *                 example: 1
	 *     responses:
	 *       201:
	 *         description: Advance approved and registered successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 result:
	 *                   type: string
	 *                   example: "success"
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     requestId:
	 *                       type: string
	 *                       format: uuid
	 *                     netPayoutCents:
	 *                       type: string
	 *                       example: "48250"
	 *                     dispatchedToPixKey:
	 *                       type: string
	 *                       example: "12345678900"
	 *       403:
	 *         description: Access denied due to overdue/delinquent accounts
	 *       422:
	 *         description: Business rule, risk constraint, or B2B portfolio limit violation
	 */
	public async requestAdvance(req: Request, res: Response, next: NextFunction): Promise<void> {
		const { endUserId, requestedAmountCents, installmentsTotal } = req.body;
		const client: PoolClient = await db.getClient();

		try {
			await client.query('BEGIN');

			// STEP 2 & 5: Fetch Risk Matrix and Base Contract with row-level lock (FOR UPDATE)
			const userQuery = `
				SELECT u.id, u.tenant_id, u.monthly_contract_value_cents,
				       m.fee_percentage, m.max_advance_percentage
				FROM end_users u
				JOIN tenant_fee_matrices m ON m.tenant_id = u.tenant_id AND m.installments_count = $2
				WHERE u.id = $1 AND u.status = 'ACTIVE'
				FOR UPDATE;
			`;
			const userRes = await client.query(userQuery, [endUserId, installmentsTotal]);

			if (userRes.rowCount === 0) {
				throw { statusCode: 404, message: 'Active consumer contract record not found for this installment tier.' };
			}

			const user = userRes.rows[0];

			// STEP 3: Delinquency and Overdue Check (Risk Gate)
			const overdueQuery = `
				SELECT COUNT(*) as overdue_count 
				FROM advance_installments 
				WHERE end_user_id = $1 AND status = 'OVERDUE';
			`;
			const overdueRes = await client.query(overdueQuery, [endUserId]);
			if (parseInt(overdueRes.rows[0].overdue_count, 10) > 0) {
				throw { statusCode: 403, message: 'Access denied. This user account has outstanding overdue installments pending settlement.' };
			}

			// STEP 4: Monthly Cumulative Spending Audit (The Truth Layer)
			const cumulativeQuery = `
				SELECT COALESCE(SUM(requested_amount_cents), 0) as total_advanced
				FROM advance_requests
				WHERE end_user_id = $1 
				  AND status != 'REJECTED'
				  AND created_at >= date_trunc('month', current_timestamp);
			`;
			const cumulativeRes = await client.query(cumulativeQuery, [endUserId]);
			const totalAdvancedThisMonth = BigInt(cumulativeRes.rows[0].total_advanced);

			// STEP 5: Real-Time Dynamic Math Calculations in 64-bit BigInt Cents
			const monthlyContractValue = BigInt(user.monthly_contract_value_cents);
			const maxAdvancePercentage = Number(user.max_advance_percentage);
			const requestedAmount = BigInt(requestedAmountCents);

			const maxAllowableCapacity = (monthlyContractValue * BigInt(Math.round(maxAdvancePercentage * 100))) / BigInt(10000);
			const realAvailableMargin = maxAllowableCapacity - totalAdvancedThisMonth;

			if (requestedAmount > realAvailableMargin) {
				throw { statusCode: 422, message: 'The requested volume breaches the dynamic real-time monthly allowable margin for this user.' };
			}
			// STEP 6: Tenant B2B Global Limit Verification (Real-Time Aggregate)
			const globalLimitQuery = `
				SELECT t.global_credit_limit_cents, COALESCE(SUM(r.requested_amount_cents), 0) as total_tenant_spent
				FROM tenants t
				LEFT JOIN end_users u ON u.tenant_id = t.id
				LEFT JOIN advance_requests r ON r.end_user_id = u.id AND r.status != 'REJECTED'
				WHERE t.id = $1
				GROUP BY t.global_credit_limit_cents;
			`;
			const globalLimitRes = await client.query(globalLimitQuery, [user.tenant_id]);
			const tenantLimit = BigInt(globalLimitRes.rows[0].global_credit_limit_cents);
			const tenantSpent = BigInt(globalLimitRes.rows[0].total_tenant_spent);

			if (tenantSpent + requestedAmount > tenantLimit) {
				throw { statusCode: 422, message: 'B2B Tenant credit portfolio limit exceeded for the active commercial agreement.' };
			}

			// STEP 7: Fee & Payout Calculations
			const feePercentage = Number(user.fee_percentage);
			const feeAmountCents = (requestedAmount * BigInt(Math.round(feePercentage * 100))) / BigInt(10000);
			const netPayoutCents = requestedAmount - feeAmountCents;

			// STEP 8: Pix Dispatch Routing Optimization (Priority 0)
			const pixQuery = `
				SELECT key_value FROM pix_accounts 
				WHERE end_user_id = $1 
				ORDER BY priority ASC LIMIT 1;
			`;
			const pixRes = await client.query(pixQuery, [endUserId]);

			if (pixRes.rowCount === 0) {
				throw { statusCode: 422, message: 'No valid active Pix account destination route registered for this end user.' };
			}

			const activePixKey = pixRes.rows[0].key_value;

			// STEP 9: Batch Ledger Persistence (No static update on end_users table)
			// 1. Insert Advance Request Header
			const insertRequest = `
				INSERT INTO advance_requests (end_user_id, requested_amount_cents, installments_total, fee_percentage, fee_amount_cents, net_payout_cents, status)
				VALUES ($1, $2, $3, $4, $5, $6, 'APPROVED') RETURNING id;
			`;
			const requestRes = await client.query(insertRequest, [endUserId, requestedAmount.toString(), installmentsTotal, feePercentage, feeAmountCents.toString(), netPayoutCents.toString()]);
			const requestId = requestRes.rows[0].id;

			// 2. Dynamic Plurimensal Installment Schedule Loop Provisioning
			const baseInstallmentAmount = requestedAmount / BigInt(installmentsTotal);
			const remainderCents = requestedAmount % BigInt(installmentsTotal);

			const currentDate = new Date();

			for (let i = 1; i <= installmentsTotal; i++) {
				// Distribute math remainder cents directly into the first installment layer
				const installmentGross = (i === 1) ? (baseInstallmentAmount + remainderCents) : baseInstallmentAmount;

				// Calculate future monthly billing targets sequentially (YYYY-MM)
				const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
				const targetYear = targetDate.getFullYear();
				const targetMonth = String(targetDate.getMonth() + 1).padStart(2, '0');
				const billingCompetence = `${targetYear}-${targetMonth}`;

				const insertInstallmentQuery = `
					INSERT INTO advance_installments (advance_request_id, end_user_id, installment_number, gross_amount_cents, billing_competence, status)
					VALUES ($1, $2, $3, $4, $5, 'PENDING');
				`;
				await client.query(insertInstallmentQuery, [
					requestId,
					endUserId,
					i,
					installmentGross.toString(),
					billingCompetence
				]);
			}

			// 3. Append Immutable Audit Ledger Log (DEBIT)
			await client.query(`INSERT INTO financial_transactions (advance_request_id, end_user_id, type, amount_cents) VALUES ($1, $2, 'DEBIT', $3)`, [requestId, endUserId, requestedAmount.toString()]);

			await client.query('COMMIT');

			res.status(201).json({
				result: 'success',
				data: {
					requestId,
					netPayoutCents: netPayoutCents.toString(),
					dispatchedToPixKey: activePixKey
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

const advanceController = new AdvanceController();

export const routeConfig = {
	method: 'post',
	path: '/api/v1/advances/request',
	handler: [
		authorize('ADVANCE_REQUEST', 'CREATE'), // Secures ledger row generation
		validateBody(advanceRequestSchema),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => advanceRequestController.execute(req, res, next)
	]
};

