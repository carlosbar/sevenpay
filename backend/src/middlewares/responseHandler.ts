import { Request, Response, NextFunction } from 'express';
import { BACKEND_TRANSLATIONS } from '../config/i18n';

/**
 * Global Error Handling Middleware with Dynamic i18n Translation.
 * Intercepts all runtime exceptions and forces the uniform JSON {"result": "error", "errorToken": "...", "reason": "..."} envelope.
 */
export function errorHandler(
	err: any, 
	req: Request, 
	res: Response, 
	next: NextFunction
): void {
	const validLanguages = Object.keys(BACKEND_TRANSLATIONS);
	const fallbackLang = validLanguages[0] || 'pt-br';

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

	// 1. PostgreSQL specific unique constraint violation handling mapped to dynamic token metrics
	if (err && err.code === '23505') {
		console.error('[SevenPay-Database-Conflict] Duplicate key violation captured:', err.message || err);
		const token = 'TENANT_CNPJ_ALREADY_EXISTS';
		res.status(409).json({
			result: 'error',
			errorToken: token,
			reason: localeDictionary[token] || 'A unique database conflict record constraint was triggered.'
		});
		return;
	}

	// 2. Determine if the error is handled by a custom controller status rule
	const isControlledError = err && typeof err.statusCode === 'number' && err.statusCode > 0;
	
	// 3. 🧠 SERVER TERMINAL LOG ENGINE: Track original messages securely in infrastructure bounds
	if (isControlledError) {
		console.warn(`[SevenPay-App-Warning] Handled application exception [${err.errorToken}]:`, err.message || err.reason || err);
	} else {
		// This logs the RAW original string (e.g., ECONNREFUSED 127.0.0.1:5432) strictly inside your secure server terminal
		console.error('[SevenPay-Infrastructure-Crash] Raw crash message intercepted:', err.message || err);
		if (err.stack) {
			console.error('[SevenPay-Infrastructure-Crash] Stack Trace:', err.stack);
		}
	}

	// 4. 🛡️ CRITICAL PUBLIC LAYER MASKING
	const statusCode = isControlledError ? err.statusCode : 500;
	const token = isControlledError ? (err.errorToken || 'INTERNAL_SERVER_ERROR') : 'INTERNAL_SERVER_ERROR';
	
	// Dynamic default fallback masking string decoupled from client eyes
	const safeGenericFallback = 'An unexpected internal ledger or processing error occurred. Please verify database connection.';
	const reasonMessage = localeDictionary[token] || (isControlledError ? (err.reason || err.message) : safeGenericFallback);

	res.status(statusCode).json({
		result: 'error',
		errorToken: token,
		reason: reasonMessage
	});
}
