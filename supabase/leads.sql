-- Tabela de leads do site gabibeauty.com.br
-- Rodar uma vez no SQL Editor do projeto Supabase da Gabi.
-- Visitantes (anon) só conseguem INSERIR; ninguém lê pela chave pública.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome text not null check (char_length(nome) between 2 and 80),
  whatsapp text not null check (whatsapp ~ '^[0-9]{10,13}$'),
  procedimento text not null check (char_length(procedimento) between 2 and 80),
  origem text check (origem is null or char_length(origem) <= 120),
  quiz text check (quiz is null or char_length(quiz) <= 300),
  consentimento boolean not null check (consentimento = true)
);

alter table public.leads enable row level security;

revoke all on public.leads from anon, authenticated;
grant insert (nome, whatsapp, procedimento, origem, quiz, consentimento) on public.leads to anon;

drop policy if exists "anon pode inserir lead" on public.leads;
create policy "anon pode inserir lead" on public.leads
  for insert to anon with check (consentimento = true);
