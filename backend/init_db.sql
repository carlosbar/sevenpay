-- ============================================================================
-- 1. DATABASE CLEANUP (TOTAL RESET)
-- ============================================================================
DROP TABLE IF EXISTS tenant_settlement_batches CASCADE;
DROP TABLE IF EXISTS financial_transactions CASCADE;
DROP TABLE IF EXISTS advance_installments CASCADE;
DROP TABLE IF EXISTS advance_requests CASCADE;
DROP TABLE IF EXISTS operator_profiles CASCADE;
DROP TABLE IF EXISTS system_operators CASCADE;
DROP TABLE IF EXISTS pix_accounts CASCADE;
DROP TABLE IF EXISTS end_users CASCADE;
DROP TABLE IF EXISTS tenant_fee_matrices CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
DROP TABLE IF EXISTS business_types CASCADE;
DROP TABLE IF EXISTS system_roles CASCADE;

DROP TYPE IF EXISTS global_status CASCADE;
DROP TYPE IF EXISTS role_scope CASCADE;
DROP TYPE IF EXISTS transaction_type CASCADE;
DROP TYPE IF EXISTS request_status CASCADE;
DROP TYPE IF EXISTS pix_key_type CASCADE;

-- Enables the extension required for auto-generating UUIDs in PostgreSQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- 2. CUSTOM DATA TYPES (ENUMS)
-- ============================================================================
CREATE TYPE global_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE role_scope AS ENUM ('MASTER', 'TENANT', 'END_USER');
CREATE TYPE transaction_type AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE request_status AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REJECTED', 'OVERDUE');
CREATE TYPE pix_key_type AS ENUM ('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP');

-- ============================================================================
-- 3. TABLES CREATION (STRICT FOREIGN KEY DEPENDENCY ORDER)
-- ============================================================================

