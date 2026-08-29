# EduSync Setup Guide

Follow these steps to set up and run the application locally.

## 1. Prerequisites
- **Node.js**: Version 18 or higher (Node 18+)
- **PostgreSQL**: Installed and running locally

## 2. Environment Configuration
1. Navigate to the `Backend` directory.
2. Copy `.env.example` to `.env` (or create a new `.env` file if it does not exist).
3. Open `.env` and fill in:
   - `DATABASE_URL`: Set to your local PostgreSQL connection string (e.g., `postgresql://postgres:password@localhost:5432/EduSync`).
   - `JWT_SECRET`: Set to any random secret string.
   - `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` *(optional, added Aug 25, 2026)*: power Web Push notifications for EduSync Connect. Generate a keypair with `npx web-push generate-vapid-keys`, set `VAPID_SUBJECT` to a `mailto:` contact address. **These are optional** — if any of the three is missing, push notifications silently disable themselves (`GET /connect/push/vapid-public-key` returns `503`, sending becomes a no-op) rather than crashing the server. On a deployed environment (e.g. Render), these must be set in that platform's own environment variable dashboard — a local `.env` file is never deployed.

## 3. Installation
Install dependencies in both the Backend and Frontend folders:
```bash
# Install backend dependencies
cd Backend
npm install

# Install frontend dependencies
cd ../Frontend
npm install
```

## 4. Database Initialization
No manual step is required. `Backend/config/dbSetup.js` runs automatically on every backend boot and idempotently creates/migrates every table (`CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`).

> [!WARNING]
> The `npm run db:init` script is **deprecated** — it runs `scripts/initDB.js`, an outdated partial schema kept for reference only. Don't run it; the schema is built on server start (Step 5).

## 5. Running the Application
### Backend
From the `Backend` directory, start the development server:
```bash
npm run dev
```

### Frontend
From the `Frontend` directory, start the development server:
```bash
npm run dev
```

---

> [!NOTE]
> A default admin account is auto-created on first backend startup. Check with the project owner for the default admin login credentials.
