-- Migration 003: Create push_subscriptions table for Web Push notifications

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)  -- one active subscription per user (upsert on conflict)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own subscription
CREATE POLICY "own_subscription" ON push_subscriptions
  FOR ALL USING (user_id = auth.uid());

-- Service role can read all subscriptions (needed for push-send Edge Function)
CREATE POLICY "service_role_read_all" ON push_subscriptions
  FOR SELECT USING (auth.role() = 'service_role');
