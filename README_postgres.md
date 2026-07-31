# 🐘 PostgreSQL 16 Installation & Database Setup Guide

This guide describes the step-by-step process to install **PostgreSQL 16** on an Ubuntu Server/Desktop environment, create the dedicated **SevenPay** database user, and initialize the system schema.

---

## 🛠️ 1. Install PostgreSQL 16

To ensure you receive official security patches and performance updates directly from the source, add the official PostgreSQL repository instead of relying on the outdated default Ubuntu packages.

Open your terminal (`Ctrl+Alt+T`) and execute the following batch commands:

```bash
# 1. Add the official PostgreSQL signing key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg

# 2. Add the repository to your system sources list
echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://postgresql.org \$(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list

# 3. Update system package lists and install PostgreSQL 16
sudo apt update && sudo apt install -y postgresql-16 postgresql-contrib-16
```

### Verify Service Status
Ensure the database service is up and running in the background:
```bash
sudo systemctl status postgresql
```

---

## 🔑 2. Create SevenPay User and Database

To secure your fintech application, avoid using the default `postgres` superuser inside your Node.js runtime. Create a isolated, dedicated user acting as the owner of the system database.

### Step 1: Open the PostgreSQL Console
Access the native interactive terminal shell (`psql`) utilizing the default administrative system profile:
```bash
sudo -i -u postgres psql
```

### Step 2: Execute SQL Provisioning Commands
Copy and paste the following queries into the active `psql` console (**Remember to change `'YourSecurePasswordHere'` to your local development password**):

```sql
-- 1. Set how postgres save the passwords
SET password_encryption = 'scram-sha-256';

-- 2. Create a dedicated database operator with database creation privileges
CREATE USER sevenpay_user WITH PASSWORD 'YourSecurePasswordHere' CREATEDB;

-- 3. Set user as superuser
ALTER USER sevenpay_user SUPERUSER;

-- 4. Provision the official isolated system database assigning ownership
CREATE DATABASE sevenpay_db OWNER sevenpay_user;

-- 5. Grant full schema manipulation privileges to the operator
GRANT ALL PRIVILEGES ON DATABASE sevenpay_db TO sevenpay_user;

-- 6. Terminate the active console session
\q
```

---

## 🚀 3. Initialize Database Schema

Once your database is provisioned and the user is set up, you can inject your migration files (`init_db.sql`) directly from your project repository folder.

Run the following command to drop pre-existing configurations and cleanly construct your 3FN relational tables:

```bash
psql -h localhost -U sevenpay_user -d sevenpay_db -f init_db.sql
```

---

## 🚀 4. Feed initial data

Once your database is initialized, you can insert some test data on tables.

Run the following command to create mokup data:

```bash
psql -h localhost -U sevenpay_user -d sevenpay_db -f seed_data.sql
```

## 🗄️ 5. PostgreSQL 18 Infrastructure Setup (Ubuntu Desktop)

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
Test the network pipe channel by forcing a remote connection vector to populate our testing massa data layer:
```bash
psql -h localhost -U sevenpay_user -d sevenpay_db -f seed_data.sql
```
*When prompted for credentials, authenticate using your operational password.*

> [!NOTE]
> *The system terminal will prompt for the password you assigned to `sevenpay_user` in the provisioning phase before executing the batch migration.*
