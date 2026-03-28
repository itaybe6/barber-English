-- Manual display order for store products (admin reorder).
alter table public.products add column if not exists display_order integer;

create index if not exists products_business_display_order_idx
  on public.products (business_id, display_order);

-- Backfill: newest first → order index 0,1,2… (matches previous default list order).
update public.products p
set display_order = sub.rn
from (
  select
    id,
    (row_number() over (partition by business_id order by created_at desc) - 1)::integer as rn
  from public.products
  where is_active = true
) sub
where p.id = sub.id;
