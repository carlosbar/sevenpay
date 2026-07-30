// src/controllers/advanceController.ts
import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db'; // O arquivo db.ts que estruturamos
import { PoolClient } from 'pg';

export class AdvanceController {
  
  /**
   * @openapi
   * /api/v1/advances/request:
   *   post:
   *     summary: Request a new credit advance payout
   *     description: Processes a credit advance request, executing strict multi-tenant validations, row locking, and cumulative monthly balance limits using 64-bit integer cents.
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
   *                 description: Value in raw cents (e.g., 50000 represents R$ 500,00)
   *               installmentsTotal:
   *                 type: integer
   *                 example: 1
   *                 description: Number of split months selected for billing
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
   *                       example: "e43b171c-4b53-4877-bbdf-a226bc2ef1e0"
   *                     netPayoutCents:
   *                       type: string
   *                       example: "48250"
   *                     dispatchedToPixKey:
   *                       type: string
   *                       example: "12345678900"
   *       422:
   *         description: Unprocessable entity due to business or risk rule violation
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 result:
   *                   type: string
   *                   example: "error"
   *                 reason:
   *                   type: string
   *                   example: "The cumulative requested volume breaches the real monthly allowable margin for this installment tier."
   */
  public async requestAdvance(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { endUserId, requestedAmountCents, installmentsTotal } = req.body;

    // 1. Pega uma conexão dedicada do pool nativo para gerenciar a transação manualmente
    const client: PoolClient = await db.getClient();

    try {
      await client.query('BEGIN');

      // STEP 2 & 4: Fetch Risk Matrix, Base Contract and apply row-level write lock (FOR UPDATE)
      const userQuery = `
        SELECT u.id, u.tenant_id, u.monthly_contract_value_cents, u.margin_available_cents,
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

      // STEP 3: Monthly Cumulative Spending Audit (Calculate what was already advanced this month)
      const cumulativeQuery = `
        SELECT COALESCE(SUM(requested_amount_cents), 0) as total_advanced
        FROM advance_requests
        WHERE end_user_id = $1 
          AND status != 'REJECTED'
          AND created_at >= date_trunc('month', current_timestamp);
      `;
      const cumulativeRes = await client.query(cumulativeQuery, [endUserId]);
      const totalAdvancedThisMonth = BigInt(cumulativeRes.rows[0].total_advanced);

      // STEP 4: Math Calculations in 64-bit BigInt Cents
      const monthlyContractValue = BigInt(user.monthly_contract_value_cents);
      const maxAdvancePercentage = Number(user.max_advance_percentage);
      const requestedAmount = BigInt(requestedAmountCents);

      const maxAllowableCapacity = (monthlyContractValue * BigInt(Math.round(maxAdvancePercentage * 100))) / BigInt(10000);
      const realAvailableMargin = maxAllowableCapacity - totalAdvancedThisMonth;

      if (requestedAmount > realAvailableMargin || requestedAmount > BigInt(user.margin_available_cents)) {
        throw { statusCode: 422, message: 'The cumulative requested volume breaches the real monthly allowable margin for this installment tier.' };
      }

      // STEP 6: Fee & Payout Calculations
      const feePercentage = Number(user.fee_percentage);
      const feeAmountCents = (requestedAmount * BigInt(Math.round(feePercentage * 100))) / BigInt(10000);
      const netPayoutCents = requestedAmount - feeAmountCents;

      // STEP 7: Pix Dispatch Routing Optimization (Picks priority 0 key)
      const pixQuery = `
        SELECT key_type, key_value 
        FROM pix_accounts 
        WHERE end_user_id = $1 
        ORDER BY priority ASC 
        LIMIT 1;
      `;
      const pixRes = await client.query(pixQuery, [endUserId]);

      if (pixRes.rowCount === 0) {
        throw { statusCode: 422, message: 'No valid active Pix account destination route registered for this end user.' };
      }

      const activePixKey = pixRes.rows[0].key_value;

      // STEP 8: Batch Ledger Persistence
      // 1. Deduct Margin
      await client.query(`UPDATE end_users SET margin_available_cents = margin_available_cents - $1 WHERE id = $2`, [requestedAmount.toString(), endUserId]);
      
      // 2. Insert Advance Request Header
      const insertRequest = `
        INSERT INTO advance_requests (end_user_id, requested_amount_cents, installments_total, fee_percentage, fee_amount_cents, net_payout_cents, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'APPROVED') RETURNING id;
      `;
      const requestRes = await client.query(insertRequest, [endUserId, requestedAmount.toString(), installmentsTotal, feePercentage, feeAmountCents.toString(), netPayoutCents.toString()]);
      const requestId = requestRes.rows[0].id;

      // 3. Append Immutable Audit Ledger Log (DEBIT)
      await client.query(`INSERT INTO financial_transactions (advance_request_id, end_user_id, type, amount_cents) VALUES ($1, $2, 'DEBIT', $3)`, [requestId, endUserId, requestedAmount.toString()]);

      // Complete Transaction
      await client.query('COMMIT');

      // Uniform HTTP 201 Success Response Envelope
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
      next(error); // Encaminha o erro para o Middleware Global (errorHandler)
    } finally {
      client.release(); // Libera o client de volta ao pool
    }
  }
}
