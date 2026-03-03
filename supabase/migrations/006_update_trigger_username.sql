-- Migration 006: Update handle_new_user trigger to extract username from metadata
-- This ensures username is set automatically when creating employee accounts

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, rate, role, org_id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'rate')::numeric, 0),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    (NEW.raw_user_meta_data->>'org_id')::uuid,
    NEW.raw_user_meta_data->>'username'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    rate = EXCLUDED.rate,
    role = EXCLUDED.role,
    org_id = COALESCE(EXCLUDED.org_id, profiles.org_id),
    username = COALESCE(EXCLUDED.username, profiles.username);
  RETURN NEW;
END;
$$;

-- Re-attach trigger (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
