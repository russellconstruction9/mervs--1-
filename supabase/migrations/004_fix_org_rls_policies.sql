-- Migration 004: Fix organization RLS policies for auth flow
-- Problem: The original policies blocked organization creation and lookup during registration/login
-- 
-- Auth Flow Requirements:
-- 1. Registration: Admin signs up -> creates org -> updates profile with org_id
-- 2. Employee Login: Uses company code (slug) to derive synthetic email directly (no org lookup needed)
-- 3. Future: lookupOrgBySlug function available if needed for validation

-- Drop the restrictive SELECT policy that required user to already have org_id
DROP POLICY IF EXISTS "members_read_own_org" ON organizations;

-- Allow anyone to SELECT organizations (needed for future org validation, slug is public anyway)
DROP POLICY IF EXISTS "anyone_can_lookup_org_by_slug" ON organizations;
CREATE POLICY "anyone_can_lookup_org_by_slug" ON organizations
  FOR SELECT
  USING (true);

-- The INSERT policy remains unchanged: only authenticated users can create orgs
-- This is correct because the registration flow now:
-- 1. Signs up admin first (becomes authenticated)
-- 2. Creates org (has auth)
-- 3. Updates profile with org_id
