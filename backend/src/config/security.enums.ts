// backend/src/config/security.enums.ts

/**
 * Defines strict account multi-tenant authority layers extracted from JWT payload contexts.
 * Maps horizontal boundaries to block unauthorized profile scope expansion.
 */
export enum ScopeTarget {
	/** Root administrative role with global cross-tenant visibility and provisioning rights */
	MASTER = 'MASTER',
	/** Corporate HR or property manager role restricted strictly to their workspace rows */
	TENANT = 'TENANT',
	/** Mobile retail consumer allowed exclusively to interact with their own financial metrics */
	END_USER = 'END_USER'
}

/**
 * Maps granular operational actions driven by strict RESTful intent.
 * Bound to HTTP verbs to guarantee auditability and access control compliance.
 */
export enum ActionTarget {
	/** Bound to POST requests to initialize fresh relational table records */
	CREATE = 'CREATE',
	/** Bound to GET requests to pull ledger streams or individual metrics */
	READ = 'READ',
	/** Bound to PUT/PATCH requests to mutate existing configurations or data properties */
	UPDATE = 'UPDATE',
	/** Bound to DELETE requests to perform infrastructure removals or drop temporary rows */
	DELETE = 'DELETE',
}

/**
 * Defines the strict tuple layout pattern driven by Enums: [Scope, Action]
 * Injected dynamically by controller route configurations to evaluate incoming traffic.
 */
export type PermissionGuardTuple = [ScopeTarget, ActionTarget];
