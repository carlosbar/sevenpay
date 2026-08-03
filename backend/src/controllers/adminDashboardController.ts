// src/controllers/adminDashboardController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';

class AdminDashboardController {

	/**
	 * @openapi
	 * /api/v1/admin/dashboard/metrics:
	 *   get:
	 *     summary: Compute aggregated liquidity matrix telemetry for the Fintech Control Tower
	 *     description: Runs highly optimized real-time database aggregations over immutable transactional ledger logs and plurimensal installment competence layers. Restricted exclusively to MASTER scope accounts.
	 *     tags:
	 *       - Fintech Dashboard
	 *     security:
	 *       - BearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Global financial ledger metrics compiled and synchronized successfully
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
	 *                     metrics:
	 *                       type: object
	 *                       properties:
	 *                         totalVolumeAdvancedCents:
	 *                           type: integer
	 *                           example: 25000000
	 *                         totalFeesCollectedCents:
	 *                           type: integer
	 *                           example: 875000
	 *                         totalReceivablesCents:
	 *                           type: integer
	 *                           example: 24125000
	 *                         totalOverdueCents:
	 *                           type: integer
	 *                           example: 50000
	 *       401:
	 *         description: Security framework violation. Mismatched profile token.
	 *       403:
	 *         description: Access denied due to horizontal tenant scope boundaries.
	 */
	public async getMetrics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		try {
			const context = req.userContext;

			// 1. Verify global security infrastructure matrix constraints
			if (!context) {
				throw { statusCode: 401, message: 'Security framework violation. Authenticated profile context missing.' };
			}

			if (context.scope !== 'MASTER') {
				throw { statusCode: 403, message: 'Access denied. Dashboard global analytics are strictly restricted to management teams.' };
			}
			// 2. Run real-time aggregate queries over the immutable ledger logs and amortization calendar
			const metricsQuery = `
				SELECT
					(
						SELECT COALESCE(SUM(requested_amount_cents), 0)::text 
						FROM advance_requests 
						WHERE status != 'REJECTED'
					) AS "totalVolumeAdvancedCents",
					(
						SELECT COALESCE(SUM(fee_amount_cents), 0)::text 
						FROM advance_requests 
						WHERE status != 'REJECTED'
					) AS "totalFeesCollectedCents",
					(
						SELECT COALESCE(SUM(gross_amount_cents), 0)::text 
						FROM advance_installments 
						WHERE status = 'PENDING'
					) AS "totalReceivablesCents",
					(
						SELECT COALESCE(SUM(gross_amount_cents), 0)::text 
						FROM advance_installments 
						WHERE status = 'OVERDUE'
					) AS "totalOverdueCents";
			`;

			const metricsRes = await db.query(metricsQuery);
			const rowData = metricsRes.rows[0];

			// 3. Dispatch standard unified success envelope matching the frontend Angular interface expectations
			res.status(200).json({
				result: 'success',
				data: {
					metrics: {
						totalVolumeAdvancedCents: rowData.totalVolumeAdvancedCents,
						totalFeesCollectedCents: rowData.totalFeesCollectedCents,
						totalReceivablesCents: rowData.totalReceivablesCents,
						totalOverdueCents: rowData.totalOverdueCents
					}
				}
			});

		} catch (error) {
			next(error); // Bubbles exception up to global error handler middleware
		}
	}
}

const adminDashboardController = new AdminDashboardController();

// Map route configuration structure for automated injection framework
export const routeConfig = {
	method: 'get',
	path: '/api/v1/admin/dashboard/metrics',
	handler: [
		authorize('read'), // Asserts RBAC matrix permissions allow master view data extraction
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => adminDashboardController.getMetrics(req, res, next)
	]
};
