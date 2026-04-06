-- Receipt tracking + finance monthly review notification type + business_profile dedupe column
-- (Idempotent if partially applied.)

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS receipt_issued boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.appointments.receipt_issued IS
  'True after a Green Invoice receipt was issued for this booking (admin finance flow).';

ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS finance_monthly_review_reminder_period text;

COMMENT ON COLUMN public.business_profile.finance_monthly_review_reminder_period IS
  'Last calendar month (YYYY-MM) for which the super_admin monthly finance review notification was sent.';

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  (type)::text = ANY (
    ARRAY[
      'appointment_reminder'::character varying,
      'client_reminder'::character varying,
      'admin_reminder'::character varying,
      'promotion'::character varying,
      'general'::character varying,
      'system'::character varying,
      'finance_monthly_review'::character varying
    ]::text[]
  )
);
