-- Pixel do parceiro também pelo servidor (02/11/2026, Tiago: "termine a configuração
-- completa do pixel"). O navegador manda o evento ao pixel e, junto, pede à função
-- meta-conversoes que mande o MESMO evento (mesmo event_id) pela API de Conversões
-- da Meta. A Meta junta os dois: conta uma vez só e reconhece melhor quem é a pessoa,
-- inclusive quando o navegador bloqueia o pixel (iPhone, bloqueador de anúncio).
--
-- A chave da API de Conversões é gerada pelo dono do pixel (Gerenciador de Eventos >
-- Configurações > Gerar token de acesso) e colada pelo admin geral em
-- Administração > Parceiros. Fica em config_servicos (META_CAPI_<MARCA>_<PARCEIRO>),
-- que ninguém lê pelo app: nem a tela que salvou consegue ver a chave de volta.

create table if not exists public.meta_conversoes (
  id bigint generated always as identity primary key,
  marca text not null,
  parceiro text not null,
  evento text not null,
  event_id text not null,
  lead_id uuid,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'enviado', 'sem-chave', 'erro')),
  detalhe text,
  criado_em timestamptz not null default now(),
  unique (marca, parceiro, event_id)
);
create index if not exists meta_conversoes_marca_criado on public.meta_conversoes (marca, parceiro, criado_em desc);
alter table public.meta_conversoes enable row level security;
revoke all on public.meta_conversoes from anon, authenticated;

-- Guarda (ou apaga, com chave vazia) a chave da API de Conversões de um parceiro.
create or replace function public.teeds_meta_chave_salvar(p_marca text, p_parceiro text, p_chave text)
returns void language plpgsql security definer set search_path = public as $$
declare v_nome text := 'META_CAPI_' || upper(p_marca) || '_' || upper(p_parceiro);
        v_chave text := btrim(coalesce(p_chave, ''));
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral configura o pixel'; end if;
  if p_parceiro !~ '^[a-z0-9]{1,12}$' then raise exception 'Parceiro inválido'; end if;
  if v_chave = '' then delete from public.config_servicos where chave = v_nome; return; end if;
  if v_chave !~ '^EA[A-Za-z0-9]{40,}$' then
    raise exception 'Essa não parece a chave da Meta. Ela começa com EA e é bem comprida: copie de novo no Gerenciador de Eventos.';
  end if;
  insert into public.config_servicos (chave, valor, atualizado_em) values (v_nome, v_chave, now())
  on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
end $$;
revoke all on function public.teeds_meta_chave_salvar(text, text, text) from public, anon;
grant execute on function public.teeds_meta_chave_salvar(text, text, text) to authenticated;

-- Situação do envio pelo servidor, por parceiro (nunca devolve a chave).
create or replace function public.teeds_meta_situacao(p_marca text, p_parceiro text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral vê o pixel'; end if;
  select jsonb_build_object(
    'temChave', exists (select 1 from public.config_servicos where chave = 'META_CAPI_' || upper(p_marca) || '_' || upper(p_parceiro)),
    'chaveEm', (select atualizado_em from public.config_servicos where chave = 'META_CAPI_' || upper(p_marca) || '_' || upper(p_parceiro)),
    'enviados', (select count(*) from public.meta_conversoes m where m.marca = p_marca and m.parceiro = p_parceiro and m.situacao = 'enviado' and m.criado_em > now() - interval '7 days'),
    'semChave', (select count(*) from public.meta_conversoes m where m.marca = p_marca and m.parceiro = p_parceiro and m.situacao = 'sem-chave' and m.criado_em > now() - interval '7 days'),
    'ultimoEnvio', (select max(criado_em) from public.meta_conversoes m where m.marca = p_marca and m.parceiro = p_parceiro and m.situacao = 'enviado'),
    'ultimoErro', (select jsonb_build_object('em', criado_em, 'detalhe', detalhe) from public.meta_conversoes m
                    where m.marca = p_marca and m.parceiro = p_parceiro and m.situacao = 'erro' order by criado_em desc limit 1)
  ) into v;
  return v;
end $$;
revoke all on function public.teeds_meta_situacao(text, text) from public, anon;
grant execute on function public.teeds_meta_situacao(text, text) to authenticated;
