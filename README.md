# 💸 SevenPay - Core Credit Engine Documentation

Welcome to the official technical documentation of the **SevenPay** core financial and risk architecture. SevenPay is a high-performance, robust, and secure **B2B2C Multi-Tenant Structured Credit Platform** (Earned Wage Access / Salary on Demand) built with Node.js, TypeScript, and a highly strict PostgreSQL relational database.

---

## 🏗️ 1. Relational Database Architecture

The data ecosystem is fully optimized in the **Third Normal Form (3FN)** and relies on strict database-level integrity constraints. Below is the relational mapping of the entities involved in the credit stream:

| Entity Name | Database Table | Purpose / Relational Responsibility |
| :--- | :--- | :--- |
| **B2B Tenant** | `tenants` | Represents corporate clients (e.g., HR, Real Estate agencies). Manages business types and global transaction limits. |
| **Pricing Matrix** | `tenant_fee_matrices` | Dynamic pricing table storing convenience fees and maximum allowed margins per installment tier. |
| **End User** | `end_users` | The consumer profile (Employee/Renter). Stores contract base value and current raw available margin. |
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
* **Validation:** If the count is greater than zero (N > 0), the entire database process triggers an immediate `ROLLBACK` to isolate the platform from default risk.

### 📊 Step 4: Monthly Cumulative Spending Audit
* **Action:** The engine executes an aggregation query on `advance_requests` to summarize all funds already advanced to the specific user during the current month competence where the status is **NOT** `'REJECTED'`.
* **Output:** Establishes the real dollar volume consumed by the user in the current billing cycle: `total_advanced_this_month_cents`.

### 🛡️ Step 5: Individual Margin Validation & Row Locking
* **Action:** The engine issues an isolated write lock on the user's record inside `end_users` utilizing the `FOR UPDATE` statement.
* **Math Execution:** The maximum allowable credit capacity is calculated using 64-bit integer values (`BIGINT`) to prevent float precision issues:

```text
Max Allowable Capacity = monthly_contract_value_cents * (max_advance_percentage / 100)
Real Available Margin  = Max Allowable Capacity - total_advanced_this_month_cents
```

> [!CAUTION]
> If the requested amount exceeds either the Real Available Margin or the user static available margin, the entire transaction triggers an immediate database ROLLBACK.

### 🌐 Step 6: Tenant B2B Global Limit Verification
* **Action:** The engine computes the total volume of all active, outstanding loans managed under the client company's umbrella.
* **Validation:** If the new transaction causes the total corporate pool to breach the registered `global_credit_limit_cents` inside the `tenants` table, the execution is safely terminated to protect SevenPay's capital reserves.

### 🧮 Step 7: Immutable Fee and Payout Calculations
* **Action:** The financial engine runs deterministic calculations over the inputs:
```text
fee_amount_cents = Math.round(requested_amount_cents * (fee_percentage / 100))
net_payout_cents = requested_amount_cents - fee_amount_cents
```

### 🔑 Step 8: Pix Dispatch Routing Optimization
* **Action:** The core fetches the user's registered keys from `pix_accounts` sorted by `priority ASC`.
* **Logic:** The engine routes the payout command using the root key registered at priority level `0`. If the settlement layer returns a transport error, the system safely falls back to subsequent priority records (`1`, `2`, etc.).

### 💾 Step 9: Ledger Persistence & Asynchronous Execution
If every validation rule evaluates to true, the batch operation commits the state changes:
1. **Deducts the margin** by updating the user's `margin_available_cents` column.
2. **Logs the header** in `advance_requests` setting the status to `'PENDING'`.
3. **Generates the multi-month schedule** by appending records into `advance_installments`, assigning each slice to its future monthly billing cycle target (`YYYY-MM`).
4. **Appends to the immutability log** in `financial_transactions` with a transaction type of `'DEBIT'`.
5. **Triggers the asynchronous settlement layer** to execute the Instant Pix cash delivery.
6. **Commits the database pool connection** via `COMMIT`.

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
> [!NOTE]
> *SevenPay Engineering Core Guidelines: All monetary rows utilize strict integer cents data types (BIGINT) to isolate the application ledger from math inconsistencies.*
