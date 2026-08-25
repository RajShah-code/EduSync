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
Run the schema initialization script once in the `Backend` directory to create all required tables:
```bash
# In the Backend directory
npm run db:init
```

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
