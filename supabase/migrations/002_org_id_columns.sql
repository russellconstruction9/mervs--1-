-- Migration 002: Add org_id to all data tables for multi-tenant isolation
-- Run AFTER 001_organizations.sql

-- Helper function to get current user's org_id (SECURITY DEFINER bypasses RLS to prevent recursion)
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid();
$$;

-- Add org_id to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Add org_id to tasks
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Add org_id to time_entries
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Add org_id to messages
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Add org_id to jobs
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- -----------------------------------------------
-- RLS POLICIES (replace any existing open policies)
-- -----------------------------------------------

-- ORGANIZATIONS: members can only read their own org
DROP POLICY IF EXISTS "authenticated_read_orgs" ON organizations;
DROP POLICY IF EXISTS "members_read_own_org" ON organizations;
CREATE POLICY "members_read_own_org" ON organizations
  FOR SELECT USING (id = public.get_my_org_id());

-- PROFILES: users can CRUD their own profile, and READ other profiles in their org
DROP POLICY IF EXISTS "users_own_profile" ON profiles;
DROP POLICY IF EXISTS "org_isolation" ON profiles;
DROP POLICY IF EXISTS "org_members_read_profiles" ON profiles;
CREATE POLICY "users_own_profile" ON profiles
  FOR ALL USING (id = auth.uid());
CREATE POLICY "org_members_read_profiles" ON profiles
  FOR SELECT USING (org_id = public.get_my_org_id());

-- TASKS: users see only their org's tasks
DROP POLICY IF EXISTS "authenticated_all_tasks" ON tasks;
DROP POLICY IF EXISTS "org_isolation" ON tasks;
CREATE POLICY "org_isolation" ON tasks
  FOR ALL USING (org_id = public.get_my_org_id());

-- TIME_ENTRIES: users see only their org's time entries
DROP POLICY IF EXISTS "authenticated_all_time_entries" ON time_entries;
DROP POLICY IF EXISTS "org_isolation" ON time_entries;
CREATE POLICY "org_isolation" ON time_entries
  FOR ALL USING (org_id = public.get_my_org_id());

-- MESSAGES: users see only their org's messages
DROP POLICY IF EXISTS "authenticated_all_messages" ON messages;
DROP POLICY IF EXISTS "org_isolation" ON messages;
CREATE POLICY "org_isolation" ON messages
  FOR ALL USING (org_id = public.get_my_org_id());

-- JOBS: users see only their org's jobs
DROP POLICY IF EXISTS "authenticated_all_jobs" ON jobs;
DROP POLICY IF EXISTS "org_isolation" ON jobs;
CREATE POLICY "org_isolation" ON jobs
  FOR ALL USING (org_id = public.get_my_org_id());

-- -----------------------------------------------
-- Update handle_new_user trigger to set org_id
-- (assumes trigger function already exists)
-- -----------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, rate, role, org_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'rate')::numeric, 0),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    (NEW.raw_user_meta_data->>'org_id')::uuid
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    rate = EXCLUDED.rate,
    role = EXCLUDED.role,
    org_id = EXCLUDED.org_id;
  RETURN NEW;
END;
$$;

-- Re-attach trigger if needed
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
