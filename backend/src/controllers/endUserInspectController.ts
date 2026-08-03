// src/controllers/endUserInspectController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';
import { ScopeTarget, ActionTarget } from '../config/security.enums';

class EndUserInspectController {

	/**
	 * @openapi
	 * /api/v1/admin/end-users/inspect:
	 *   get:
	 *     summary: Deep 360 inspect of a specific credit consumer profile (End User)
	 *     description: Compiles complete individual financial registry telemetry. Fetches active contract limits, priority-sorted Pix keys, historical advance request blocks, and outstanding amortization installment schedules using real-time dynamic margin logic.
	 *     tags:
	 *       - Administration Lookup
	 *     security:
	 *       - BearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: endUserId
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *         description: The target consumer profile UUID (Required parameter across all authorization settings)
	 *     responses:
	 *       200:
	 *         description: Consumer individual audit ledger blocks compiled and synchronized successfully
	 *       403:
	 *         description: Access denied due to horizontal multi-tenant boundary verification leaks
	 */
	public async inspectEndUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		try {
			const context = req.userContext;
			const { endUserId } = req.query;

			if (!context) {
				throw { statusCode: 401, message: 'Security framework violation. Authenticated profile context missing.' };
			}

			if (!endUserId) {
				throw { statusCode: 422, message: 'Processing failed. Query parameters must provide a target endUserId identifier.' };
			}

			// 1. Fetch core consumer profile calculating margin balance in real-time from active ledger requests
			const userQuery = `
				SELECT 
					u.id, 
					u.tenant_id AS "tenantId", 
					u.external_id AS "externalId", 
					u.name, 
					u.monthly_contract_value_cents::text AS "monthlyContractValueCents", 
					(
						COALESCE((u.monthly_contract_value_cents * m.max_advance_percentage / 100), 0) - 
						COALESCE((
							SELECT SUM(r.requested_amount_cents) 
							FROM advance_requests r 
							WHERE r.end_user_id = u.id 
							  AND r.status != 'REJECTED' 
							  AND r.created_at >= date_trunc('month', current_timestamp)
						), 0)
					)::text AS "marginAvailableCents", 
					u.status, 
					u.created_at AS "createdAt"
				FROM end_users u
				LEFT JOIN tenant_fee_matrices m ON m.tenant_id = u.tenant_id AND m.installments_count = 1
				WHERE u.id = $1;
			`;
			const userRes = await db.query(userQuery, [endUserId]);

			if (userRes.rowCount === 0) {
				throw { statusCode: 404, message: 'Target credit consumer profile registry record not found.' };
			}

			const endUser = userRes.rows[0];

			// 2. Fetch priority-sorted Pix receiving route keys (ASC order where 0 is root)
			const pixQuery = `
				SELECT id, key_type AS "keyType", key_value AS "keyValue", priority 
				FROM pix_accounts WHERE end_user_id = $1 ORDER BY priority ASC;
			`;
			const pixRes = await db.query(pixQuery, [endUserId]);

			// 3. Fetch the entire advance request workflow headers list
			const requestsQuery = `
				SELECT id, requested_amount_cents::text AS "requestedAmountCents", installments_total AS "installmentsTotal", 
				       fee_percentage AS "feePercentage", fee_amount_cents::text AS "feeAmountCents", 
				       net_payout_cents::text AS "netPayoutCents", status, created_at AS "createdAt"
				FROM advance_requests WHERE end_user_id = $1 ORDER BY created_at DESC;
			`;
			const requestsRes = await db.query(requestsQuery, [endUserId]);

			// 4. Fetch future scheduled monthly amortization competence rows
			const installmentsQuery = `
				SELECT id, advance_request_id AS "advanceRequestId", installment_number AS "installmentNumber", 
				       gross_amount_cents::text AS "grossAmountCents", billing_competence AS "billingCompetence", status
				FROM advance_installments WHERE end_user_id = $1 ORDER BY billing_competence ASC, installment_number ASC;
			`;
			const installmentsRes = await db.query(installmentsQuery, [endUserId]);

			// 5. Dispatch standard unified success payload back to dashboard workspace grid view
			res.status(200).json({
				result: 'success',
				data: {
					profile: endUser,
					pixAccounts: pixRes.rows,
					advanceRequests: requestsRes.rows,
					amortizationInstallments: installmentsRes.rows
				}
			});

		} catch (error) {
			next(error);
		}
	}
}

const endUserInspectController = new EndUserInspectController();

// Export the dynamic automated discovery route specification mapping contract
export const routeConfig = {
	method: 'get',
	path: '/api/v1/admin/end-users/inspect',
	handler: [
		// 🛡️ Matrix policy framework isolating horizontal data visibility via declarative cross-checks
		authorize([
			{ method: 'GET', scope: ScopeTarget.MASTER,   action: ActionTarget.READ },
			{ method: 'GET', scope: ScopeTarget.TENANT,   action: ActionTarget.READ, validateTenantIdFrom: 'query' },
			{ method: 'GET', scope: ScopeTarget.END_USER, action: ActionTarget.READ, validateEndUserIdFrom: 'query' }
		]),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => endUserInspectController.inspectEndUser(req, res, next)
	]
};
