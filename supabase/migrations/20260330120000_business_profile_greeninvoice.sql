-- Green Invoice (חשבונית ירוקה) API credentials per tenant
-- Secret stored encrypted (enc:v1:...) via Edge Function, same key as Pulseem fields.

alter table public.business_profile
  add column if not exists greeninvoice_api_key_id text,
  add column if not exists greeninvoice_api_secret text,
  add column if not exists greeninvoice_has_credentials boolean not null default false;

comment on column public.business_profile.greeninvoice_api_key_id is 'Green Invoice API key id (מזהה מפתח) from developer tools';
comment on column public.business_profile.greeninvoice_api_secret is 'Green Invoice API secret, AES-GCM encrypted (enc:v1:...)';
comment on column public.business_profile.greeninvoice_has_credentials is 'True when encrypted Green Invoice secret is set';
