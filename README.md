# EduSync: Smart Classroom Sync & Live Coding Lab

> [!IMPORTANT]
> **Active Development Phase**: This project is currently in the active building and development phase. Features and documentation are undergoing continuous updates, and some components are not yet fully completed or production-ready.

EduSync is a real-time collaborative learning platform designed to streamline hybrid coding classrooms. It enables instructors to run interactive live sessions, broadcast screen/audio feeds, assign real-time tasks, and track student engagement directly through the web browser.

---

## 🌟 Key Features

### 1. Live Session Broadcasting
* **Real-time Signaling**: Built on WebRTC (one-way mesh topology) for low-latency video and audio transmission.
* **Keystroke Sync**: Synchronized code editors (powered by Monaco Editor) matching the teacher's workspace.
* **Output Broadcast**: Run code on the teacher's interface and mirror execution outputs to all connected students.

### 2. Anti-Cheat & Focus Guard
* **Visibility Tracking**: Detects when students exit fullscreen mode or switch active tabs.
* **Live Dashboard**: Teachers receive real-time notifications and statistics showing which students are actively focused or away.
* **Rejoin Gatekeeper**: Gated reconnect approval prevents students from leaving and re-entering the stream repeatedly without teacher consent.

### 3. Real-Time Tasks & Auto-Submissions
* **Structured Coding Tasks**: Teachers can push coding exercises with time limits and language constraints dynamically during a lecture.
* **Roster Sync**: Student task statuses (not started, in progress, submitted) are updated in real-time.
* **Auto-Submit Guard**: Submits any incomplete/saved work automatically to the database when the task timer expires.
* **Teacher Evaluation**: Dashboard for reviewing student code submissions and issuing grades.

### 4. Interactive Doubt Solver
* **Code-Attached Doubts**: Students can attach code snapshots to doubt requests.
* **Targeted Feedback**: Teachers can reply with detailed guidance and specify line-range hints that highlight the exact mistake in the student's editor.

### 5. Administration Control
* **Institution Management**: Admin console to manage classrooms, students, teachers, and logs.
* **Transient Password Logic**: Automatically generates roll-based passwords for users, exposing credentials only at creation time without saving plaintext passwords to the database.

---

## 🛠️ Tech Stack

### Backend
* **Runtime**: Node.js
* **Framework**: Express.js
* **Real-time Communication**: Socket.io (WebSockets)
* **Database**: PostgreSQL (via the fast `postgres` driver client)
* **Authentication**: JWT & Bcryptjs

### Frontend
* **Framework**: React.js (built on Vite)
* **Styles**: Modern TailwindCSS & Material UI (MUI) icons
* **Code Editor**: Monaco Editor (React wrapper)
* **Signaling**: WebRTC API
* **State Management**: React Router

---

## 🚀 Walkthrough & Setup Guide

Get the project running locally in a few steps.

### Step 1: Prerequisites
Ensure you have the following installed on your machine:
* **Node.js**: Version 18 or higher
* **PostgreSQL**: Local server running

### Step 2: Database Configuration
1. Open your PostgreSQL terminal/GUI (like pgAdmin or `psql`).
2. Create a new database named `EduSync`:
   ```sql
   CREATE DATABASE "EduSync";
   ```

### Step 3: Environment Setup
1. Navigate to the `Backend` directory:
   ```bash
   cd Backend
   ```
2. Copy the `.env.example` file to `.env` (or create a new `.env` file):
   ```bash
   cp .env.example .env
   ```
3. Open the `.env` file and set your credentials:
   ```env
   PORT=3000
   DATABASE_URL=postgresql://<YOUR_POSTGRES_USER>:<YOUR_POSTGRES_PASSWORD>@localhost:5432/EduSync
   JWT_SECRET=any_random_string_here
   JWT_EXPIRES_IN=7d
   ```

### Step 4: Install Dependencies
Install packages in both Backend and Frontend folders:
```bash
# Install backend dependencies
cd Backend
npm install

# Install frontend dependencies
cd ../Frontend
npm install
```

### Step 5: Initialize Database Schema
Run the initialization script once in the `Backend` directory to automatically construct the database tables in correct dependency order:
```bash
# In the Backend directory
npm run db:init
```
*(This creates `classes`, `users`, `sessions`, `session_classes`, `attendance`, `tasks`, `submissions`, and `doubt_requests` tables).*

### Step 6: Start Servers
Start the dev servers for both components:

**Backend**:
```bash
# From Backend directory
npm run dev
```

**Frontend**:
```bash
# From Frontend directory
npm run dev
```

---

## 🔑 Default Admin Access
Upon first backend server boot, a default admin account is automatically seeded into the database. 
* **Username/Email**: `admin`
* **Password**: `admin123`

*Note: For security reasons, please change this password in production or check with the project owner.*
