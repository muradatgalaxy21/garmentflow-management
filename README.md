# GarmentFlow Management System

GarmentFlow Management System is a comprehensive ERP and management portal for En En Garments. This platform provides a centralized hub for managing garment manufacturing operations, client relationships, order tracking, and real-time factory floor batch operations.

## Features

### Public Website
- Marketing Site: Landing pages showcasing manufacturing capabilities, company overview, and product catalogs.
- Contact Hub: Request for Quote (RFQ) system for prospective and existing clients.
- Global Language Switching: Full support for English and Urdu (RTL) across public and portal interfaces.

### Factory and Worker Operations
- Worker Portal: Dedicated interface for factory workers and managers to log operations.
- Sequential Stage Enforcement: Stage validation to ensure production batches progress strictly through Cutting, Stitching, Quality Check, Pressing, and Packing.
- QR Code Scanning: Quick QR scanner for batch identification and status updates on the factory floor.
- Multi-Worker Operations: Floor manager tools to log batch entries for multiple workers simultaneously.

### Admin and Staff Management
- Admin Dashboard: Overview of business metrics and active operations.
- RFQ Inbox: Centralized management of client quotes and inquiries.
- Client Management: Client database and account administration.
- Batch Management: Detailed monitoring and control of active production batches.

### Client Portal
- Direct Order Placement: Instant ordering interface for registered clients.
- Order Tracking: Real-time visibility into production status and stage progression.
- Profile Management: Account settings and company details.

## Tech Stack
- Frontend: React, TypeScript, Vite
- Styling: Tailwind CSS, Shadcn UI
- Internationalization: Custom i18n context with English and Urdu support
- Backend and Database: Supabase (PostgreSQL, Row-Level Security, Edge Functions)
- Testing and Automation: Vitest, Playwright

## Environment Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

3. Start the development server:
   ```bash
   npm run dev
   ```

## Development Commands
- `npm run dev`: Starts the local development server.
- `npm run build`: Compiles the project for production.
- `npm run lint`: Runs code linting checks.
- `npm run test`: Executes unit tests via Vitest.
