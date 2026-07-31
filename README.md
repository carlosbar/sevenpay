# 💸 SevenPay - Core Credit Engine Documentation

Welcome to the official technical documentation of the **SevenPay** core financial and risk architecture. SevenPay is a high-performance, robust, and secure **B2B2C Multi-Tenant Structured Credit Platform** (Earned Wage Access / Salary on Demand) built with Node.js, TypeScript, and a highly strict PostgreSQL relational database.

---

## 🏗️ 1. Relational Database Architecture

The data ecosystem is fully optimized in the **Third Normal Form (3FN)** and relies on strict database-level integrity constraints. Below is the relational mapping of the entities involved in the credit stream:

| Entity Name | Database Table | Purpose / Relational Responsibility |
| :--- | :--- | :--- |
| **B2B Tenant** | `tenants` | Represents corporate clients (e.g., HR, Real Estate agencies). Manages business types and global transaction limits. |
| **Pricing Matrix** | `tenant_fee_matrices` | Dynamic pricing table storing convenience fees and maximum allowed margins per installment tier. |
| **End User** | `end_users` | The consumer profile (Employee/Renter). Stores contract base value. Margins are entirely computed in real-time from the transaction history ledger layer. |
| **Payout Destination** | `pix_accounts` | The registry of the user's Pix keys, ordered by numeric dispatch priority. |
| **Advance Request** | `advance_requests` | Core ledger header recording the requested gross value, calculated network fees, net payout, and workflow status. |
| **Amortization Calendar** | `advance_installments` | Granular multi-month competence ledger managing scheduled monthly billing deductions. |
| **Audit Ledger** | `financial_transactions` | Immutable, append-only double-entry audit log tracking all cash flow vectors (`DEBIT` / `CREDIT`). |

---

## ⚙️ 2. Core Credit Engine Business Logic Flow

When an authorized user requests a credit advance, the engine processes the request through **9 sequential verification steps** wrapped inside an isolated, deterministic database transaction (`BEGIN ... COMMIT`) utilizing strict row-level write locking (`FOR UPDATE`).

### 📦 Step 1: Payout Request & Installment Setup
* **Action:** The consumer profile (`end_user_id`) invokes the API endpoint providing a raw gross value in cents (`requested_amount_cents`) and the required amortization split count (`installments_total`).

### 🔍 Step 2: Risk Profile Assessment
* **Action:** The engine queries `tenant_fee_matrices` filtering by the user's `tenant_id` and the chosen `installments_total`.
* **Output:** Extracts the locked transaction fee percentage (`fee_percentage`) and the dynamic safety ceiling constraint (`max_advance_percentage`).

### 📊 Step 3: Delinquency and Overdue Check (Risk Gate)
* **Action:** The engine executes a query on `advance_installments` to count any outstanding entries linked to the `end_user_id` where the status is explicitly set to `'OVERDUE'`.
* **Validation:** If the count is greater than zero ($N > 0$), the entire database process triggers an immediate `ROLLBACK` to isolate the platform from default risk.

### 📊 Step 4: Monthly Cumulative Spending Audit
* **Action:** The engine executes an aggregation query on `advance_requests` to summarize all funds already advanced to the specific user during the current month competence where the status is **NOT** `'REJECTED'`.
* **Output:** Establishes the real dollar volume consumed by the user in the current billing cycle:

```text
total_advanced_this_month_cents
```

### 🛡️ Step 5: Individual Margin Validation & Row Locking
* **Action:** The engine issues an isolated write lock on the user's record inside `end_users` utilizing the `FOR UPDATE` statement.
* **Math Execution:** The maximum allowable credit capacity is calculated dynamically using 64-bit integer values (`BIGINT`) to prevent float precision issues. The equations are computed in real-time as follows:

```text
Max Allowable Capacity = monthly_contract_value_cents * (max_advance_percentage / 100)
Real Available Margin  = Max Allowable Capacity - total_advanced_this_month_cents
```

> [!CAUTION]
> If the requested amount exceeds the dynamic Real Available Margin calculated from the live ledger history, the entire transaction triggers an immediate database ROLLBACK.

