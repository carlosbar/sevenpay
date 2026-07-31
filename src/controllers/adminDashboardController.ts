// src/controllers/adminDashboardController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';

class AdminDashboardController {

	/**
	 * @openapi
	 * /api/v1/admin/dashboard/metrics:
	 *   get:
	 *     summary: Retrieve global fintech financial operational metrics
	 *     description: Aggregates historical platform performance indices, revenue metadata, collection rates, default risk factors, and tenant balance utilization profiles. Restricted exclusively to master operations.
	 *     tags:
	 *       - Admin Dashboard
	 *     security:
	 *       - BearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Global management analytical telemetry compiled successfully
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
	 *                     summary:
	 *                       type: object
	 *                       properties:
	 *                         totalVolumeAdvancedCents:
	 *                           type: string
	 *                           example: "25000000"
	 *                         totalFeesCollectedCents:
	 *                           type: string
	 *                           example: "875000"
	 *                         totalOverdueCents:
	 *                           type: string
	 *                           example: "120000"
	 *                         activeDefaultRatePercentage:
	 *                           type: string
	 *                           example: "0.48"
	 *                     tenantPortfolios:
	 *                       type: array
	 *                       items:
	 *                         type: object
	 *                         properties:
	 *                           tenantId:
	 *                             type: string
	 *                             format: uuid
	 *                           tenantName:
	 *                             type: string
	 *                           globalLimitCents:
	 *                             type: string
	 *                           totalUtilizedCents:
	 *                             type: string
	 *                           utilizationPercentage:
	 *                             type: string
	 *       401:
	 *         description: Missing or invalid authentication token context
	 *       403:
	 *         description: Lack of master administration role access parameter settings
	 */
	public async getMetrics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		try {
			const context = req.userContext;

			if (!context) {
				throw { statusCode: 401, message: 'Security framework violation. Authenticated transaction profile context missing.' };
			}

			// 1. Enforce strict platform scope isolation barrier (Only MASTER operators allowed)
			if (context.scope !== 'MASTER') {
				throw { statusCode: 403, message: 'Access denied. Workspace metrics are exclusively provisioned for the core fintech management team.' };
			}

			// 2. Compile high-performance aggregated metrics queries with safe string casts for BIGINT types
			const metricsSummaryQuery = `
				SELECT 
					COALESCE(SUM(requested_amount_cents), 0)::text AS "totalVolumeAdvancedCents",
					COALESCE(SUM(fee_amount_cents), 0)::text AS "totalFeesCollectedCents",
					(
						SELECT COALESCE(SUM(gross_amount_cents), 0) 
						FROM advance_installments 
						WHERE status = 'OVERDUE'
					) AS "rawOverdue"
				FROM advance_requests
				WHERE status != 'REJECTED';
			`;

			const summaryRes = await db.query(metricsSummaryQuery);
			const summaryRow = summaryRes.rows[0];
			
			const totalVolume = BigInt(summaryRow.totalVolumeAdvancedCents);
			const totalOverdue = BigInt(summaryRow.rawOverdue);

			// Calculate risk delinquency rate avoiding division by zero
			let defaultRate = "0.00";
			if (totalVolume > BigInt(0)) {
				// Precision calculation moving scale to preserve decimals before casting
				defaultRate = ((Number(totalOverdue) / Number(totalVolume)) * 100).toFixed(2);
			}

			// 3. Compile portfolio credit assignment lookups across the B2B landscape
			const tenantPortfolioQuery = `
				SELECT 
					t.id AS "tenantId",
					t.name AS "tenantName",
					t.global_credit_limit_cents::text AS "globalLimitCents",
					COALESCE(SUM(r.requested_amount_cents), 0) AS "rawUtilized"
				FROM tenants t
				LEFT JOIN end_users u ON u.tenant_id = t.id
				LEFT JOIN advance_requests r ON r.end_user_id = u.id AND r.status != 'REJECTED'
				GROUP BY t.id, t.name, t.global_credit_limit_cents
				ORDER BY "rawUtilized" DESC;
			`;

			const portfolioRes = await db.query(tenantPortfolioQuery);
			
			// Map and evaluate allocation metrics dynamically
			const tenantPortfolios = portfolioRes.rows.map(row => {
				const limit = BigInt(row.globalLimitCents);
				const utilized = BigInt(row.rawUtilized);
				
				let utilizationPercentage = "0.00";
				if (limit > BigInt(0)) {
					utilizationPercentage = ((Number(utilized) / Number(limit)) * 100).toFixed(2);
				}

				return {
					tenantId: row.tenantId,
					tenantName: row.tenantName,
					globalLimitCents: row.globalLimitCents,
					totalUtilizedCents: utilized.toString(),
					utilizationPercentage
				};
			});

			// 4. Dispatch standard structured financial analytical envelope
			res.status(200).json({
				result: 'success',
				data: {
					summary: {
						totalVolumeAdvancedCents: summaryRow.totalVolumeAdvancedCents,
						totalFeesCollectedCents: summaryRow.totalFeesCollectedCents,
						totalOverdueCents: totalOverdue.toString(),
						activeDefaultRatePercentage: defaultRate
					},
					tenantPortfolios
				}
			});

		} catch (error) {
			next(error);
		}
	}
}

const adminDashboardController = new AdminDashboardController();

// Map route setup contract structure for automated node server injection framework
export const routeConfig = {
	method: 'get',
	path: '/api/v1/admin/dashboard/metrics',
	handler: [
		authorize('read'), // Asserts RBAC permission requirements are validated before processing analytics
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => adminDashboardController.getMetrics(req, res, next)
	]
};
