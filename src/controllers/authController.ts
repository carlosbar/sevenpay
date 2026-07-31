// src/controllers/authController.ts
import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';

class AuthController {

  /**
   * @openapi
   * /api/v1/auth/login:
   *   post:
   *     summary: Authenticate a system operator
   *     description: Validates operator credentials using a separate salt mechanism (<password>:salt) and returns a signed JWT with granular RBAC permissions.
   *     tags:
   *       - Authentication
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - password
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: "admin@sevenpay.com.br"
   *               password:
   *                 type: string
   *                 example: "YourPasswordHere"
   *     responses:
   *       200:
   *         description: Authentication successful
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
   *                     token:
   *                       type: string
   *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   *                     role:
   *                       type: string
   *                       example: "SYSADMIN"
   *       401:
   *         description: Invalid email or password credentials
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
   *                   example: "Invalid email or password credentials provided."
   *       500:
   *         description: Cryptographic subsystem failure due to missing configuration keys
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
   *                   example: "Internal ledger protection configuration error. Cryptographic subsystem unavailable."
   */
  public async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { email, password } = req.body;

    try {
      const loginQuery = `
        SELECT o.id, o.password_hash, o.password_salt, o.role_name, o.status,
               r.scope, r.can_read, r.can_create, r.can_update, r.can_delete,
               p.tenant_id, p.end_user_id
        FROM system_operators o
        JOIN system_roles r ON r.name = o.role_name
        LEFT JOIN operator_profiles p ON p.operator_id = o.id
        WHERE o.email = $1 AND o.status = 'ACTIVE';
      `;
      const operatorRes = await db.query(loginQuery, [email]);

      if (operatorRes.rowCount === 0) {
        throw { statusCode: 401, message: 'Invalid email or password credentials provided.' };
      }

      const operator = operatorRes.rows[0];

      const inputToHash = `${password}:${operator.password_salt}`;
      const generatedHash = crypto.createHash('sha256').update(inputToHash).digest('hex');

      const isPasswordValid = crypto.timingSafeEqual(
        Buffer.from(generatedHash, 'utf-8'),
        Buffer.from(operator.password_hash, 'utf-8')
      );

      if (!isPasswordValid) {
        throw { statusCode: 401, message: 'Invalid email or password credentials provided.' };
      }

      const jwtPayload = {
        operatorId: operator.id,
        email: email,
        role: operator.role_name,
        scope: operator.scope,
        permissions: {
          read: operator.can_read,
          create: operator.can_create,
          update: operator.can_update,
          delete: operator.can_delete
        },
        tenantId: operator.tenant_id,
        endUserId: operator.end_user_id
      };

      // 5. Signs the cryptographically protected token with expiration window
      const secretKey = process.env.JWT_SECRET;

      // CRITICAL RISK GATE: Prevent token signing using weak or missing operational secrets
      if (!secretKey) {
        console.error('[SECURITY COMPROMISED]: JWT_SECRET environment variable is missing on this node infrastructure.');
        throw { statusCode: 500, message: 'Internal ledger protection configuration error. Cryptographic subsystem unavailable.' };
      }

      const token = jwt.sign(jwtPayload, secretKey, { expiresIn: '8h' });

      res.status(200).json({
        result: 'success',
        data: {
          token,
          role: operator.role_name
        }
      });

    } catch (error) {
      next(error);
    }
  }

// Instantiate the private controller context
const authController = new AuthController();

// Export the dynamic automated discovery route specification mapping contract
export const routeConfig = {
  method: 'post',
  path: '/api/v1/auth/login',
  handler: (req: Request, res: Response, next: NextFunction) => authController.login(req, res, next)
};
