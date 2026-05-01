# Workspace

## Overview

SERMACROPS EDI System — a full-stack Electronic Data Interchange (EDI) system for a manufacturing company. Handles ANSI X12 EDI documents (850, 855, 856, 810, 204, 990) with AS2 protocol simulation between Coffee Shop (client), Raw Materials Supplier, and Logistics Provider.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Artifacts

### `sermacrops-edi` (React + Vite, `/`)
Dashboard with pages:
- `/` — Command Center dashboard: metrics, transaction bar chart, recent activity feed
- `/transactions` — Full EDI transaction log with process capability for pending
- `/purchase-orders` — PO tracking with status pipeline
- `/inventory` — Stock levels with low-stock warnings
- `/partners` — Trading partner list (Coffee Shop, RawMat Supply, FastTrack Logistics)
- `/edi-simulator` — Form to simulate any EDI transaction type and see raw response

### `api-server` (Express 5, `/api`)
Key routes:
- `POST /api/edi` — Receive raw ANSI X12 EDI document
- `POST /api/edi/simulate/:transactionType` — Simulate EDI from a partner
- `GET /api/transactions` — List transactions with filters
- `POST /api/transactions/:id/process` — Manually process pending transaction
- `GET /api/purchase-orders` — List POs with filters
- `GET /api/inventory` — List inventory items
- `PATCH /api/inventory/:id` — Update inventory quantities
- `GET /api/partners` — List trading partners
- `GET /api/dashboard/summary` — Summary stats
- `GET /api/dashboard/transaction-stats` — Type/status/partner breakdowns
- `GET /api/dashboard/recent-activity` — Recent 20 transactions

## EDI Modules (`artifacts/api-server/src/edi/`)

- `parser.ts` — ANSI X12 parse/generate (ISA/GS/ST envelope handling)
- `as2Client.ts` — AS2 protocol simulation (signing, MDN, send/receive)
- `config.ts` — Trading partner registry (PARTNERS)
- `router.ts` — Routes inbound EDI to appropriate handler
- `transactionHandlers.ts` — Handlers for 850, 855, 856, 810, 204, 990

## DB Schema (`lib/db/src/schema/`)

- `transactions` — All inbound/outbound EDI documents
- `purchase_orders` — POs from/to all partners
- `inventory` — Product stock levels
- `partners` — Trading partner configuration

## EDI Transaction Flow

1. Coffee Shop sends EDI 850 → SERMACROPS auto-responds 855, creates outbound 850 to RawMat Supplier
2. RawMat Supplier responds 855 (acknowledge), 856 (ship) → triggers 204 to Logistics
3. Logistics responds 990 → SERMACROPS sends 856 + 810 to Coffee Shop

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
