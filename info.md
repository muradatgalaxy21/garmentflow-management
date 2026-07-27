# En En Garments - System Documentation & Architecture Guide

Welcome to the comprehensive A-Z guide for the **GarmentFlow Management System**. This document explains how the entire project is structured, the technology stack it uses, the database schema, and the exact flow of data from the public site to the administrative backend.

---

## 1. High-Level Overview

This system is a centralized ERP (Enterprise Resource Planning) and customer portal built for En En Garments. It serves three main purposes:
1. **Public Marketing Site**: To showcase capabilities, catalog items, and capture leads via RFQs (Request For Quotes).
2. **Client Portal**: A secure area for clients to track their ongoing orders and update their profiles.
3. **Admin/Staff Portal**: A backend management system to process RFQs, manage clients, track orders, and monitor inventory.

---

## 2. Technology Stack

The project is built using modern web development standards:
- **Frontend Framework**: React 18 with TypeScript, powered by Vite for rapid development and building.
- **Routing**: `react-router-dom` for handling all navigation (Public, Auth, Admin, Portal).
- **Styling**: Tailwind CSS for utility-first styling, combined with Shadcn UI for accessible, pre-built components (using Radix UI under the hood).
- **State Management & Data Fetching**: `@tanstack/react-query` is used to fetch, cache, and synchronize data with the backend efficiently.
- **Forms & Validation**: `react-hook-form` paired with `zod` for robust, type-safe form validation.
- **Backend as a Service (BaaS)**: Supabase is used for the database (PostgreSQL), Authentication, and Row Level Security (RLS).
- **Icons & Animations**: `lucide-react` for iconography and `framer-motion` for smooth UI transitions.

---

## 3. Database Schema

The backend uses a PostgreSQL database hosted on Supabase. Below are the core tables that power the application:

### Users & Roles
- **`profiles`**: Stores public information about users (both clients and staff). It links directly to the Supabase Auth system via the `id` field. Fields include `full_name`, `company`, and `phone`.
- **`user_roles`**: Manages Role-Based Access Control (RBAC). It assigns an `app_role` (`admin`, `staff`, or `client`) to a specific `user_id`.

### CRM & Sales
- **`rfqs` (Request For Quotes)**: Captures inquiries from the public contact form. It tracks the status of a lead (`new`, `contacted`, `quoted`, `won`, `lost`) and optionally assigns it to a staff member (`assigned_to`).

### Orders & Production
- **`orders`**: The core table for tracking manufacturing jobs. Linked to a `client_id`. It tracks `status` (e.g., `pending`, `in_production`, `qc`, `shipped`, `delivered`), `quantity`, `total_amount`, and `expected_delivery`.
- **`order_updates`**: Acts as an audit log. Whenever an order changes status or a note is added, an entry is created here. It links to `order_id`.

### Inventory Management
- **`inventory_items`**: Tracks physical goods (raw materials or finished products). It includes `sku`, `name`, `quantity_on_hand`, `reorder_level`, and `unit_cost`.
- **`inventory_movements`**: An audit log for inventory changes. When stock is added or removed, a movement record (`in`, `out`, `adjust`) is created with the `quantity` and `reason`, linking to the `item_id`.

---

## 4. System Flows (A-Z)

How does a user interact with the system, and how does data flow? Here are the primary user journeys:

### Flow A: The Public Visitor (Lead Generation)
1. **Visit**: A prospective client lands on the site (`/`). They browse `/about`, `/capabilities`, and the `/catalog`.
2. **Inquiry**: They visit `/contact` and fill out the Request for Quote (RFQ) form.
3. **Data Action**: The frontend uses a Supabase client to insert a new row into the `rfqs` table with a status of `new`.

