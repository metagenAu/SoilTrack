-- Migration 007: User Roles
-- Adds role-based access control with three roles:
--   admin    – full access: can delete/modify trials and manage users
--   upload   – can upload new trials and data, read everything
--   readonly – can only view data

-- Update profiles table: change default role and add constraint
ALTER TABLE profiles
  ALTER COLUMN role SET DEFAULT 'readonly',
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'upload', 'readonly'));

-- Create a function to look up the current user's role from profiles.
-- Returns 'readonly' if no profile row exists.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()),
    'readonly'
  );
$$;

-- Auto-create a profile row when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'readonly')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update RLS policy on profiles: admins can read/update all profiles, others only their own
DROP POLICY IF EXISTS "Authenticated users full access" ON profiles;

-- Everyone can read all profiles (needed for admin user list, and own profile display)
CREATE POLICY "Authenticated users can read profiles"
  ON profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- Users can update their own profile (name, etc.) but NOT role
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can insert profiles (for inviting users)
CREATE POLICY "Admins can insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Admins can update any profile (for changing roles)
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Admins can delete profiles
CREATE POLICY "Admins can delete profiles"
  ON profiles FOR DELETE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Seed admin users: ensure profile rows exist and set role to admin.
-- If the user already has a profile row, update it. If not, create one
-- by looking up the auth.users row by email.
INSERT INTO public.profiles (id, email, role)
  SELECT id, email, 'admin'
  FROM auth.users
  WHERE email IN ('chris@metagen.com.au', 'prue@metagen.com.au')
ON CONFLICT (id) DO UPDATE SET role = 'admin';
