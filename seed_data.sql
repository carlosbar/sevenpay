-- to run: psql -h localhost -U sevenpay_user -d sevenpay_db -f seed_data.sql

-- ============================================================================
-- 1. DATABASE CLEANUP (TOTAL PURGE BEFORE SEEDING)
-- ============================================================================
TRUNCATE TABLE financial_transactions, advance_installments, advance_requests, 
               operator_profiles, system_operators, pix_accounts, 
               end_users, tenant_fee_matrices, tenants CASCADE;

-- ============================================================================
-- 2. B2B TENANTS PROVISIONING (CLIENT COMPANIES)
-- ============================================================================
-- Tenant 1: Real Estate Agency (Imobiliaria Alfa LTDA)
INSERT INTO tenants (id, cnpj, name, business_type, global_credit_limit_cents)
VALUES ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', '12345678000199', 'Imobiliaria Alfa LTDA', 'REAL_ESTATE', 50000000); -- R$ 500.000,00 limit

-- Tenant 2: Corporate HR (TechSource Solutions)
INSERT INTO tenants (id, cnpj, name, business_type, global_credit_limit_cents)
VALUES ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', '98765432000188', 'TechSource Solutions S.A.', 'HR', 120000000); -- R$ 1.200.000,00 limit

-- ============================================================================
-- 3. PRICING FEE MATRICES CONFIGURATION (DYNAMIC RATES & LIMITS)
-- ============================================================================
-- Rules for Tenant 1 (Imobiliaria Alfa)
INSERT INTO tenant_fee_matrices (tenant_id, installments_count, fee_percentage, max_advance_percentage)
VALUES ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 1, 3.50, 30.00); -- 1x: 3.5% fee, 30% max margin

INSERT INTO tenant_fee_matrices (tenant_id, installments_count, fee_percentage, max_advance_percentage)
VALUES ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 2, 5.00, 32.00); -- 2x: 5.0% fee, 32% max margin

-- Rules for Tenant 2 (TechSource Solutions)
INSERT INTO tenant_fee_matrices (tenant_id, installments_count, fee_percentage, max_advance_percentage)
VALUES ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 1, 2.80, 35.00); -- 1x: 2.8% fee, 35% max margin

INSERT INTO tenant_fee_matrices (tenant_id, installments_count, fee_percentage, max_advance_percentage)
VALUES ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 3, 5.50, 40.00); -- 3x: 5.5% fee, 40% max margin

-- ============================================================================
-- 4. END USERS PROVISIONING (CREDIT CONSUMERS)
-- ============================================================================
-- End User 1: Joao Silva (Renter under Imobiliaria Alfa - Rent: R$ 2.500,00)
INSERT INTO end_users (id, tenant_id, external_id, name, monthly_contract_value_cents, margin_available_cents, status)
VALUES ('f1e2d3c4-b5a6-7f8e-9d0c-1b2a3f4e5d6c', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'INQ-9981', 'Joao Silva', 250000, 250000, 'ACTIVE');

-- End User 2: Maria Oliveira (Employee at TechSource - Salary: R$ 6.000,00)
INSERT INTO end_users (id, tenant_id, external_id, name, monthly_contract_value_cents, margin_available_cents, status)
VALUES ('9f8e7d6c-5b4a-3f2e-1d0c-9b8a7f6e5d4c', 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 'EMP-4412', 'Maria Oliveira', 600000, 600000, 'ACTIVE');

-- ============================================================================
-- 5. PIX ROUTING ACCOUNTS (ORDERED BY PRIORITY LAYER)
-- ============================================================================
-- Joao Silva's keys (Priority 0 is Root, Priority 1 is Secondary backup)
INSERT INTO pix_accounts (end_user_id, key_type, key_value, priority)
VALUES ('f1e2d3c4-b5a6-7f8e-9d0c-1b2a3f4e5d6c', 'CPF', '12345678900', 0); -- Root Priority

INSERT INTO pix_accounts (end_user_id, key_type, key_value, priority)
VALUES ('f1e2d3c4-b5a6-7f8e-9d0c-1b2a3f4e5d6c', 'EMAIL', 'joao.silva@email.com', 1; -- Secondary Backup

-- Maria Oliveira's keys
INSERT INTO pix_accounts (end_user_id, key_type, key_value, priority)
VALUES ('9f8e7d6c-5b4a-3f2e-1d0c-9b8a7f6e5d4c', 'PHONE', '+5511999998888', 0); -- Root Priority

-- ============================================================================
-- 6. SYSTEM OPERATORS AUTHENTICATION SEEDING (BASE ACCOUNTS)
-- ============================================================================
-- Account 1: Root System Administrator (SYSADMIN - Full operational control)
INSERT INTO system_operators (id, email, password_hash, password_salt, role_name, status)
VALUES (
    'c1a2b3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    'admin@sevenpay.com.br',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', -- Fake SHA256 (<password>:salt)
    'f8c3d2a1e0b9c8d7',
    'SYSADMIN',
    'ACTIVE'
);

-- Account 2: B2B Enterprise Client Administrator (TENANT_ADMIN for Imobiliaria Alfa)
INSERT INTO system_operators (id, email, password_hash, password_salt, role_name, status)
VALUES (
    'd2b3c4d5-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    'gestor@alfaimoveis.com.br',
    '88d011c7501a3df3ec7516f4aa9723f54e601e3895b66d48bc30ae37c229712a',
    'a9b8c7d6e5f4a3b2',
    'TENANT_ADMIN',
    'ACTIVE'
);

-- Account 3: Mobile Client Application Account (END_USER for Joao Silva)
INSERT INTO system_operators (id, email, password_hash, password_salt, role_name, status)
--> For security, mobile logins map directly to an authentication record
VALUES (
    'e3c4d5e6-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
    'joao.silva@clientapp.com',
    '4c643b1239ab7d283ec7516f4aa9723f54e601e3895b66d48bc30ae37c229712a',
    '1a2b3c4d5e6f7a8b',
    'END_USER',
    'ACTIVE'
);

-- ============================================================================
-- 7. OPERATOR PROFILES (THE BRIDGE LAYER LINKING DOMAIN SCOPES AS 3FN REQUIRED)
-- ============================================================================
-- Rules: SYSADMIN has NULL for profiles since its scope is global.
-- Tenant and End Users MUST be declared here to pass route security middlewares.

-- Mapping 'gestor@alfaimoveis.com.br' to Imobiliaria Alfa (Tenant scope)
INSERT INTO operator_profiles (operator_id, tenant_id, end_user_id)
VALUES (
    'd2b3c4d5-e5f6-7a8b-9c0d-1e2f3a4b5c6d', -- operator_id (TENANT_ADMIN)
    'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', -- tenant_id (Imobiliaria Alfa)
    NULL
);

-- Mapping 'joao.silva@clientapp.com' to his consumer record data (End User scope)
INSERT INTO operator_profiles (operator_id, tenant_id, end_user_id)
VALUES (
    'e3c4d5e6-f6a7-8b9c-0d1e-2f3a4b5c6d7e', -- operator_id (END_USER)
    NULL,
    'f1e2d3c4-b5a6-7f8e-9d0c-1b2a3f4e5d6c'  -- end_user_id (Joao Silva)
);

