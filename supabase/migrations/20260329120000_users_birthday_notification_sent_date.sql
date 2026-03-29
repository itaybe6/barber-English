-- Track last Jerusalem calendar day we sent automated birthday notification (dedupe; Edge: birthday-notifications)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birthday_notification_sent_date date;

COMMENT ON COLUMN public.users.birthday_notification_sent_date IS 'Jerusalem calendar date when last automated birthday notification was sent (Edge: birthday-notifications).';
