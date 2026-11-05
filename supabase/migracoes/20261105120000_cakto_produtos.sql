-- 05/11/2026: qual produto da Cakto libera o quê passa a morar no banco.
-- Antes o mapa ficava no código do servidor (servidor/src/cakto.ts) e todo produto
-- novo pedia atualizar o servidor. Agora o servidor pergunta à função
-- teeds_cakto_produto quando o id não está no mapa dele. Black e Prestige do
-- GF Member entram aqui assim que forem criados na Cakto.

create table if not exists public.cakto_produtos (
  cakto_id   text primary key,          -- UUID do produto na Cakto
  marca      text not null default 'globalfly',
  produto    text not null,             -- id em cliente_produtos (gf-gulf, gf-black...)
  nome       text,
  criado_em  timestamptz not null default now()
);
alter table public.cakto_produtos enable row level security;
-- sem política: só o servidor (chave de serviço) lê e grava

insert into public.cakto_produtos (cakto_id, produto, nome) values
  ('9df6023b-2178-4439-b33b-fdcea75c7043', 'gf-gulf', 'GF Gulf'),
  ('37f88860-92b2-4977-a254-581569618102', 'gf-phenom', 'GF Phenom'),
  ('11f87fd7-08b6-47e6-911b-5f8c6126ce76', 'gf-pack', 'Pack Gulf + Phenom')
on conflict (cakto_id) do nothing;

create or replace function public.teeds_cakto_produto(p_cakto_id text)
returns text language sql stable security definer set search_path = public as $$
  select produto from public.cakto_produtos where cakto_id = p_cakto_id limit 1;
$$;
revoke all on function public.teeds_cakto_produto(text) from public, anon, authenticated;

-- teeds_cakto_aplicar passa a aceitar os subplanos e qualquer produto da tabela
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.teeds_cakto_aplicar'::regproc);
  v_def := replace(v_def,
    $a$if v_prod not in ('gf-gulf', 'gf-phenom', 'gf-pack') then$a$,
    $b$if v_prod not in ('gf-gulf', 'gf-phenom', 'gf-pack', 'gf-black', 'gf-prestige')
     and not exists (select 1 from public.cakto_produtos cp where cp.produto = v_prod) then$b$);
  execute v_def;
end $$;
