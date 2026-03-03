-- Migration 004: Fix RLS infinite recursion on profiles table
-- The org_id policies on all tables use a correlated subquery against `profiles`,
-- but the profiles policy ITSELF also uses that same subquery — causing recursion.
-- Fix: add a SECURITY DEFINER helper function that reads org_id without triggering RLS.

-- 1. Create the helper function that bypasses RLS
CREATE OR REPLACE FUNCTION auth.org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
$$;

-- 2. Replace all policies to use auth.org_id() instead of inline subquery

-- PROFILES
DROP POLICY IF EXISTS "org_isolation" ON profiles;
CREATE POLICY "org_isolation" ON profiles
  FOR ALL USING (
    org_id = auth.org_id()
  );

-- TASKS
DROP POLICY IF EXISTS "org_isolation" ON tasks;
DROP POLICY IF EXISTS "authenticated_all_tasks" ON tasks;
CREATE POLICY "org_isolation" ON tasks
  FOR ALL USING (
    org_id = auth.org_id()
  );

-- TIME_ENTRIES
DROP POLICY IF EXISTS "org_isolation" ON time_entries;
DROP POLICY IF EXISTS "authenticated_all_time_entries" ON time_entries;
CREATE POLICY "org_isolation" ON time_entries
  FOR ALL USING (
    org_id = auth.org_id()
  );

-- MESSAGES
DROP POLICY IF EXISTS "org_isolation" ON messages;
DROP POLICY IF EXISTS "authenticated_all_messages" ON messages;
CREATE POLICY "org_isolation" ON messages
  FOR ALL USING (
    org_id = auth.org_id()
  );

-- JOBS
DROP POLICY IF EXISTS "org_isolation" ON jobs;
DROP POLICY IF EXISTS "authenticated_all_jobs" ON jobs;
CREATE POLICY "org_isolation" ON jobs
  FOR ALL USING (
    org_id = auth.org_id()
  );

-- ORGANIZATIONS: allow members to read only their own org, and allow anon insert
-- (needed for registration — org is created before the user session is established)
DROP POLICY IF EXISTS "members_read_own_org" ON organizations;
DROP POLICY IF EXISTS "authenticated_read_orgs" ON organizations;
CREATE POLICY "members_read_own_org" ON organizations
  FOR SELECT USING (
    id = auth.org_id()
  );
-- Allow authenticated users to insert a new org (registration flow)
DROP POLICY IF EXISTS "authenticated_insert_org" ON organizations;
CREATE POLICY "authenticated_insert_org" ON organizations
  FOR INSERT WITH CHECK (true);
