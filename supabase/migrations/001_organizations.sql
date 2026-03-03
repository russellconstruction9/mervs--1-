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

-- Org members can read their own org details
CREATE POLICY "members_read_own_org" ON organizations
  FOR SELECT USING (
    id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

-- Only allow inserts via service role (org creation handled in Edge Function or admin)
CREATE POLICY "service_role_insert_org" ON organizations
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
