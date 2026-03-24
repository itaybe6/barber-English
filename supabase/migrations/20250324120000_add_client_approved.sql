-- Client self-registration: require admin approval before app access.
-- Existing rows become approved automatically.

alter table public.users
  add column if not exists client_approved boolean not null default true;

comment on column public.users.client_approved is 'When false, client account is pending admin approval (login blocked for clients).';
