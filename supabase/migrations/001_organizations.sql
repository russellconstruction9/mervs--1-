-- Migration 001: Create organizations table for multi-tenant SaaS
-- Each organization represents one company using the TaskPoint platform

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,  -- company code used by employees to log in
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settings JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Temporarily allow all authenticated users to read orgs (tightened in 002 after org_id is added)
CREATE POLICY "authenticated_read_orgs" ON organizations
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to insert their own org (restricted by app logic)
CREATE POLICY "authenticated_insert_org" ON organizations
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
