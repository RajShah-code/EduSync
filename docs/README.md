# 📚 EduSync & EduSync Connect Documentation

Welcome to the documentation repository for **EduSync** and **EduSync Connect**. This directory organizes the specifications, architecture, product requirements, design guidelines, and developer manuals.

---

## 📑 Table of Contents

| Document | Description |
| :--- | :--- |
| [**`PRODUCT.md`**](./PRODUCT.md) | Product vision, positioning, company context (Archway), user roles, feature catalog for both EduSync (live lab software) and EduSync Connect (companion web app). |
| [**`PRD_Smart_Teaching_Lab_Management_Platform.md`**](./PRD_Smart_Teaching_Lab_Management_Platform.md) | Comprehensive Product Requirements Document (v1.4) detailing system workflows, real-time sync, WebRTC mesh signaling, focus guard, and database requirements. |
| [**`DESIGN.md`**](./DESIGN.md) | "The Night Lab" design system: dark-theme design tokens, role-based accent palettes (Teacher, Student, Admin), typography, spacing, and UI components. |
| [**`codeBaseContext.md`**](./codeBaseContext.md) | Deep technical guide: database schema and tables, REST endpoints, Socket.io event maps, controller logic, and frontend component architecture for all services. |
| [**`context.md`**](./context.md) | Chronological development context, historical build milestones, phase-wise implementation progress, and engineering notes. |
| [**`SETUP.md`**](./SETUP.md) | Local environment setup, dependencies, database provisioning, and run instructions for Backend, EduSync Desktop/Web Frontend, and Connect Frontend. |
| [**`CLAUDE.md`**](./CLAUDE.md) | Architecture rules, developer commands, role boundaries, and guidelines for AI agents working in this repository. |

---

## 🏛️ Project Architecture Summary

EduSync consists of two distinct products sharing a unified backend and database:

1. **EduSync (Core Platform)**:
   - **Frontend**: `Frontend/` (Vite + React + Tailwind + Tabler Icons + Monaco Editor + WebRTC + Electron desktop wrapper).
   - **Purpose**: Live in-lab coding sessions, real-time screen/audio broadcasting, anti-cheat monitoring, dynamic tasks, and automated attendance.
2. **EduSync Connect (Companion Platform)**:
   - **Frontend**: `Connect-Frontend/` (Vite + React + Tailwind + Lucide Icons + Socket.io).
   - **Purpose**: Asynchronous classroom collaboration, messaging streams, announcements, assignments with Backblaze B2 attachments, and interactive polls.
3. **Backend Service**:
   - **Path**: `Backend/` (Node.js + Express + PostgreSQL + Socket.io + AWS SDK / B2 storage).
