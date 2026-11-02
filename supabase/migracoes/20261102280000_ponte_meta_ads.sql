-- Ponte da Meta (02/11/2026, Tiago: "faça o site e servidor da global puxarem daqui, através de
-- um mcp"). A integração da Meta Ads fica no Claude (login do Tiago) e o servidor não alcança.
-- Então uma tarefa agendada no Mac do Tiago (Claude, a cada 30 min) lê a conta do Naor pela
-- integração e grava aqui com teeds_ponte_gravar; a função meta-ads monta o painel a partir
-- destas tabelas quando ainda não existe a chave própria (META_ADS_<MARCA>_<PARCEIRO>).
-- Só entram campanhas da GlobalFly: nome começando com "GF |".

create table if not exists public.meta_ponte_estado (
  marca text not null, parceiro text not null,
  conta jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (marca, parceiro)
);
-- métricas por anúncio e por dia (os nomes das chaves são os de Metricas, em src/core/teeds/anuncios.ts)
create table if not exists public.meta_ponte_dia (
  marca text not null, parceiro text not null, dia date not null, id text not null,
  dados jsonb not null,
  primary key (marca, parceiro, dia, id)
);
-- campanhas, conjuntos e anúncios (status, orçamento, criativo)
create table if not exists public.meta_ponte_entidade (
  marca text not null, parceiro text not null, tipo text not null check (tipo in ('campanha', 'conjunto', 'anuncio')), id text not null,
  dados jsonb not null,
  primary key (marca, parceiro, tipo, id)
);
-- idade/gênero, posicionamento, aparelho e estado, por dia
create table if not exists public.meta_ponte_quebra (
  marca text not null, parceiro text not null, dia date not null, tipo text not null check (tipo in ('idadeGenero', 'posicionamento', 'aparelho', 'regiao')), chave text not null,
  dados jsonb not null,
  primary key (marca, parceiro, dia, tipo, chave)
);
-- eventos do pixel por dia
create table if not exists public.meta_ponte_pixel (
  marca text not null, parceiro text not null, dia date not null, evento text not null, total integer not null,
  primary key (marca, parceiro, dia, evento)
);
do $$ declare t text; begin
  foreach t in array array['meta_ponte_estado', 'meta_ponte_dia', 'meta_ponte_entidade', 'meta_ponte_quebra', 'meta_ponte_pixel'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Grava uma leitura inteira de uma vez (a tarefa manda um JSON só):
-- { conta: {...}, dias: [{dia, id, dados}], entidades: [{tipo, id, dados}],
--   quebras: [{dia, tipo, chave, dados}], pixel: [{dia, evento, total}] }
create or replace function public.teeds_ponte_gravar(p_marca text, p_parceiro text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_dias int := 0; n_ent int := 0; n_q int := 0; n_px int := 0;
begin
  insert into public.meta_ponte_estado (marca, parceiro, conta, atualizado_em)
  values (p_marca, p_parceiro, coalesce(p->'conta', '{}'::jsonb), now())
  on conflict (marca, parceiro) do update set conta = case when excluded.conta = '{}'::jsonb then meta_ponte_estado.conta else excluded.conta end, atualizado_em = now();

  insert into public.meta_ponte_dia (marca, parceiro, dia, id, dados)
  select p_marca, p_parceiro, (x->>'dia')::date, x->>'id', x->'dados' from jsonb_array_elements(coalesce(p->'dias', '[]'::jsonb)) x
  on conflict (marca, parceiro, dia, id) do update set dados = excluded.dados;
  get diagnostics n_dias = row_count;

  insert into public.meta_ponte_entidade (marca, parceiro, tipo, id, dados)
  select p_marca, p_parceiro, x->>'tipo', x->>'id', x->'dados' from jsonb_array_elements(coalesce(p->'entidades', '[]'::jsonb)) x
  on conflict (marca, parceiro, tipo, id) do update set dados = excluded.dados;
  get diagnostics n_ent = row_count;

  insert into public.meta_ponte_quebra (marca, parceiro, dia, tipo, chave, dados)
  select p_marca, p_parceiro, (x->>'dia')::date, x->>'tipo', x->>'chave', x->'dados' from jsonb_array_elements(coalesce(p->'quebras', '[]'::jsonb)) x
  on conflict (marca, parceiro, dia, tipo, chave) do update set dados = excluded.dados;
  get diagnostics n_q = row_count;

  insert into public.meta_ponte_pixel (marca, parceiro, dia, evento, total)
  select p_marca, p_parceiro, (x->>'dia')::date, x->>'evento', (x->>'total')::int from jsonb_array_elements(coalesce(p->'pixel', '[]'::jsonb)) x
  on conflict (marca, parceiro, dia, evento) do update set total = excluded.total;
  get diagnostics n_px = row_count;

  delete from public.meta_ads_cache where chave like p_marca || ':' || p_parceiro || ':%';
  return jsonb_build_object('dias', n_dias, 'entidades', n_ent, 'quebras', n_q, 'pixel', n_px);
end $$;
revoke all on function public.teeds_ponte_gravar(text, text, jsonb) from public, anon, authenticated;
-- a função meta-ponte chama com a chave de serviço
grant execute on function public.teeds_ponte_gravar(text, text, jsonb) to service_role;
