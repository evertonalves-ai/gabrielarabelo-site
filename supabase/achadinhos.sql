-- Achadinhos da Gabi: produtos indicados (links de afiliado) exibidos em /achadinhos
-- Rodar uma vez no SQL Editor do projeto Supabase da Gabi.
-- Visitantes (anon) só LEEM os itens ativos; ninguém escreve pela chave pública.
-- Para cadastrar: Table Editor -> achadinhos -> Insert row.

create table if not exists public.achadinhos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  titulo text not null check (char_length(titulo) between 2 and 120),
  descricao text check (descricao is null or char_length(descricao) <= 200),
  preco text check (preco is null or char_length(preco) <= 30),
  imagem_url text check (imagem_url is null or imagem_url ~ '^https://'),
  link text not null check (link ~ '^https://'),
  loja text check (loja is null or char_length(loja) <= 40),
  categoria text check (categoria is null or char_length(categoria) <= 40),
  ordem integer not null default 0,
  ativo boolean not null default true
);

alter table public.achadinhos enable row level security;

revoke all on public.achadinhos from anon, authenticated;
grant select (titulo, descricao, preco, imagem_url, link, loja, categoria, ordem, created_at, ativo)
  on public.achadinhos to anon;

drop policy if exists "anon le achadinhos ativos" on public.achadinhos;
create policy "anon le achadinhos ativos" on public.achadinhos
  for select to anon using (ativo = true);
