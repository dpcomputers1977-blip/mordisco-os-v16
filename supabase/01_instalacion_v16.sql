-- MORDISCO OS V16 PROFESIONAL
-- Ejecuta TODO este archivo una sola vez en Supabase SQL Editor.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.v16_staff(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check(role in ('admin','cashier','waiter','kitchen')),
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create or replace view public.v16_staff_public as select id,name,role,active,created_at from public.v16_staff;

create table if not exists public.v16_categories(
 id uuid primary key default gen_random_uuid(), name text not null unique, active boolean default true, sort_order integer default 0
);
create table if not exists public.v16_products(
 id uuid primary key default gen_random_uuid(), category_id uuid references public.v16_categories(id) on delete set null,
 name text not null, description text, price numeric(12,2) not null default 0, image_url text, active boolean default true, created_at timestamptz default now()
);
create table if not exists public.v16_customers(
 id uuid primary key default gen_random_uuid(), name text not null, phone text, email text, notes text, created_at timestamptz default now()
);
create table if not exists public.v16_tables(
 id uuid primary key default gen_random_uuid(), name text not null unique, seats integer default 4,
 status text default 'free' check(status in ('free','occupied','preparing','ready')),
 current_order_id uuid, active boolean default true, sort_order integer default 0
);
create table if not exists public.v16_orders(
 id uuid primary key default gen_random_uuid(), order_number bigint generated always as identity,
 source text not null check(source in ('pos','command')), order_type text not null default 'local',
 customer_id uuid references public.v16_customers(id) on delete set null, table_id uuid references public.v16_tables(id) on delete set null,
 subtotal numeric(12,2) not null default 0, total numeric(12,2) not null default 0,
 status text not null default 'pending' check(status in ('pending','preparing','ready','delivered','cancelled')),
 payment_status text not null default 'unpaid' check(payment_status in ('unpaid','paid')),
 payment_method text, amount_received numeric(12,2), paid_at timestamptz, paid_by uuid references public.v16_staff(id),
 notes text, created_by uuid references public.v16_staff(id), created_at timestamptz default now()
);
alter table public.v16_tables drop constraint if exists v16_tables_current_order_id_fkey;
alter table public.v16_tables add constraint v16_tables_current_order_id_fkey foreign key(current_order_id) references public.v16_orders(id) on delete set null;

create table if not exists public.v16_order_items(
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.v16_orders(id) on delete cascade,
 product_id uuid references public.v16_products(id) on delete set null, product_name text not null,
 quantity numeric(10,2) not null, unit_price numeric(12,2) not null, subtotal numeric(12,2) not null
);
create table if not exists public.v16_inventory(
 id uuid primary key default gen_random_uuid(), name text not null unique, unit text not null,
 stock numeric(12,2) default 0, minimum_stock numeric(12,2) default 0, cost numeric(12,2) default 0, active boolean default true, created_at timestamptz default now()
);
create table if not exists public.v16_expenses(
 id uuid primary key default gen_random_uuid(), description text not null, amount numeric(12,2) not null,
 category text, created_by uuid references public.v16_staff(id), created_at timestamptz default now()
);

insert into public.v16_staff(name,role,pin_hash)
select 'Administrador','admin',extensions.crypt('1234',extensions.gen_salt('bf'))
where not exists(select 1 from public.v16_staff where role='admin');

insert into public.v16_categories(name,sort_order) values
('Hamburguesas',1),('Sándwiches',2),('Papas',3),('Bebidas',4)
on conflict(name) do nothing;

insert into public.v16_products(category_id,name,description,price,image_url)
select c.id,'Hamburguesa Mordisco','Carne, queso y salsa de la casa',4.50,'/media/hamburguesa.png' from public.v16_categories c
where c.name='Hamburguesas' and not exists(select 1 from public.v16_products where name='Hamburguesa Mordisco');
insert into public.v16_products(category_id,name,description,price,image_url)
select c.id,'Sándwich Especial','Pollo, vegetales y salsa Mordisco',3.75,'/media/sandwich.png' from public.v16_categories c
where c.name='Sándwiches' and not exists(select 1 from public.v16_products where name='Sándwich Especial');

insert into public.v16_tables(name,seats,sort_order)
select 'Mesa '||n,4,n from generate_series(1,10)n
on conflict(name) do nothing;

create or replace function public.v16_verify_staff_pin(p_staff_id uuid,p_pin text)
returns table(id uuid,name text,role text,active boolean)
language sql security definer set search_path=public,extensions as $$
 select s.id,s.name,s.role,s.active from public.v16_staff s
 where s.id=p_staff_id and s.active=true and s.pin_hash=extensions.crypt(p_pin,s.pin_hash);
$$;

create or replace function public.v16_create_staff(p_name text,p_role text,p_pin text,p_admin_id uuid,p_admin_pin text)
returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare new_id uuid;
begin
 if not exists(select 1 from public.v16_staff where id=p_admin_id and role='admin' and active=true and pin_hash=extensions.crypt(p_admin_pin,pin_hash)) then raise exception 'Administrador o PIN inválido'; end if;
 if p_role not in ('admin','cashier','waiter','kitchen') then raise exception 'Rol inválido'; end if;
 if p_pin !~ '^[0-9]{4,6}$' then raise exception 'El PIN debe tener entre 4 y 6 números'; end if;
 insert into public.v16_staff(name,role,pin_hash) values(p_name,p_role,extensions.crypt(p_pin,extensions.gen_salt('bf'))) returning id into new_id;
 return new_id;
end $$;

create or replace function public.v16_toggle_staff(p_target_id uuid,p_active boolean,p_admin_id uuid,p_pin text)
returns boolean language plpgsql security definer set search_path=public,extensions as $$
begin
 if not exists(select 1 from public.v16_staff where id=p_admin_id and role='admin' and active=true and pin_hash=extensions.crypt(p_pin,pin_hash)) then raise exception 'Administrador o PIN inválido'; end if;
 update public.v16_staff set active=p_active where id=p_target_id and role<>'admin'; return true;
end $$;

create or replace function public.v16_pay_order(p_order_id uuid,p_method text,p_received numeric,p_staff_id uuid,p_pin text)
returns boolean language plpgsql security definer set search_path=public,extensions as $$
declare o public.v16_orders%rowtype;
begin
 if not exists(select 1 from public.v16_staff where id=p_staff_id and role in ('admin','cashier') and active=true and pin_hash=extensions.crypt(p_pin,pin_hash)) then raise exception 'Solo Caja puede cobrar'; end if;
 select * into o from public.v16_orders where id=p_order_id for update;
 if o.payment_status='paid' then raise exception 'La orden ya fue cobrada'; end if;
 if p_method not in ('cash','card','transfer') then raise exception 'Método inválido'; end if;
 if p_method='cash' and p_received<o.total then raise exception 'Efectivo insuficiente'; end if;
 update public.v16_orders set payment_status='paid',payment_method=p_method,amount_received=p_received,paid_at=now(),paid_by=p_staff_id where id=p_order_id;
 return true;
end $$;

create or replace function public.v16_update_order_status(p_order_id uuid,p_status text,p_staff_id uuid,p_pin text)
returns boolean language plpgsql security definer set search_path=public,extensions as $$
declare order_table uuid;
begin
 if not exists(select 1 from public.v16_staff where id=p_staff_id and role in ('admin','kitchen') and active=true and pin_hash=extensions.crypt(p_pin,pin_hash)) then raise exception 'Acceso de Cocina inválido'; end if;
 if p_status not in ('preparing','ready','delivered') then raise exception 'Estado inválido'; end if;
 update public.v16_orders set status=p_status where id=p_order_id returning table_id into order_table;
 if order_table is not null then
   if p_status='preparing' then update public.v16_tables set status='preparing' where id=order_table;
   elsif p_status='ready' then update public.v16_tables set status='ready' where id=order_table;
   elsif p_status='delivered' then update public.v16_tables set status='occupied' where id=order_table;
   end if;
 end if;
 return true;
end $$;

alter table public.v16_staff enable row level security;
alter table public.v16_categories enable row level security;
alter table public.v16_products enable row level security;
alter table public.v16_customers enable row level security;
alter table public.v16_tables enable row level security;
alter table public.v16_orders enable row level security;
alter table public.v16_order_items enable row level security;
alter table public.v16_inventory enable row level security;
alter table public.v16_expenses enable row level security;

do $$ begin
  create policy "v16 public read staff view" on public.v16_staff for select using(false);
exception when duplicate_object then null; end $$;
do $$ begin create policy "v16 categories all" on public.v16_categories for all using(true) with check(true); exception when duplicate_object then null; end $$;
do $$ begin create policy "v16 products all" on public.v16_products for all using(true) with check(true); exception when duplicate_object then null; end $$;
do $$ begin create policy "v16 customers all" on public.v16_customers for all using(true) with check(true); exception when duplicate_object then null; end $$;
do $$ begin create policy "v16 tables all" on public.v16_tables for all using(true) with check(true); exception when duplicate_object then null; end $$;
do $$ begin create policy "v16 orders all" on public.v16_orders for all using(true) with check(true); exception when duplicate_object then null; end $$;
do $$ begin create policy "v16 items all" on public.v16_order_items for all using(true) with check(true); exception when duplicate_object then null; end $$;
do $$ begin create policy "v16 inventory all" on public.v16_inventory for all using(true) with check(true); exception when duplicate_object then null; end $$;
do $$ begin create policy "v16 expenses all" on public.v16_expenses for all using(true) with check(true); exception when duplicate_object then null; end $$;

grant select on public.v16_staff_public to anon,authenticated;
grant all on public.v16_categories,public.v16_products,public.v16_customers,public.v16_tables,public.v16_orders,public.v16_order_items,public.v16_inventory,public.v16_expenses to anon,authenticated;
grant usage,select on all sequences in schema public to anon,authenticated;
grant execute on function public.v16_verify_staff_pin(uuid,text) to anon,authenticated;
grant execute on function public.v16_create_staff(text,text,text,uuid,text) to anon,authenticated;
grant execute on function public.v16_toggle_staff(uuid,boolean,uuid,text) to anon,authenticated;
grant execute on function public.v16_pay_order(uuid,text,numeric,uuid,text) to anon,authenticated;
grant execute on function public.v16_update_order_status(uuid,text,uuid,text) to anon,authenticated;
