-- Add language column to users table with default Hebrew ('he')
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'he';

-- Optional: backfill any NULLs if column existed without default
UPDATE users SET language = 'he' WHERE language IS NULL;

-- Optional: constrain to supported values
-- ALTER TABLE users ADD CONSTRAINT users_language_chk CHECK (language IN ('he','en'));


