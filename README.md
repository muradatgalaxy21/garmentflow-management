# GarmentFlow Management System

A comprehensive ERP and management portal for **En En Garments**. This platform provides a centralized hub for managing garment manufacturing operations, client relationships, and order tracking.

## Core Features

### 🏢 Public Presence
- **Marketing Site**: Professional landing pages showcasing about us, manufacturing capabilities, and garment catalogs.
- **Contact Hub**: RFQ (Request for Quote) system for new and existing clients.

### 🔑 Authentication & Access Control
- **Secure Portal**: Role-based access for Admins, Staff, and Clients.
- **Protected Routes**: Ensuring data privacy across different access levels.

### 🛡️ Admin Portal (Staff/Admin)
- **Admin Dashboard**: Overview of key business metrics.
- **RFQ Inbox**: Manage incoming quotes and inquiries.
- **Inventory Management**: Track raw materials and finished goods.
- **Orders Admin**: Centralized order processing and status management.
- **Client Management**: Database of clients with dedicated profiles.

### 👤 Client Portal (Authenticated Clients)
- **Personal Dashboard**: Overview of recent activity and orders.
- **Order Tracking**: Detailed real-time updates on manufacturing progress.
- **Profile Management**: Maintain business contact information.

## Tech Stack
- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS + Shadcn UI
- **Backend/DB**: Supabase (PostgreSQL + Auth + Storage)
- **Tools**: Vitest (Testing), Playwright (E2E), Graphify (Architecture Visualization)

## Setup and Installation

### Frontend (Node.js)
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment:
   - Copy `.env.example` to `.env`.
   - Update `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with your credentials.
3. Start development server:
   ```bash
   npm run dev
   ```

### Tooling (Python)
The project includes Python-based tools for architecture visualization (`graphify`).
1. Create a virtual environment:
   ```bash
   python -m venv garmentflow-management-venv
   ```
2. Activate and install requirements:
   ```bash
   .\garmentflow-management-venv\Scripts\activate
   pip install -r requirements.txt
   ```

## Development Commands
- `npm run dev`: Start development server.
- `npm run build`: Build for production.
- `npm run lint`: Run ESLint.
- `npm run test`: Run unit tests.

---
*Created by En En Garments Team*
