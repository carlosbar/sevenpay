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

$$\mathit{total\_advanced\_this\_month\_cents}$$

$$\text{total\_advanced\_this\_month\_cents}$$

### 🛡️ Step 5: Individual Margin Validation & Row Locking
* **Action:** The engine issues an isolated write lock on the user's record inside `end_users` utilizing the `FOR UPDATE` statement.
* **Math Execution:** The maximum allowable credit capacity is calculated dynamically using 64-bit integer values (`BIGINT`) to prevent float precision issues. The equations are computed in real-time as follows:

$$\mathit{Max\ Allowable\ Capacity} = \mathit{monthly\_contract\_value\_cents} \times \left( \frac{\mathit{max\_advance\_percentage}}{100} \right)$$

$$\mathit{Real\ Available\ Margin} = \mathit{Max\ Allowable\ Capacity} - \mathit{total\_advanced\_this\_month\_cents}$$

> [!CAUTION]
> If the requested amount exceeds the dynamic Real Available Margin calculated from the live ledger history, the entire transaction triggers an immediate database ROLLBACK.

### 🌐 Step 6: Tenant B2B Global Limit Verification
* **Action:** The engine computes the total volume of all active, outstanding loans managed under the client company's umbrella.
* **Validation:** If the new transaction causes the total corporate pool to breach the registered `global_credit_limit_cents` inside the `tenants` table, the execution is safely terminated to protect SevenPay's capital reserves.

### 🧮 Step 7: Immutable Fee and Payout Calculations
* **Action:** The financial engine runs deterministic calculations over the inputs, mapping strict mathematical rounding to ensure ledger integrity:

$$\mathit{fee\_amount\_cents} = \left\lfloor \mathit{requested\_amount\_cents} \times \left( \frac{\mathit{fee\_percentage}}{100} \right) \right\rceil$$

$$\mathit{net\_payout\_cents} = \mathit{requested\_amount\_cents} - \mathit{fee\_amount\_cents}$$

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

> [!NOTE]
> *SevenPay Engineering Core Guidelines: All monetary rows utilize strict integer cents data types (BIGINT) to isolate the application ledger from math inconsistencies.*
