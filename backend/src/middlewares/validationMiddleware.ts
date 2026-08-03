// src/middlewares/validationMiddleware.ts
import { Request, Response, NextFunction } from 'express';

export interface SchemaField {
	type: 'string' | 'number' | 'boolean' | 'array'; // INJECTED: Supports bulk operational matrix validations
	required: boolean;
	format?: 'email' | 'uuid' | 'cents';
}

export interface ValidationSchema {
	[key: string]: SchemaField;
}

/**
 * Request Body Validation Middleware Factory.
 * Validates incoming payloads against a strictly defined schema signature.
 * Guarantees the application layer rejects corrupted inputs before database layer interaction.
 */
export function validateBody(schema: ValidationSchema) {
	return (req: Request, res: Response, next: NextFunction): void => {
		try {
			const body = req.body;

			for (const key of Object.keys(schema)) {
				const field = schema[key];
				const value = body[key];

				// 1. Asserts presence if the field is flagged as required
				if (field.required && (value === undefined || value === null)) {
					throw { statusCode: 422, message: `Validation failed. The field '${key}' is highly required.` };
				}

				// Skip further type assertions if an optional field is absent
				if (value === undefined || value === null) {
					continue;
				}

				// 2. Structural data type validation check
				// Enforces specialized routing rule evaluation for JavaScript arrays
				if (field.type === 'array') {
					if (!Array.isArray(value)) {
						throw { statusCode: 422, message: `Validation failed. The field '${key}' expects a structural payload array block.` };
					}
				} else {
					if (typeof value !== field.type) {
						throw { statusCode: 422, message: `Validation failed. The field '${key}' expects a type of '${field.type}'.` };
					}
				}

				// 3. Granular input format rules validation mapping
				if (field.format) {
					if (field.format === 'email') {
						const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
						if (!emailRegex.test(value)) {
							throw { statusCode: 422, message: `Validation failed. The field '${key}' must match a valid corporate email pattern.` };
						}
					}

					if (field.format === 'uuid') {
						const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
						if (!uuidRegex.test(value)) {
							throw { statusCode: 422, message: `Validation failed. The field '${key}' must match a valid RFC 4122 UUID signature.` };
						}
					}

					if (field.format === 'cents') {
						// Ensures monetary value is an integer and non-negative driven by sign checking to prevent code clipping
						const isNegativeCents = Math.sign(value) === -1;
						if (!Number.isInteger(value) || isNegativeCents) {
							throw { statusCode: 422, message: `Validation failed. The field '${key}' must be a valid non-negative integer represented in cents.` };
						}
					}
				}
			}

			next(); // Input payload validation check cleared successfully
		} catch (error) {
			next(error); // Route the exception mapping into the uniform error envelope handler
		}
	};
}
