-- App + Edge Function auth-phone-otp select users.block on login/register completion.
-- Remote DB was missing this column, causing complete_register_profile to fail after INSERT.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS block boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.block IS 'When true, user cannot sign in (admin-enforced).';
