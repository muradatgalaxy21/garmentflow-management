This document outlines the step-by-step implementation plan for integrating a new "Factory Tracking" module into the existing En En Garments application. The application currently uses React 18, Vite, TypeScript, Tailwind CSS, Shadcn UI, and Supabase.

## 1. Supabase Database Expansion (Schema Updates)

The backend needs to be extended to handle multi-phase production tracking. This will be integrated directly into the existing Supabase project.

### 1.1 New Roles

- Update the `user_roles` enum or table to include a new role: `worker`.

### 1.2 New Tables

- **`production_phases`**: Defines the workflow steps (e.g., Cutting, Stitching, QC, Packing).
  - `id` (uuid)
  - `name` (string)
  - `sequence_order` (integer)
- **`production_batches`**: Represents a specific run of a garment style, linked to the `orders` table.
  - `id` (uuid)
  - `order_id` (uuid, FK)
  - `style_number` (string)
  - `total_quantity` (integer)
  - `status` (string: e.g., 'in_progress', 'completed')
  - `qr_code_hash` (string, unique)
- **`batch_tracking`**: Logs every action taken on a batch by a worker.
  - `id` (uuid)
  - `batch_id` (uuid, FK)
  - `phase_id` (uuid, FK)
  - `worker_id` (uuid, FK to `profiles`)
  - `quantity_completed` (integer)
  - `quantity_wasted` (integer)
  - `rate_per_piece` (decimal)
  - `created_at` (timestamp)

### 1.3 Row Level Security (RLS)

- Create RLS policies ensuring users with the `worker` role can only **INSERT** into `batch_tracking` and **SELECT** their assigned `production_batches`. They must not access `orders`, `rfqs`, or financial data.

### 1.4 Database Triggers (Automation)

- **Inventory Deductions**: Create a PostgreSQL function and trigger. When a new entry is added to `batch_tracking` for the "Cutting" phase, automatically insert an 'out' record into the existing `inventory_movements` table, reducing raw material stock in `inventory_items`.

---

## 2. Frontend: Factory Worker Module (`/factory`)

A completely new, mobile-first interface within the existing React app, specifically designed for the factory floor.

### 2.1 Route Configuration

- Add a new `ProtectedRoute` requiring the `worker` role, pointing to a new `/factory` layout.

### 2.2 Mobile-First UI Components

- Build simple, large-button forms using `react-hook-form` and `zod` for validation.
- **QR Scanner Component**: Integrate a React QR/Barcode scanner library (e.g., `react-qr-reader`). Scanning a batch QR code should instantly load the batch details (Style Number, Expected Quantity).
- **Data Entry Form**: Fields for `quantity_completed`, `quantity_wasted`, and `notes`. (Note: `rate_per_piece` might be pre-configured by admin to avoid manual entry errors by workers).

### 2.3 PWA & Offline Support

- Configure `vite-plugin-pwa`.
- Implement service workers to cache the `/factory` assets.
- Use local storage or IndexedDB to save `batch_tracking` form submissions if the device is offline. Automatically sync to Supabase when the internet connection is restored.

### 2.4 Localization

- Implement a simple toggle to translate the `/factory` UI into Roman Urdu/Urdu to facilitate ease of use for factory floor workers.

---

## 3. Frontend: Admin Portal Enhancements (`/admin`)

Upgrade the existing Admin Portal to visualize the real-time data streaming from the factory floor.

### 3.1 Live Kanban Board UI

- In the existing `/admin/orders` route, add a visual Kanban board view alongside the existing list view.
- Columns represent `production_phases` (Cutting, Stitching, Packing).
- Cards represent `production_batches`.
- Leverage Supabase Realtime and React Query to automatically move cards across the board when workers submit phase updates.

### 3.2 Analytics & Bottleneck Dashboard

- Add a new section or widget in the main `AdminDashboard`.
- Display charts showing:
  - Average time spent per phase.
  - Which phase currently has the largest backlog (Bottlenecks).
  - Total wasted pieces per phase.

---

## 4. Notifications & Quality Control

### 4.1 Consolidated Admin Emails

- Instead of an email per phase change, set up a serverless function (e.g., Supabase Edge Functions) running on a cron schedule (e.g., daily at 6 PM).
- This function compiles all `batch_tracking` activity for the day and sends a single, concise summary email to the admin.

### 4.2 Urgent Alerts

- Configure real-time alerts (via email or app push notification) _only_ if critical anomalies occur, such as `quantity_wasted` exceeding a specific threshold (e.g., > 5% of batch).

### 4.3 AI Integration Hook (Future-Proofing)

- Ensure the API endpoints accepting `batch_tracking` data are structured to easily accept JSON payloads from external microservices. This will allow the existing AI garment counting/QC cameras to automatically hit these endpoints with piece counts, acting as an automated "worker" in the future.
  ''')
