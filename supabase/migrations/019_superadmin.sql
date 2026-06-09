-- ============================================================
-- Super Admin system
-- ============================================================

-- subscriptions table — one row per workspace owner
CREATE TABLE IF NOT EXISTS subscriptions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan         TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  activated_by UUID REFERENCES auth.users(id),
  activated_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own subscription" ON subscriptions;
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);
-- INSERT / UPDATE / DELETE only via service role (superadmin API routes)

-- admin_logs table — audit trail for superadmin actions + signup events
CREATE TABLE IF NOT EXISTS admin_logs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id       UUID REFERENCES auth.users(id),
  action         TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id),
  details        JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at  ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_target_user ON admin_logs(target_user_id);

ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;
-- No user-facing SELECT policy; only accessible through service-role API routes.

-- Trigger: automatically log every new user signup
CREATE OR REPLACE FUNCTION log_new_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO admin_logs (action, target_user_id, details)
  VALUES (
    'new_signup',
    NEW.user_id,
    jsonb_build_object('email', NEW.email, 'full_name', NEW.full_name)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created ON profiles;
CREATE TRIGGER on_profile_created
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION log_new_signup();
