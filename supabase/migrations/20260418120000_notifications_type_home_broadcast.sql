-- Home admin "broadcast to all clients": push + in-app only (no SMS). See notification-push-sms edge function.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  (type)::text = ANY (
    ARRAY[
      'appointment_reminder'::character varying,
      'client_reminder'::character varying,
      'admin_reminder'::character varying,
      'promotion'::character varying,
      'general'::character varying,
      'home_broadcast'::character varying,
      'system'::character varying,
      'finance_monthly_review'::character varying
    ]::text[]
  )
);
