-- Manual display order for services (client booking + admin edit list).
-- order_index is scoped per worker: many rows can share the same index value across different worker_id.
alter table public.services add column if not exists order_index integer;

create index if not exists services_business_order_idx
  on public.services (business_id, order_index);
