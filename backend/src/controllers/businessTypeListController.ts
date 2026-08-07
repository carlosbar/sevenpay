// src/controllers/businessTypeListController.ts
import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { AuthenticatedRequest, authorize } from '../middlewares/authMiddleware';
import { ScopeTarget, ActionTarget } from '../config/security.enums';

class BusinessTypeListController {

	/**
	 * @openapi
	 * /api/v1/business-types:
	 *   get:
	 *     summary: List registered tenant business types
	 *     description: Retrieves the lookup matrix of business/vertical classifications available for tenant provisioning (e.g. HR, REAL_ESTATE).
	 *     tags:
	 *       - Admin Dashboard
	 *     security:
	 *       - BearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Business type registers fetched successfully
	 *       401:
	 *         description: Authenticated profile context missing
	 *       403:
	 *         description: Access denied for non-master operators
	 */
	public async listBusinessTypes(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
		try {
			const context = req.userContext;

			if (!context) {
				throw { statusCode: 401, errorToken: 'AUTH_CREDENTIALS_INVALID' };
			}

			const result = await db.query(`SELECT code, name FROM business_types ORDER BY name ASC;`);

			res.status(200).json({
				result: 'success',
				data: { businessTypes: result.rows }
			});

		} catch (error) {
			next(error);
		}
	}
}

const businessTypeListController = new BusinessTypeListController();

// Export the dynamic automated discovery route specification mapping contract
export const routeConfig = {
	method: 'get',
	path: '/api/v1/business-types',
	handler: [
		authorize([
			{ method: 'GET', scope: ScopeTarget.MASTER, action: ActionTarget.READ }
		]),
		(req: AuthenticatedRequest, res: Response, next: NextFunction) => businessTypeListController.listBusinessTypes(req, res, next)
	]
};