> [!CAUTION]
> If the requested amount exceeds the dynamic Real Available Margin calculated from the live ledger history, the entire transaction triggers an immediate database ROLLBACK.

### 🌐 Step 6: Tenant B2B Global Limit Verification
* **Action:** The engine computes the total volume of all active, outstanding loans managed under the client company's umbrella.
* **Validation:** If the new transaction causes the total corporate pool to breach the registered `global_credit_limit_cents` inside the `tenants` table, the execution is safely terminated to protect SevenPay's capital reserves.

### 🧮 Step 7: Immutable Fee and Payout Calculations
* **Action:** The financial engine runs deterministic calculations over the inputs, mapping strict mathematical rounding to ensure ledger integrity:

```text
fee_amount_cents = Math.round(requested_amount_cents * (fee_percentage / 100))
net_payout_cents = requested_amount_cents - fee_amount_cents
```

### 🔑 Step 8: Pix Dispatch Routing Optimization
* **Action:** The core fetches the user's registered keys from `pix_accounts` sorted by `priority ASC`.
* **Logic:** The engine routes the payout command using the root key registered at priority level `0`. If the settlement layer returns a transport error, the system safely falls back to subsequent priority records (`1`, `2`, etc.).

### 💾 Step 9: Ledger Persistence & Asynchronous Execution
If every validation rule evaluates to true, the batch operation commits the state changes:
1. **Logs the header** in `advance_requests` setting the status to `'APPROVED'`. (No static column values are modified on the `end_users` table to maintain dynamic 3FN integrity).
2. **Generates the multi-month schedule** by appending records into `advance_installments`, assigning each slice to its future monthly billing cycle target (`YYYY-MM`).
3. **Appends to the immutability log** in `financial_transactions` with a transaction type of `'DEBIT'`.
4. **Triggers the asynchronous settlement layer** to execute the Instant Pix cash delivery.
5. **Commits the database pool connection** via `COMMIT`.

---

## 📡 3. Standard Response Envelope (API Pattern)

To guarantee clean, standardized API parsing across SevenPay's **3 distinct User Interfaces** (Admin, Tenant, and Mobile Client Application), all endpoints must uniformly reply with a top-level root variable called `result`.

### 🟢 HTTP 201 Success Response Envelope
```json
{
  "result": "success",
  "data": {
    "requestId": "e43b171c-4b53-4877-bbdf-a226bc2ef1e0",
    "netPayoutCents": "144750",
    "dispatchedToPixKey": "12345678900"
  }
}
```

### 🔴 HTTP 4XX/5XX Error Response Envelope
```json
{
  "result": "error",
  "reason": "Access denied. This user account has outstanding overdue installments pending settlement."
}
```

---

## ⚙️ 4. Environment Variables Configuration (`.env`)

Create a `.env` file in the root directory of the infrastructure workspace. The application engine parses these parameters strictly during initialization to establish ledger cryptographic signatures, PostgreSQL pool limits, and network permission vectors.

```env
# ==============================================================================
# 🌐 NETWORK & SECURITY LAYER (CROSS-ORIGIN BOUNDARIES)
# ==============================================================================
# Port where the SevenPay Node.js backend engine listens for incoming requests
PORT=3000

# Strict CORS global override switch for Test Drive Cockpit / MiniUI connectivity
# Set to "true" to append dynamic HTTP headers and bypass browser preflight blocks
CORS_ALLOWED=true

# ==============================================================================
# 🗄️ INFRASTRUCTURE DATABASE ENGINE (POSTGRESQL 18 CORE)
# ==============================================================================
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=sevenpay_db
DB_USER=sevenpay_user
DB_PASSWORD=SuaSenhaSeguraAqui

# Connection pool sizing directives
DB_POOL_MIN=2
DB_POOL_MAX=10

# ==============================================================================
# 🔐 CRYPTOGRAPHIC MATRIX SETTINGS (JWT SECURITY SUBSYSTEM)
# ==============================================================================
# Cryptographic secret used by authMiddleware to sign and verify operator sessions
# CAUTION: Never share this token across production nodes
JWT_SECRET=sevenpay_secure_cryptographic_secret_matrix_key_v1

# Token life span availability window (matches the strict 8h duration gate)
JWT_EXPIRES_IN=8h
```

