-- Achadinhos v2: buscador automático + painel de aprovação.
-- Rodar uma vez no SQL Editor do Supabase da Gabi, depois de achadinhos.sql.

alter table public.achadinhos
  add column if not exists origem text not null default 'manual'
    check (origem in ('shopee', 'amazon', 'mercadolivre', 'manual')),
  add column if not exists id_externo text check (id_externo is null or char_length(id_externo) <= 80),
  add column if not exists preco_atual numeric(10,2) check (preco_atual is null or preco_atual >= 0),
  add column if not exists preco_original numeric(10,2) check (preco_original is null or preco_original >= 0),
  add column if not exists desconto_pct numeric(5,2) check (desconto_pct is null or desconto_pct between 0 and 100),
  add column if not exists comissao_pct numeric(5,2) check (comissao_pct is null or comissao_pct between 0 and 100),
  add column if not exists avaliacao numeric(3,2) check (avaliacao is null or avaliacao between 0 and 5),
  add column if not exists vendas integer check (vendas is null or vendas >= 0),
  add column if not exists status text not null default 'rascunho'
    check (status in ('rascunho', 'aprovado', 'descartado')),
  add column if not exists atualizado_em timestamptz not null default now();

-- NULLs não colidem: itens manuais sem id_externo podem repetir.
alter table public.achadinhos drop constraint if exists achadinhos_origem_id_externo_key;
alter table public.achadinhos add constraint achadinhos_origem_id_externo_key unique (origem, id_externo);

-- Troca "ativo" por "status".
drop policy if exists "anon le achadinhos ativos" on public.achadinhos;
alter table public.achadinhos drop column if exists ativo;

-- Quem administra
create table if not exists public.admins (email text primary key);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
insert into public.admins (email) values ('gabi.rabelobeauty@gmail.com') on conflict do nothing;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.eh_admin() from public, anon;
grant execute on function public.eh_admin() to authenticated;

-- Público: só leitura dos aprovados, só colunas de exibição
revoke all on public.achadinhos from anon, authenticated;
grant select (titulo, descricao, preco, imagem_url, link, loja, categoria, ordem, created_at,
              preco_atual, preco_original, desconto_pct, status)
  on public.achadinhos to anon;
drop policy if exists "anon le aprovados" on public.achadinhos;
create policy "anon le aprovados" on public.achadinhos
  for select to anon using (status = 'aprovado');

-- Admin logado: lê, cria e edita (sem delete)
grant select, insert, update on public.achadinhos to authenticated;
drop policy if exists "admin le" on public.achadinhos;
drop policy if exists "admin cria" on public.achadinhos;
drop policy if exists "admin edita" on public.achadinhos;
create policy "admin le" on public.achadinhos for select to authenticated using (public.eh_admin());
create policy "admin cria" on public.achadinhos for insert to authenticated with check (public.eh_admin());
create policy "admin edita" on public.achadinhos for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