-- RBAC Roles and Permissions Lookup Table (Matrix Permission Pattern with Scope ENUM)
CREATE TABLE system_roles (
	name VARCHAR(30) PRIMARY KEY,
	scope role_scope NOT NULL,
	can_read BOOLEAN NOT NULL DEFAULT FALSE,
	can_create BOOLEAN NOT NULL DEFAULT FALSE,
	can_update BOOLEAN NOT NULL DEFAULT FALSE,
	can_delete BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Business Type Lookup (Tenant Industry/Vertical Classification Matrix)
CREATE TABLE business_types (
	code VARCHAR(30) PRIMARY KEY,
	name VARCHAR(100) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- B2B Client Companies (e.g., HR departments, Real Estate agencies)
CREATE TABLE tenants (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	cnpj VARCHAR(14) UNIQUE NOT NULL,
	name VARCHAR(100) NOT NULL,
	business_type VARCHAR(30) NOT NULL REFERENCES business_types(code) ON DELETE RESTRICT,
	global_credit_limit_cents BIGINT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pricing Fee Matrix and Dynamic Limits per Installment Tier
CREATE TABLE tenant_fee_matrices (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
	installments_count INT NOT NULL,
	fee_percentage NUMERIC(5, 2) NOT NULL,
	max_advance_percentage NUMERIC(5, 2) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	CONSTRAINT unique_tenant_installment UNIQUE(tenant_id, installments_count)
);

-- End Users Consuming Credit (e.g., Employees, Tenants)
CREATE TABLE end_users (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
	external_id VARCHAR(50) NOT NULL,
	name VARCHAR(100) NOT NULL,
	monthly_contract_value_cents BIGINT NOT NULL,
	status global_status NOT NULL DEFAULT 'ACTIVE',
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	CONSTRAINT unique_tenant_end_user UNIQUE(tenant_id, external_id)
);

-- Pix Receiving Accounts linked to End Users
CREATE TABLE pix_accounts (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	end_user_id UUID NOT NULL REFERENCES end_users(id) ON DELETE CASCADE,
	key_type pix_key_type NOT NULL,
	key_value VARCHAR(77) NOT NULL,
	priority INT NOT NULL DEFAULT 0, -- Lower integer value indicates higher payout dispatch order execution (0 is root priority)
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System Operators (Base Authentication Table - Isolated from Domain Scopes)
CREATE TABLE system_operators (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	email VARCHAR(100) UNIQUE NOT NULL,
	password_hash VARCHAR(255) NOT NULL,
	password_salt VARCHAR(64) NOT NULL,
	role_name VARCHAR(30) REFERENCES system_roles(name) ON DELETE RESTRICT,
	status global_status NOT NULL DEFAULT 'ACTIVE',
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Operator Profiles (The elegant bridge table handling Tenant and End-User multi-tenant isolation)
CREATE TABLE operator_profiles (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	operator_id UUID NOT NULL REFERENCES system_operators(id) ON DELETE CASCADE,
	tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
	end_user_id UUID REFERENCES end_users(id) ON DELETE CASCADE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	CONSTRAINT unique_operator_profile UNIQUE(operator_id)
);

-- Core Financial Ledger Table for Advance Requests (Payouts)
CREATE TABLE advance_requests (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	end_user_id UUID REFERENCES end_users(id) ON DELETE RESTRICT,
	requested_amount_cents BIGINT NOT NULL,
	installments_total INT NOT NULL DEFAULT 1,
	fee_percentage NUMERIC(5, 2) NOT NULL,
	fee_amount_cents BIGINT NOT NULL,
	net_payout_cents BIGINT NOT NULL,
	status request_status NOT NULL DEFAULT 'PENDING',
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Amortization Installments for Multi-Month Competence Scheduling
CREATE TABLE advance_installments (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	advance_request_id UUID REFERENCES advance_requests(id) ON DELETE CASCADE,
	end_user_id UUID REFERENCES end_users(id) ON DELETE RESTRICT,
	installment_number INT NOT NULL,
	gross_amount_cents BIGINT NOT NULL,
	billing_competence VARCHAR(7) NOT NULL, -- Target competence in 'YYYY-MM' format
	status request_status NOT NULL DEFAULT 'PENDING',
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Immutable Audit Log Ledger tracking Double-Entry Transactions
CREATE TABLE financial_transactions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	advance_request_id UUID REFERENCES advance_requests(id) ON DELETE SET NULL,
	end_user_id UUID REFERENCES end_users(id) ON DELETE RESTRICT,
	type transaction_type NOT NULL,
	amount_cents BIGINT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- B2B Settlement Batches tracking consolidated corporate bulk repayments
CREATE TABLE tenant_settlement_batches (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
	billing_competence VARCHAR(7) NOT NULL, -- Target competence month liquidated (e.g., '2026-08')
	total_settled_cents BIGINT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 4. DATA SEEDING FOR ROLES (PRE-POPULATING LOOKUP MATRIX)
-- ============================================================================
INSERT INTO system_roles (name, scope, can_read, can_create, can_update, can_delete) VALUES
('SYSADMIN',         'MASTER',   TRUE,  TRUE,  TRUE,  TRUE),
('MASTER_ADMIN',     'MASTER',   TRUE,  TRUE,  TRUE,  FALSE),
('MASTER_OPERATOR',  'MASTER',   TRUE,  FALSE, TRUE,  FALSE),
('TENANT_ADMIN',     'TENANT',   TRUE,  TRUE,  TRUE,  FALSE),
('TENANT_OPERATOR',  'TENANT',   TRUE,  FALSE, TRUE,  FALSE),
('END_USER',         'END_USER', TRUE,  TRUE,  FALSE, FALSE);

-- ============================================================================
-- 5. PERFORMANCE INDEXES (QUERY OPTIMIZATION)
-- ============================================================================
CREATE INDEX idx_end_users_tenant ON end_users(tenant_id);
CREATE INDEX idx_operators_email ON system_operators(email);
CREATE INDEX idx_operator_profiles_bridge ON operator_profiles(operator_id, tenant_id, end_user_id);
CREATE INDEX idx_pix_accounts_order ON pix_accounts(end_user_id, priority ASC);
CREATE INDEX idx_installments_competence ON advance_installments(billing_competence, status);
CREATE INDEX idx_transactions_user ON financial_transactions(end_user_id);
CREATE INDEX idx_settlements_tenant_competence ON tenant_settlement_batches(tenant_id, billing_competence);
