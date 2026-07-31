// src/controllers/endUserInspectController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';

class EndUserInspectController {

	/**
	 * @openapi
	 * /api/v1/admin/end-users/inspect:
	 *   get:
	 *     summary: Deep 360 inspect of a specific credit consumer profile (End User)
	 *     description: Compiles complete individual financial registry telemetry. Fetches active contract limits, priority-sorted Pix keys, historical advance request blocks, and outstanding amortization installment schedules.
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

			// 1. Fetch core consumer profile ensuring write locked isolation checks
			const userQuery = `
				SELECT id, tenant_id AS "tenantId", external_id AS "externalId", name, 
				       monthly_contract_value_cents::text AS "monthlyContractValueCents", 
				       margin_available_cents::text AS "marginAvailableCents", status, created_at AS "createdAt"
				FROM end_users WHERE id = $1;
			`;
			const userRes = await db.query(userQuery, [endUserId]);

			if (userRes.rowCount === 0) {
				throw { statusCode: 404, message: 'Target credit consumer profile registry record not found.' };
			}

			const endUser = userRes.rows[0];

			// 2. Strict Security Gate: Block horizontal tenant leaks across B2B boundaries
			if (context.scope === 'TENANT') {
				if (context.tenantId !== endUser.tenantId) {
					throw { statusCode: 403, message: 'Access denied. Security boundary breach detected. This consumer profile belongs to another client company portfolio.' };
				}
			} else if (context.scope === 'END_USER') {
				if (context.endUserId !== endUser.id) {
					throw { statusCode: 403, message: 'Access denied. Consumer application logs are strictly restricted to your own signed profile identifier.' };
				}
			}

			// 3. Fetch priority-sorted Pix receiving route keys (ASC order where 0 is root)
			const pixQuery = `
				SELECT id, key_type AS "keyType", key_value AS "keyValue", priority 
				FROM pix_accounts WHERE end_user_id = $1 ORDER BY priority ASC;
			`;
			const pixRes = await db.query(pixQuery, [endUserId]);

			// 4. Fetch the entire advance request workflow headers list
			const requestsQuery = `
				SELECT id, requested_amount_cents::text AS "requestedAmountCents", installments_total AS "installmentsTotal", 
				       fee_percentage AS "feePercentage", fee_amount_cents::text AS "feeAmountCents", 
				       net_payout_cents::text AS "netPayoutCents", status, created_at AS "createdAt"
				FROM advance_requests WHERE end_user_id = $1 ORDER BY created_at DESC;
			`;
			const requestsRes = await db.query(requestsQuery, [endUserId]);

			// 5. Fetch future scheduled monthly amortization competence rows
			const installmentsQuery = `
				SELECT id, advance_request_id AS "advanceRequestId", installment_number AS "installmentNumber", 
				       gross_amount_cents::text AS "grossAmountCents", billing_competence AS "billingCompetence", status
				FROM advance_installments WHERE end_user_id = $1 ORDER BY billing_competence ASC, installment_number ASC;
			`;
			const installmentsRes = await db.query(installmentsQuery, [endUserId]);

			// 6. Dispatch standard unified success payload back to dashboard workspace grid view
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

export const routeConfig = {
	method: 'get',
	path: '/api/v1/admin/end-users/inspect',
	handler: [
		authorize('read'),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => endUserInspectController.inspectEndUser(req, res, next)
	]
};