### 🛠️ Implementing the `CORS_ALLOWED` flag in `server.ts`

To ensure the engine honors the new environment variable configuration inside the node subsystem pipeline, inject this validation layer immediately before parsing routes:

```typescript
// Strict operational evaluation of the network permission vector flag
if (process.env.CORS_ALLOWED === 'true') {
	app.use((req, res, next) => {
		res.header('Access-Control-Allow-Origin', '*');
		res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
		res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
		
		if (req.method === 'OPTIONS') {
			res.sendStatus(200);
			return;
		}
		return next();
	});
}
```
---

---

## 🕹️ 5. Test Drive Cockpit & MiniUI Execution

The platform includes a lightweight, 100% native frontend suite designed to test the entire transactional pipeline of the SevenPay engine end-to-end without external internet or CDN dependencies.

### Running the MiniUI Local Web Server
To execute the interactive cockpit interface on your Ubuntu Desktop setup, use the pre-configured Node.js runtime utility:
```bash
# 1. Navigate to the folder containing the index.html file
cd /home/cbarcellos/workspace/sevenpay/

# 2. Fire up a micro-server bypassing browser Preflight blocks
npx http-server --cors -p 8080
```
Open your browser and navigate to: `http://localhost:8080`

### 👥 6. Seed Test Credentials Matrix

The engine comes pre-populated with three multi-tenant authority layers inside `seed_data.sql`. Use the password **`123456`** across all operator screens to generate authentic JWT tokens.

| Authority Scope | Email Address | Recommended Test Drive Target Tab |
| :--- | :--- | :--- |
| **SYSADMIN** | `admin@sevenpay.com.br` | **🔐 1. Auth Gate** & **👑 2. UI Admin** (To provision corporate landscapes and audit metrics) |
| **TENANT_ADMIN** | `gestor@alfaimoveis.com.br` | **🏢 3. UI Tenant** (To onboard final consumers and check active portfolio limits) |
| **END_USER** | `joao.silva@clientapp.com` | **📱 4. UI Client** (To request cash advances and track dynamic 360 ledger logs) |

### 🧭 7. Strict E2E Verification Workflow
To validate the real-time core architecture engine via the Cockpit panel, execute the steps sequentially:
1. **Authenticate:** Go to tab **1. Auth Gate**, insert the `SYSADMIN` credentials, and hit *Generate Security Token*.
2. **Sync Corporate Entity:** Go to tab **2. UI Admin**, fill in the CNPJ matrix, and click *Execute Tenant Upsert*.
3. **Onboard Consumer Profile:** Go to tab **3. UI Tenant**, synchronize a consumer mapping context using the generated Tenant UUID token.
4. **Process Risk Pipeline:** Go to tab **4. UI Client**, request a dynamic cash advance fractioning split months, and audit the **Consumer 360 Audit Ledger Monitor** to trace real-time balance calculations.

---

## 🐘 8. PostgreSQL 18 Installation & Database Setup Guide

This section describes the step-by-step process to install **PostgreSQL 18** on an Ubuntu Server/Desktop environment, create the dedicated **SevenPay** database user, and initialize the system schema.

### Install PostgreSQL
To ensure you receive official security patches and performance updates directly from the source, add the official PostgreSQL repository instead of relying on the outdated default Ubuntu packages.

Open your terminal (`Ctrl+Alt+T`) and execute the following batch commands:
```bash
# 1. Add the official PostgreSQL signing key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://postgresql.org | sudo gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg

# 2. Add the repository to your system sources list
echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://postgresql.org \$(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list

# 3. Update system package lists and install PostgreSQL
sudo apt update && sudo apt install -y postgresql-18 postgresql-contrib-18
```

Verify database service status:
```bash
sudo systemctl status postgresql
```

