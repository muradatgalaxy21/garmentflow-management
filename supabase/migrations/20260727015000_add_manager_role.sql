-- Extend app_role to include 'manager'
-- Split into its own migration: Postgres forbids using a new enum value
-- in the same transaction that adds it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
