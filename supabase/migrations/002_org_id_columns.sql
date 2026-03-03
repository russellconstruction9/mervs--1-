-- Migration 002: Add org_id to all data tables for multi-tenant isolation
-- Run AFTER 001_organizations.sql

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

-- ORGANIZATIONS: tighten policy — members can only read their own org
DROP POLICY IF EXISTS "authenticated_read_orgs" ON organizations;
DROP POLICY IF EXISTS "members_read_own_org" ON organizations;
CREATE POLICY "members_read_own_org" ON organizations
  FOR SELECT USING (
    id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

-- PROFILES: users see only their org
DROP POLICY IF EXISTS "users_own_profile" ON profiles;
DROP POLICY IF EXISTS "org_isolation" ON profiles;
CREATE POLICY "org_isolation" ON profiles
  FOR ALL USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

-- TASKS: users see only their org's tasks
DROP POLICY IF EXISTS "org_isolation" ON tasks;
CREATE POLICY "org_isolation" ON tasks
  FOR ALL USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

-- TIME_ENTRIES: users see only their org's time entries
DROP POLICY IF EXISTS "org_isolation" ON time_entries;
CREATE POLICY "org_isolation" ON time_entries
  FOR ALL USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

-- MESSAGES: users see only their org's messages
DROP POLICY IF EXISTS "org_isolation" ON messages;
CREATE POLICY "org_isolation" ON messages
  FOR ALL USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

-- JOBS: users see only their org's jobs
DROP POLICY IF EXISTS "org_isolation" ON jobs;
CREATE POLICY "org_isolation" ON jobs
  FOR ALL USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

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
