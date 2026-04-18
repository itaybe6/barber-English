-- Link concrete appointments to a registered client row when the admin books with a known user.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS client_user_id uuid REFERENCES public.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.appointments.client_user_id IS
  'FK to users.id (client) when the booking is tied to an app account; null for legacy rows or walk-ins without a user row.';

CREATE INDEX IF NOT EXISTS idx_appointments_client_user_id
  ON public.appointments (client_user_id)
  WHERE client_user_id IS NOT NULL;
