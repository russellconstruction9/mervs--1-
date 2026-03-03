-- Migration 000: Initial schema for TaskPoint
-- Creates base tables required by the application

-- PROFILES: mirrors auth.users with app-specific fields
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rate NUMERIC DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_profile" ON public.profiles;
CREATE POLICY "users_own_profile" ON public.profiles
  FOR ALL USING (id = auth.uid());

-- Trigger: auto-create profile on new auth user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, rate, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'rate')::numeric, 0),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    rate = EXCLUDED.rate,
    role = EXCLUDED.role;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- TASKS
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  location TEXT DEFAULT '',
  assigned_to TEXT DEFAULT '',
  due_date TEXT,
  priority TEXT DEFAULT 'Medium',
  status TEXT DEFAULT 'Pending',
  created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  image TEXT,
  job_name TEXT
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_tasks" ON public.tasks;
CREATE POLICY "authenticated_all_tasks" ON public.tasks
  FOR ALL USING (auth.role() = 'authenticated');

-- TIME ENTRIES
CREATE TABLE IF NOT EXISTS public.time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL DEFAULT '',
  start_time BIGINT NOT NULL,
  end_time BIGINT,
  status TEXT NOT NULL DEFAULT 'active',
  job_name TEXT,
  notes TEXT,
  total_pay NUMERIC,
  is_synced BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_time_entries" ON public.time_entries;
CREATE POLICY "authenticated_all_time_entries" ON public.time_entries
  FOR ALL USING (auth.role() = 'authenticated');

-- MESSAGES (chat)
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender TEXT NOT NULL,
  text TEXT DEFAULT '',
  timestamp BIGINT NOT NULL,
  image TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_messages" ON public.messages;
CREATE POLICY "authenticated_all_messages" ON public.messages
  FOR ALL USING (auth.role() = 'authenticated');

-- JOBS
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_jobs" ON public.jobs;
CREATE POLICY "authenticated_all_jobs" ON public.jobs
  FOR ALL USING (auth.role() = 'authenticated');
