-- Add username column to profiles for simplified login
-- Employees will use username + password instead of company code + name + password

-- Add username column (nullable initially for existing users)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;

-- Create unique index for username lookups
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON profiles (username) WHERE username IS NOT NULL;

-- Add check constraint to ensure username format (alphanumeric + underscores, no spaces)
ALTER TABLE profiles ADD CONSTRAINT username_format CHECK (
  username IS NULL OR username ~ '^[a-z0-9_]+$'
);

-- Comment explaining the column
COMMENT ON COLUMN profiles.username IS 'Unique username for employee login. Admins use email. Format: lowercase alphanumeric + underscores.';