---

## 🔑 9. Create SevenPay User and Database

To secure your fintech application, avoid using the default `postgres` superuser inside your Node.js runtime. Create an isolated, dedicated user acting as the owner of the system database.

1. Access the native interactive terminal shell (`psql`) utilizing the default administrative system profile:
   ```bash
   sudo -i -u postgres psql
   ```
2. Copy and paste the following queries into the active `psql` console:
   ```sql
   -- 1. Set how postgres saves the passwords
   SET password_encryption = 'scram-sha-256';

   -- 2. Create a dedicated database operator with database creation privileges
   CREATE USER sevenpay_user WITH PASSWORD 'SuaSenhaSeguraAqui' CREATEDB;

   -- 3. Set user as superuser to allow initial structural seeding migrations
   ALTER USER sevenpay_user SUPERUSER;

   -- 4. Provision the official isolated system database assigning ownership
   CREATE DATABASE sevenpay_db OWNER sevenpay_user;

   -- 5. Grant full schema manipulation privileges to the operator
   GRANT ALL PRIVILEGES ON DATABASE sevenpay_db TO sevenpay_user;

   -- 6. Terminate the active console session
   \q
   ```

---

## 🚀 10. Initialize Database Schema & Feed Data

Once your database is provisioned and the user is set up, you can inject your migration files directly from your project repository folder. Run the following commands to construct your 3FN relational tables and populate mock metrics:

```bash
# 1. Build structural tables dropping pre-existing schemas
psql -h localhost -U sevenpay_user -d sevenpay_db -f init_db.sql

# 2. Feed testing massa data directly on operational tables
psql -h localhost -U sevenpay_user -d sevenpay_db -f seed_data.sql
```

> [!NOTE]
> *The system terminal will prompt for the password you assigned to `sevenpay_user` (`SuaSenhaSeguraAqui`) before executing the batch migrations.*

---

## 🗄️ 11. PostgreSQL 18 Infrastructure Setup (Ubuntu Desktop)

By default, PostgreSQL on Ubuntu blocks TCP/IP connections and restricts authentication to local UNIX sockets. To allow the Node.js backend pool connection to communicate via `localhost`, follow these strict environmental configuration steps.

### 1. Enable TCP/IP Networking (`postgresql.conf`)
Open the main server configuration file in your Ubuntu terminal:
```bash
sudo nano /etc/postgresql/18/main/postgresql.conf
```
Locate the network addressing block and uncomment the `listen_addresses` directive by removing the `#` symbol. Ensure it matches the syntax below:
```text
listen_addresses = 'localhost'
```
*Save and close (`Ctrl + O`, `Enter`, `Ctrl + X`).*

### 2. Configure Authentication Matrix Policies (`pg_hba.conf`)
Open the host-based authentication security policy file:
```bash
sudo nano /etc/postgresql/18/main/pg_hba.conf
```
Scroll to the very bottom of the file where IPv4 and IPv6 rules are declared. Change the authentication method from `peer` or `scram-sha-256` to **`md5`** to ensure universal cryptographic alignment with the `pg` native Node.js driver architecture:
```text
# TYPE  DATABASE        USER            ADDRESS                 METHOD

# IPv4 local connections:
host    all             all             127.0.0.1/32            md5

# IPv6 local connections:
host    all             all             ::1/128                 md5
```
*Save and close (`Ctrl + O`, `Enter`, `Ctrl + X`).*

### 3. Apply Infrastructure Changes
Restart the PostgreSQL system service on your Linux subsystem to bind the new TCP/IP loops and flush connection cache:
```bash
sudo systemctl restart postgresql
```

### 4. Verify Local Loopback Connectivity
Test the network pipe channel by forcing a remote connection vector to populate our testing data layer:
```bash
psql -h localhost -U sevenpay_user -d sevenpay_db -f seed_data.sql
```

---

> [!NOTE]
> *SevenPay Engineering Core Guidelines: All monetary rows utilize strict integer cents data types (BIGINT) to isolate the application ledger from math inconsistencies.*

