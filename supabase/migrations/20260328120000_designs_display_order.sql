-- Manual display order for gallery designs (client home carousel + gallery + admin reorder).
alter table public.designs add column if not exists display_order integer;

create index if not exists designs_business_display_order_idx
  on public.designs (business_id, display_order);

-- One-time backfill: match previous list order (popularity desc, then newest).
update public.designs d
set display_order = sub.rn
from (
  select
    id,
    (row_number() over (partition by business_id order by popularity desc nulls last, created_at desc) - 1)::integer as rn
  from public.designs
) sub
where d.id = sub.id;
