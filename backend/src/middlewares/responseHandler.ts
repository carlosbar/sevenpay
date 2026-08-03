// src/middlewares/responseHandler.ts
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
	console.error('Core Engine Exception Caught:', err);

	// 1. Dynamically extract valid language keys configured in the backend i18n matrix file
	const validLanguages = Object.keys(BACKEND_TRANSLATIONS); // Returns array like ['en', 'pt-br']
	const fallbackLang = validLanguages[0] || 'pt-br'; // Safe recovery default anchor fallback

	// 2. Intercept cookie value vector to determine active browser localization preference
	let clientLang = fallbackLang;
	if (req.headers.cookie) {
		const match = req.headers.cookie.match(new RegExp('(^| )sp_lang=([^;]+)'));
		if (match) {
			const extractedLang = match[2].toLowerCase();
			// Dynamically asserts if the browser requested string matches any valid loaded matrix dictionary key
			if (validLanguages.includes(extractedLang)) {
				clientLang = extractedLang;
			}
		}
	}
	
	const localeDictionary = BACKEND_TRANSLATIONS[clientLang] || BACKEND_TRANSLATIONS[fallbackLang];

	// 3. PostgreSQL specific error handling mapped to unified token metrics
	if (err.code === '23505') { // Unique violation database code token
		const token = 'TENANT_CNPJ_ALREADY_EXISTS';
		res.status(409).json({
			result: 'error',
			errorToken: token,
			reason: localeDictionary[token] || 'A unique database conflict record constraint was triggered.'
		});
		return;
	}

	// 4. Extract status codes and compute dynamic operational translation text structures
	const statusCode = err.statusCode || 500;
	const token = err.errorToken || 'INTERNAL_SERVER_ERROR';
	
	// Fallback to structural error message property text layers if token lookup misses inside the matrix
	const reasonMessage = localeDictionary[token] || err.message || 'An unexpected internal ledger or processing error occurred.';

	res.status(statusCode).json({
		result: 'error',
		errorToken: token,
		reason: reasonMessage
	});
}
