-- Central ao vivo › Simulação: blocos de mensagens do chat simulado (09/11/2026, Tiago:
-- "eu quero revisar essas mensagens... coloco um tema, descrevo como quero, seleciono quantas,
-- gero com IA, aprovo, ficam em stand-by e quando eu quiser dou o play").
--
-- Cada bloco tem um nome (o tema), a descrição e os exemplos que vão para a I.A., as mensagens
-- aprovadas (as que o play manda) e as que ainda esperam revisão. Só a equipe da marca lê e grava.

create table if not exists public.chat_blocos (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  nome text not null default '' check (char_length(nome) <= 120),
  descricao text not null default '' check (char_length(descricao) <= 2000),
  exemplos text not null default '' check (char_length(exemplos) <= 4000),
  quantidade int not null default 30 check (quantidade between 1 and 100),
  mensagens jsonb not null default '[]'::jsonb check (jsonb_typeof(mensagens) = 'array' and jsonb_array_length(mensagens) <= 500),
  revisar jsonb not null default '[]'::jsonb check (jsonb_typeof(revisar) = 'array' and jsonb_array_length(revisar) <= 200),
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid()
);
create index if not exists chat_blocos_marca on public.chat_blocos (marca, ordem, criado_em);

alter table public.chat_blocos enable row level security;
drop policy if exists "equipe le blocos" on public.chat_blocos;
create policy "equipe le blocos" on public.chat_blocos for select to authenticated using (public.teeds_sou_equipe_da(marca));
drop policy if exists "equipe cria blocos" on public.chat_blocos;
create policy "equipe cria blocos" on public.chat_blocos for insert to authenticated with check (public.teeds_sou_equipe_da(marca));
drop policy if exists "equipe muda blocos" on public.chat_blocos;
create policy "equipe muda blocos" on public.chat_blocos for update to authenticated using (public.teeds_sou_equipe_da(marca)) with check (public.teeds_sou_equipe_da(marca));
drop policy if exists "equipe apaga blocos" on public.chat_blocos;
create policy "equipe apaga blocos" on public.chat_blocos for delete to authenticated using (public.teeds_sou_equipe_da(marca));
grant select, insert, update, delete on public.chat_blocos to authenticated;
