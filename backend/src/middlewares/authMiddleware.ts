// src/middlewares/authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend Express Request interface to host audited token payload
export interface AuthenticatedRequest extends Request {
	userContext?: {
		operatorId: string;
		email: string;
		role: string;
		scope: 'MASTER' | 'TENANT' | 'END_USER';
		permissions: {
			read: boolean;
			create: boolean;
			update: boolean;
			delete: boolean;
		};
		tenantId: string | null;
		endUserId: string | null;
	};
}

/**
 * Authorization Guard Factory.
 * Validates JWT integrity and verifies if the operator role satisfies the required action flag.
 * Ensures the response strictly adheres to the standard JSON {"result": "error", "reason": "..."} envelope.
 */
export function authorize(requiredPermission: 'read' | 'create' | 'update' | 'delete') {
	return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
		const authHeader = req.headers.authorization;

		try {
			// 1. Validates the presence of the Bearer Token format
			if (!authHeader || !authHeader.startsWith('Bearer ')) {
				throw { statusCode: 401, message: 'Access denied. Missing or malformed Authorization token header.' };
			}

			// 2. Cryptographically verifies token signature and expiration
			const secretKey = process.env.JWT_SECRET;
			
			// CRITICAL RISK GATE: Prevent validation using missing operational secrets
			if (!secretKey) {
				console.error('[SECURITY COMPROMISED]: JWT_SECRET environment variable is missing on this node infrastructure.');
				throw { statusCode: 500, message: 'Internal ledger protection configuration error. Cryptographic subsystem unavailable.' };
			}

			// FIXED: Replaced duplicate "const token" with a single safe token extraction
			const tokenParts = authHeader.split(' ');
			const tokenString = tokenParts[1];
			
			let decodedPayload: any;
			try {
				decodedPayload = jwt.verify(tokenString, secretKey);
			} catch (jwtError: any) {
				if (jwtError.name === 'TokenExpiredError') {
					throw { statusCode: 401, message: 'Authentication failed. Active session token has expired.' };
				}
				throw { statusCode: 401, message: 'Authentication failed. Cryptographic token signature is invalid.' };
			}

			// 3. Asserts if the structural matrix permission flag allows the action
			const userPermissions = decodedPayload.permissions;
			if (!userPermissions || !userPermissions[requiredPermission]) {
				throw { statusCode: 403, message: 'Forbidden. Your security role lacks the authorization parameters to execute this resource.' };
			}

			// 4. Binds the secure, decrypted multi-tenant context boundary into the request pipeline
			req.userContext = {
				operatorId: decodedPayload.operatorId,
				email: decodedPayload.email,
				role: decodedPayload.role,
				scope: decodedPayload.scope,
				permissions: decodedPayload.permissions,
				tenantId: decodedPayload.tenantId,
				endUserId: decodedPayload.endUserId
			};

			next(); // Authentication checks passed, clear transaction forward to the handler
		} catch (error) {
			next(error); // Route validation exception to the standard response envelope middleware
		}
	};
}
