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
	// 1. Dynamically extract valid language keys configured in the backend i18n matrix file
	const validLanguages = Object.keys(BACKEND_TRANSLATIONS); // e.g., ['pt-br', 'en']
	const serverFallback = validLanguages.includes('pt-br') ? 'pt-br' : (validLanguages[0] || 'en');

	// 2. Determine active browser localization preference utilizing a multi-layered extraction fallback strategy
	let clientLang = serverFallback;

	// A. Check for custom immutable X-Language custom header vector (Ideal for localhost cross-origin ports)
	const headerLang = req.headers['x-language'] || req.headers['X-Language'];
	if (headerLang) {
		const parsedHeaderLang = String(headerLang).toLowerCase();
		if (validLanguages.includes(parsedHeaderLang)) {
			clientLang = parsedHeaderLang;
		}
	} 
	// B. Fallback to standard cookie array inspection layers if headers are absent
	else if (req.headers.cookie) {
		const match = req.headers.cookie.match(new RegExp('(^| )sp_lang=([^;]+)'));
		if (match && match[2]) {
			const extractedLang = String(match[2]).toLowerCase();
			if (validLanguages.includes(extractedLang)) {
				clientLang = extractedLang;
			}
		}
	}
	
	const localeDictionary = BACKEND_TRANSLATIONS[clientLang] || BACKEND_TRANSLATIONS[serverFallback];

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
	
	// 3. SERVER TERMINAL LOG ENGINE: Track original messages securely in infrastructure bounds
	if (isControlledError) {
		console.warn(`[SevenPay-App-Warning] Handled application exception [${err.errorToken}]:`, err.message || err.reason || err);
	} else {
		console.error('[SevenPay-Infrastructure-Crash] Raw crash message intercepted:', err.message || err);
		if (err.stack) {
			console.error('[SevenPay-Infrastructure-Crash] Stack Trace:', err.stack);
		}
	}

	// 4. 🛡️ CRITICAL PUBLIC LAYER MASKING LINKED TO I18N ENTRIES
	const statusCode = isControlledError ? err.statusCode : 500;
	const token = isControlledError ? (err.errorToken || 'INTERNAL_SERVER_ERROR') : 'INTERNAL_SERVER_ERROR';
	
	// 📐 DYNAMIC INTERCEPTION: Safe generic fallback bound directly to the translated localized dictionary matrix entry
	const safeGenericFallback = localeDictionary['INTERNAL_SERVER_ERROR'] || 'Erro interno do servidor, solicite suporte.';
	const reasonMessage = isControlledError ? (localeDictionary[token] || err.reason || err.message) : safeGenericFallback;

	res.status(statusCode).json({
		result: 'error',
		errorToken: token,
		reason: reasonMessage
	});
}
