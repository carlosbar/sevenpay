// backend/src/middlewares/authMiddleware.ts
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './types';
import { ScopeTarget, ActionTarget } from '../config/security.enums';
import { BACKEND_TRANSLATIONS } from '../config/i18n';
import jwt from 'jsonwebtoken';

export interface PolicyGuardRule {
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	scope: ScopeTarget | string;
	action: ActionTarget | string;
	validateTenantIdFrom?: 'query' | 'body' | 'params';
	validateEndUserIdFrom?: 'query' | 'body' | 'params';
}

/**
 * Combined Cryptographic JWT Verifier & Matrix-Based Guard Middleware with Dynamic i18n Translation.
 * Automatically decodes incoming Bearer tokens and evaluates dynamic multi-tenant permissions.
 */
export const authorize = (rulesMatrix: PolicyGuardRule[]) => {
	return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
		// 1. Dynamically extract valid language keys configured in the backend i18n matrix file
		const validLanguages = Object.keys(BACKEND_TRANSLATIONS);
		const fallbackLang = 'pt-br';

		// 2. Intercept cookie value vector to determine active browser localization preference
		let clientLang = fallbackLang;
		if (req.headers.cookie) {
			const match = req.headers.cookie.match(new RegExp('(^| )sp_lang=([^;]+)'));
			if (match) {
				const extractedLang = match[2].toLowerCase();
				if (validLanguages.includes(extractedLang)) {
					clientLang = extractedLang;
				}
			}
		}

		const localeDictionary = BACKEND_TRANSLATIONS[clientLang] || BACKEND_TRANSLATIONS[fallbackLang];

		// 3. Intercept the standard low-case Express incoming request authorization header
		const authHeader = req.headers['authorization'];

		if (!authHeader || !String(authHeader).startsWith('Bearer ')) {
			const token = 'AUTH_TOKEN_MISSING';
			res.status(401).json({ 
				result: 'error', 
				errorToken: token, 
				reason: localeDictionary[token] || 'Security gateway violation. Authorization Bearer token header is missing or malformed.' 
			});
			return;
		}

		// 4. Extract and verify the cryptographic signature of the active JWT token
		const tokenParts = String(authHeader).split(' ');
		const token = tokenParts[1];
		const secretKey = process.env.JWT_SECRET;

		if (!secretKey) {
			const token = 'CORE_PROTECTION_CONFIG_MISSING';
			res.status(500).json({ 
				result: 'error', 
				errorToken: token, 
				reason: localeDictionary[token] || 'Internal encryption failure. The backend ecosystem lacks a valid JWT_SECRET configuration key.' 
			});
			return;
		}

		try {
			// Synchronously execute verification and store payload into the request life-cycle context
			const decoded = jwt.verify(token, secretKey) as any;
			req.userContext = decoded;
		} catch (jwtError) {
			res.status(401).json({ 
				result: 'error', 
				errorToken: 'AUTH_TOKEN_INVALID', 
				reason: localeDictionary['AUTH_CREDENTIALS_INVALID'] || 'Security signature mismatch. The provided token is either expired or cryptographically corrupt.' 
			});
			return;
		}

		const context = req.userContext;
		if (!context) {
			res.status(401).json({ result: 'error', errorToken: 'AUTH_CONTEXT_CORRUPT', reason: 'Identity validation failure.' });
			return;
		}

		// 5. Enforce absolute uppercase normalization across execution validation strings
		const currentMethod = req.method.toUpperCase();
		const currentScope = String(context.scope).toUpperCase();

		const extractId = (loc: 'query' | 'body' | 'params' | undefined, key: string): string | null => {
			if (!loc) return null;
			return (req[loc] && req[loc][key]) ? String(req[loc][key]) : null;
		};

		// 6. Evaluate matrix policies to find a valid rule matching the transaction signature
		const hasValidCredentials = rulesMatrix.some(rule => {
			const ruleMethod = rule.method.toUpperCase();
			const ruleScope = String(rule.scope).toUpperCase();

			// A. Match baseline HTTP signature and Role Scope parameters
			const matchSignature = ruleMethod === currentMethod && ruleScope === currentScope;
			if (!matchSignature) return false;

			// MASTER scope is omnipotent and bypasses cross-checks
			if (currentScope === 'MASTER') return true;

			// B. Enforce Horizontal Tenant Cross-Check Bounds via strict validation
			if (rule.validateTenantIdFrom) {
				const requestedTenantId = extractId(rule.validateTenantIdFrom, 'tenantId');
				if (!requestedTenantId || requestedTenantId !== context.tenantId) {
					return false;
				}
			}

			// C. Enforce Horizontal EndUser Cross-Check Bounds via strict validation
			if (rule.validateEndUserIdFrom) {
				const requestedEndUserId = extractId(rule.validateEndUserIdFrom, 'endUserId');
				if (!requestedEndUserId || requestedEndUserId !== context.endUserId) {
					return false;
				}
			}

			return true;
		});

		if (!hasValidCredentials) {
			res.status(403).json({ 
				result: 'error', 
				errorToken: 'RBAC_FORBIDDEN_MATRIX',
				reason: localeDictionary['RBAC_FORBIDDEN_MATRIX'] || `Access denied. Insufficient administrative privileges for scope ${currentScope} over method ${currentMethod}.` 
			});
			return;
		}

		// 7. All validation barriers cleared successfully. Pass execution to the controller layer.
		next();
	};
};
