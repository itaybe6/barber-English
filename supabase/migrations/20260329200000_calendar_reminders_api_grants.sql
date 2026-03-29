-- calendar_reminders is recreated after 20260327240000 dropped it.
-- Explicit grants avoid silent insert failures when PostgREST uses anon (custom phone login without Supabase Auth session).

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.calendar_reminders TO anon, authenticated, service_role;
