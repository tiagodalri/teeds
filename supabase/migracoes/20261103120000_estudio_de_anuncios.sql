-- Estúdio de anúncios (03/11/2026, Tiago: "uma ferramenta pra gente subir anúncios pela plataforma,
-- de forma mais intuitiva do que no gerenciador... mesmo teste A/B").
--
-- A função meta-estudio fala com a Meta (com a mesma chave do painel, META_ADS_<MARCA>_<PARCEIRO>).
-- Aqui ficam:
--   * anuncios_rascunhos: o que está sendo montado (começa no celular, termina no computador),
--     com o progresso da criação na Meta (os ids criados), para retomar de onde parou;
--   * anuncios_historico: quem criou, ligou, pausou ou mudou orçamento, e quando.
-- Tudo nasce pausado na Meta; ligar é sempre um segundo passo, confirmado na tela.

create table if not exists public.anuncios_rascunhos (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  parceiro text not null,
  tipo text not null default 'novo' check (tipo in ('novo', 'teste')),
  nome text not null default '',
  dados jsonb not null default '{}'::jsonb,
  -- rascunho -> criando -> pausado (já na Meta) -> ligado; erro: parou no meio (dá para tentar de novo)
  situacao text not null default 'rascunho' check (situacao in ('rascunho', 'criando', 'pausado', 'ligado', 'erro', 'arquivado')),
  progresso jsonb not null default '{}'::jsonb,
  erro text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists anuncios_rascunhos_marca on public.anuncios_rascunhos (marca, parceiro, atualizado_em desc);
alter table public.anuncios_rascunhos enable row level security;
revoke all on public.anuncios_rascunhos from anon, authenticated;

create table if not exists public.anuncios_historico (
  id bigint generated always as identity primary key,
  marca text not null,
  parceiro text not null,
  quem uuid,
  quem_nome text,
  acao text not null,
  alvo_tipo text,
  alvo_id text,
  alvo_nome text,
  detalhe jsonb not null default '{}'::jsonb,
  em timestamptz not null default now()
);
create index if not exists anuncios_historico_marca on public.anuncios_historico (marca, parceiro, em desc);
alter table public.anuncios_historico enable row level security;
revoke all on public.anuncios_historico from anon, authenticated;

-- os rascunhos do parceiro (sem os arquivados), do mais recente para o mais antigo
create or replace function public.teeds_estudio_rascunhos(p_marca text, p_parceiro text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral usa o estúdio de anúncios'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'tipo', r.tipo, 'nome', r.nome, 'dados', r.dados, 'situacao', r.situacao,
                                        'progresso', r.progresso, 'erro', r.erro, 'criadoEm', r.criado_em, 'atualizadoEm', r.atualizado_em)
                     order by r.atualizado_em desc)
    from public.anuncios_rascunhos r
    where r.marca = p_marca and r.parceiro = p_parceiro and r.situacao <> 'arquivado'
  ), '[]'::jsonb);
end $$;

-- guarda (cria ou atualiza) um rascunho; o que já está na Meta não volta a ser editável
create or replace function public.teeds_estudio_salvar(p_marca text, p_parceiro text, p_id uuid, p_tipo text, p_nome text, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral usa o estúdio de anúncios'; end if;
  if p_parceiro !~ '^[a-z0-9]{1,12}$' then raise exception 'Parceiro inválido'; end if;
  if pg_column_size(p_dados) > 400000 then raise exception 'Rascunho grande demais'; end if;
  if p_id is null then
    insert into public.anuncios_rascunhos (marca, parceiro, tipo, nome, dados)
    values (p_marca, p_parceiro, coalesce(p_tipo, 'novo'), left(coalesce(p_nome, ''), 200), coalesce(p_dados, '{}'::jsonb))
    returning id into v_id;
    return v_id;
  end if;
  update public.anuncios_rascunhos set nome = left(coalesce(p_nome, ''), 200), dados = coalesce(p_dados, '{}'::jsonb), atualizado_em = now()
  where id = p_id and marca = p_marca and parceiro = p_parceiro and situacao in ('rascunho', 'erro')
  returning id into v_id;
  if v_id is null then raise exception 'Esse rascunho já foi para a Meta e não pode mais ser editado'; end if;
  return v_id;
end $$;

-- tira da lista (não apaga: fica guardado como arquivado)
create or replace function public.teeds_estudio_arquivar(p_marca text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral usa o estúdio de anúncios'; end if;
  update public.anuncios_rascunhos set situacao = 'arquivado', atualizado_em = now() where id = p_id and marca = p_marca;
end $$;

create or replace function public.teeds_estudio_historico(p_marca text, p_parceiro text, p_limite int default 80)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral usa o estúdio de anúncios'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', h.id, 'quem', h.quem_nome, 'acao', h.acao, 'alvoTipo', h.alvo_tipo, 'alvoId', h.alvo_id,
                                        'alvoNome', h.alvo_nome, 'detalhe', h.detalhe, 'em', h.em) order by h.em desc)
    from (select * from public.anuncios_historico where marca = p_marca and parceiro = p_parceiro order by em desc limit least(greatest(p_limite, 1), 300)) h
  ), '[]'::jsonb);
end $$;

revoke all on function public.teeds_estudio_rascunhos(text, text) from public, anon;
revoke all on function public.teeds_estudio_salvar(text, text, uuid, text, text, jsonb) from public, anon;
revoke all on function public.teeds_estudio_arquivar(text, uuid) from public, anon;
revoke all on function public.teeds_estudio_historico(text, text, int) from public, anon;
grant execute on function public.teeds_estudio_rascunhos(text, text) to authenticated;
grant execute on function public.teeds_estudio_salvar(text, text, uuid, text, text, jsonb) to authenticated;
grant execute on function public.teeds_estudio_arquivar(text, uuid) to authenticated;
grant execute on function public.teeds_estudio_historico(text, text, int) to authenticated;
