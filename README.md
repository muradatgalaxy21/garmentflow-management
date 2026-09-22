# GarmentFlow Management System

GarmentFlow Management System is an end-to-end Enterprise Resource Planning (ERP) and live factory floor management portal designed specifically for garment manufacturing operations. 

This platform connects public marketing, client ordering, factory production tracking, inventory control, and workforce payroll into one unified system.

## Key Value and Business Benefits

- **Complete Production Visibility**: Track orders from the moment a client requests a quote to final delivery, ensuring total transparency.
- **Factory Floor Efficiency**: Accessible interface with QR code scanning designed specifically for factory workers to eliminate paper records and cut data entry time.
- **Strict Quality Control**: Enforces sequential stage progression and supervisor verification before batches move to the next department.
- **Real-Time Inventory Tracking**: Automatically deducts raw materials, fabrics, and accessories as items are used during production runs.
- **Streamlined Payroll and Wages**: Automatically logs worker entries to simplify daily wage (Dihaari), piece-rate, and monthly salary calculations.
- **Bilingual Support**: Fully supports English and Urdu (Right-to-Left layout) so factory personnel can work in their preferred language.

## System Features and Portals Explained

### 1. Public Marketing Website
- **Product Catalog and Capabilities**: Showcases manufacturing capabilities, garment categories, and custom services to prospective clients.
- **Request for Quote (RFQ) System**: Allows site visitors to submit quote inquiries directly to the sales team.
- **Language Switcher**: Instant toggle between English and Urdu (RTL) across public pages.

### 2. Client Portal
- **Direct Order Placement**: Registered clients can create new custom garment production orders online.
- **Live Order Progress Tracking**: Visual progress bars and percentage indicators showing active production stages.
- **Order Audit Log**: Detailed timeline of order status updates, delivery estimations, and completion milestones.
- **Account Management**: Update company contact information, passcode settings, and client profiles.

### 3. Factory Floor and Worker Interface
- **Worker-Friendly Design**: High-contrast buttons, simple steppers, and minimal typing built for easy touchscreen use on the factory floor.
- **QR Code Scanning**: Instant scanning of batch cards using mobile or tablet cameras to quickly identify production jobs.
- **Sequential Stage Gating**: Ensures batches move strictly through required manufacturing departments in the correct sequence.
- **Supervisor Verification Inbox**: Admin approval gate for starting and ending department stages to prevent unauthorized entries.
- **Department-Specific Logging**: Dedicated data entry forms for Cutting, Accessories, Printing, Embroidery, Stitching, Quality Checks, Packing, and Restocking.
- **Lot and Bundle Tracking**: Tracks smaller sub-units (bundles) as garments circulate through Stitching Hall and Quality inspection stages.

### 4. Admin and Manager Back Office
- **Business Dashboard**: Overview of key metrics, active production batches, stock alerts, and pending quotes.
- **One-Click Order Creation**: Instantly convert approved RFQs into active production orders and batch jobs.
- **Inventory and Material Management**: Automatic SKU creation, unit conversions (meters, yards, pieces, kilograms), and stock adjustments.
- **Payroll and Worker Ledgers**: Tracks daily wage, piece-rate, and monthly worker earnings with one-click CSV report export.
- **Printable Batch QR Cards**: Generates dual Start and End QR cards for physical batch tracking on the factory floor.
- **Dispatch and Batch Reporting**: Complete batch summaries aggregating pass rates, defects, material usage, and shipping details.

## Production Pipeline (13 Manufacturing Stages)

1. **Accessories Forwarding and Checking**: Verify trim, zipper, button, and thread quantities.
2. **Cutting**: Track fabric lay, piece counts, waste percentage, and automatic fabric stock deduction.
3. **Sticker / Printing / Embroidery**: Parallel production operations with customizable piece rates.
4. **Post-Embroidery Quality Check**: Inspect pieces early to catch defects before garment assembly.
5. **Lot Bundling**: Group cut components into numbered bundle lots for organized line assembly.
6. **Stitching Hall**: Track bundle circulation across Singer, Overlock, Flatlock, and Lock-stitch operations.
7. **Button and Eyelet Operations**: Specialized trim attachment with automatic accessory stock deduction.
8. **Clipping**: Thread trimming and piece-rate performance logging.
9. **Pressing**: Garment ironing, steaming, and finishing.
10. **Final Quality Inspection**: Inspect completed garments with pass, alter (re-route to department), or reject verdicts.
11. **Quality Consolidation**: Dynamic batch status merge after complete lot verification.
12. **Packing**: Carton packing with size and color mix ratio validation.
13. **Dispatch and Reporting**: Record shipping carriers, carton counts, and generate final batch performance reports.

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite, React Router DOM
- **User Interface and Styling**: Tailwind CSS, Shadcn UI, Radix UI Primitives, Lucide Icons, Framer Motion
- **Data Fetching and State**: TanStack React Query
- **Form Handling and Validation**: React Hook Form, Zod
- **Backend and Database**: Supabase (PostgreSQL, Row-Level Security, Edge Functions, Authentication)
- **Scanning and Media**: html5-qrcode, qrcode
- **Testing**: Vitest, Playwright

## Getting Started

### Prerequisites
- Node.js (version 18 or higher)
- npm or bun package manager

### Environment Configuration

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and set your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

### Installation and Development

1. Install project dependencies:
   ```bash
   npm install
   ```

2. Start the local development server:
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to `http://localhost:8080` (or the port specified in your terminal).

## Available Commands

- `npm run dev`: Starts the Vite development server.
- `npm run build`: Compiles the project for production deployment.
- `npm run build:dev`: Builds the application in development mode.
- `npm run preview`: Previews the production build locally.
- `npm run lint`: Executes ESLint to check code quality.
- `npm run test`: Runs unit tests using Vitest.
- `npm run test:watch`: Runs Vitest in interactive watch mode.

## Directory Structure Overview

- `src/assets`: Images, logos, and global stylesheets.
- `src/components`: Reusable components including UI primitives, layout wrappers, and forms.
- `src/hooks`: Custom React hooks for toast notifications, language switching, and camera controls.
- `src/integrations`: Supabase client configuration and auto-generated database type definitions.
- `src/lib`: Utility functions, unit conversion helpers, and class name utilities.
- `src/pages`: Main application views for Public site, Client Portal, Factory Floor, and Admin Back Office.

## License

Private and Proprietary - En En Garments.