### Flow B: The Client Experience
1. **Authentication**: A client logs in at `/auth` using their email and password.
2. **Routing**: Upon successful login, the system checks their role in `user_roles`. Finding the role `client`, they are redirected to the Client Portal (`/portal`).
3. **Dashboard (`/portal`)**: They see a summary of their active orders.
4. **Order Tracking (`/portal/orders/:id`)**: They can click into an order to see its current status (e.g., "In Production") and view the timeline of `order_updates`.
5. **Profile Management**: Clients can update their company name and phone number via `/portal/profile` (updates the `profiles` table).

### Flow C: The Admin/Staff Experience
1. **Authentication**: A staff member logs in at `/auth`.
2. **Routing**: The system checks `user_roles` and redirects them to the Admin Dashboard (`/admin`).
3. **Processing RFQs (`/admin/rfqs`)**: Staff review new RFQs submitted by the public. They can update the status (e.g., to `contacted` or `quoted`) as they communicate with the prospect.
4. **Managing Orders (`/admin/orders`)**: 
   - When an RFQ is won, staff can create a new Order linked to that client.
   - As the garment moves through the factory, staff update the order status (e.g., `pending` -> `in_production` -> `qc`). 
   - Every status change automatically writes to `order_updates`, which the client can immediately see on their portal.
5. **Managing Inventory (`/admin/inventory`)**: 
   - Staff track raw materials (e.g., fabric rolls, thread) and finished goods.
   - When a production run finishes or materials are used, they log a movement (`in` or `out`), which automatically updates the `quantity_on_hand` in `inventory_items`.

---

## 5. Directory Structure & Architecture

Here is how the codebase is organized under `src/`:

- **`/assets`**: Static assets like images and global styles.
- **`/components`**: Reusable React components.
  - **`/ui`**: Dumb/presentational components generated by Shadcn UI (e.g., buttons, inputs, dialogs).
  - **`/layout`**: The wrapper components for different areas of the app (`PublicLayout`, `AdminLayout`, `PortalLayout`).
  - **`/auth`**: Components related to authentication, including `ProtectedRoute` which handles RBAC routing.
- **`/hooks`**: Custom React hooks (e.g., `use-toast` for notifications).
- **`/integrations/supabase`**: Contains the Supabase client initialization (`client.ts`) and the auto-generated TypeScript definitions for the database schema (`types.ts`). This ensures the entire app has strict typing aligned with the database.
- **`/lib`**: Utility functions, such as `utils.ts` for Tailwind class merging (`cn`).
- **`/pages`**: Top-level route components.
  - Root level: Public pages (`HomePage`, `CatalogPage`, etc.) and `AuthPage`.
  - **`/admin`**: Admin-specific pages (`AdminDashboard`, `RfqInbox`, `InventoryPage`, etc.).
  - **`/portal`**: Client-specific pages (`PortalHome`, `MyOrders`, etc.).

---

## 6. How the Pieces Fit Together (The "Glue")

1. **Authentication State**: Supabase manages session tokens via local storage. The `App.tsx` router uses a `<ProtectedRoute>` wrapper that checks if a user is logged in, and queries a custom Supabase RPC function (`has_role`) or the `user_roles` table to determine if they are allowed to access a specific route.
2. **Data Fetching (React Query)**: Instead of manually using `useEffect` to fetch data, the app uses React Query. For example, when an admin opens the Inventory page, `useQuery` fetches data from Supabase. If they add an item, a `useMutation` sends the data to Supabase and then immediately *invalidates* the inventory query, causing the table to instantly refresh with the new data.
3. **Security (Row Level Security - RLS)**: All security is enforced at the database level in Supabase.
   - A public visitor can *insert* an RFQ but cannot *read* RFQs.
   - A client can only *read* orders where `orders.client_id` matches their own Auth ID.
   - Only users with the `admin` or `staff` role can read/write to the inventory and all orders.

This architecture ensures a highly secure, fast, and scalable platform where the frontend is completely decoupled from the database, communicating exclusively through secure APIs and WebSockets provided by Supabase.
