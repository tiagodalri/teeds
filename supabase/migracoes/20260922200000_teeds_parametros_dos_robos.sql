-- Parâmetros dos robôs ajustáveis pelo painel, por marca e por robô.
--
-- O padrão de cada robô continua no código (src/core/deriv/parametros.ts). Aqui
-- fica o que o painel publicou: uma linha por (marca, robô) com a versão
-- publicada para todos, a versão em teste (só contas demo) e o rascunho. O
-- histórico é append-only. O cliente não lê estas tabelas: recebe os parâmetros
-- vigentes pelo servidor (/api/catalogo-robos), que também é o único que escreve
-- (service_role) — a memória viva do servidor precisa saber de cada mudança na
-- hora, inclusive para aplicar nas sessões em andamento.
--
-- Aplicada em 22/09/2026 pelo MCP do Supabase (migração `teeds_parametros_dos_robos`).
begin;

create table if not exists public.robos_parametros (
  marca            text not null check (marca in ('teeds', 'omni')),
  robo_id          text not null check (robo_id ~ '^[a-z0-9]{2,40}$'),
  versao           integer not null default 1 check (versao >= 1),
  parametros       jsonb not null,                      -- publicado para todos (objeto completo, formato v1)
  teste_demo       jsonb,                               -- em teste: só contas demo usam; null = nada em teste
  rascunho         jsonb,                               -- o que o admin está editando; nunca aplicado
  rascunho_em      timestamptz,
  rascunho_por     uuid,
  ultima_acao      text not null default 'publicou'
                   check (ultima_acao in ('publicou', 'testou_demo', 'promoveu_demo', 'descartou_demo', 'restaurou_versao')),
  observacao       text,                                -- "por que mudou", da última publicação
  simulacao        jsonb,                               -- a foto que o admin viu ao publicar (perda máxima nas bases de referência)
  publicado_em     timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  atualizado_por   uuid references auth.users (id) on delete set null,
  primary key (marca, robo_id)
);
comment on table public.robos_parametros is
  'Parâmetros de cada robô por marca: publicado, em teste (demo) e rascunho. O padrão mora no código; sem linha = padrão.';

create table if not exists public.robos_parametros_versoes (
  id                    bigint generated always as identity primary key,
  marca                 text not null check (marca in ('teeds', 'omni')),
  robo_id               text not null,
  versao                integer not null,
  acao                  text not null check (acao in ('publicou', 'testou_demo', 'promoveu_demo', 'descartou_demo', 'restaurou_versao', 'restaurou_padrao')),
  parametros            jsonb not null,                 -- '{}' em restaurou_padrao = "voltou ao padrão do código"
  parametros_anteriores jsonb,
  teste_demo            jsonb,
  observacao            text,
  simulacao             jsonb,
  alterado_por          uuid,
  alterado_em           timestamptz not null default now()
);
comment on table public.robos_parametros_versoes is
  'Histórico append-only dos parâmetros dos robôs: uma linha por publicação, teste, promoção ou restauração.';
create index if not exists robos_parametros_versoes_idx on public.robos_parametros_versoes (marca, robo_id, versao desc, id desc);

alter table public.sessoes_robos add column if not exists parametros_versao integer;
comment on column public.sessoes_robos.parametros_versao is
  'Versão dos parâmetros do robô com que a sessão está rodando; null = padrão do código. A config inteira fica no evento de abertura do espelho.';

-- ------------------------------------------------------------- validação (as mesmas faixas de validar() em parametros.ts)
create or replace function public.teeds_robos_parametros_valida(p jsonb) returns void
language plpgsql immutable set search_path = public as $$
declare n numeric; t text; d jsonb; qtd integer; ag jsonb; palm jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Os parâmetros do robô precisam ser um objeto.'; end if;
  if (p - array['v','entrada','contrato','recuperacao','limites','palm']) <> '{}'::jsonb then raise exception 'Há uma chave desconhecida nos parâmetros do robô.'; end if;
  if (p ->> 'v') is distinct from '1' then raise exception 'Formato de parâmetros desconhecido (esperado v = 1).'; end if;
  n := (p #>> '{entrada,lossVirtual}')::numeric;
  if n is null or n <> trunc(n) or n < 0 or n > 12 then raise exception 'Loss virtual precisa ser um número inteiro de 0 a 12.'; end if;
  if jsonb_typeof(p #> '{entrada,sequenciaSemAnalise}') is distinct from 'boolean' then raise exception 'Informe se o robô segue a sequência sem nova análise (sim ou não).'; end if;
  t := p #>> '{contrato,contractType}'; n := (p #>> '{contrato,barreira}')::numeric;
  if t = 'DIGITOVER' then if n is null or n < 0 or n > 8 then raise exception 'A barreira do Over precisa ficar entre 0 e 8.'; end if;
  elsif t = 'DIGITUNDER' then if n is null or n < 1 or n > 9 then raise exception 'A barreira do Under precisa ficar entre 1 e 9.'; end if;
  else raise exception 'Tipo de contrato desconhecido.'; end if;
  n := (p #>> '{recuperacao,galeApos}')::numeric;
  if n is null or n <> trunc(n) or n < 0 or n > 10 then raise exception 'O gatilho da recuperação precisa ser um inteiro de 0 a 10.'; end if;
  n := (p #>> '{recuperacao,descontoRetorno}')::numeric;
  if n is null or n < 0.8 or n > 1 then raise exception 'A segurança do payout precisa ficar entre 0,80 e 1,00.'; end if;
  n := (p #>> '{recuperacao,lucroMinimo}')::numeric;
  if n is null or n < 0.01 or n > 1 then raise exception 'O lucro mínimo em dólares precisa ficar entre 0,01 e 1,00.'; end if;
  n := (p #>> '{recuperacao,modos,conservador,margem}')::numeric;
  if n is null or n < 0 or n > 2 then raise exception 'O lucro ao fechar a sequência (conservador) precisa ficar entre 0% e 200% da entrada.'; end if;
  n := (p #>> '{recuperacao,modos,conservador,sobrePrejuizo}')::numeric;
  if n is null or n < 0 or n > 1 then raise exception 'A parte do prejuízo que vira lucro precisa ficar entre 0 e 1.'; end if;
  ag := p #> '{recuperacao,modos,agressivo}';
  if ag is null then raise exception 'Informe o modo agressivo (um objeto ou null).'; end if;
  if jsonb_typeof(ag) <> 'null' then
    n := (ag ->> 'margem')::numeric; if n is null or n < 0 or n > 2 then raise exception 'O lucro ao fechar a sequência (agressivo) precisa ficar entre 0% e 200% da entrada.'; end if;
    n := (ag ->> 'sobrePrejuizo')::numeric; if n is null or n < 0 or n > 1 then raise exception 'A parte do prejuízo que vira lucro (agressivo) precisa ficar entre 0 e 1.'; end if;
  end if;
  t := p #>> '{recuperacao,escada,tipo}';
  if t = 'tabela' then
    if jsonb_typeof(p #> '{recuperacao,escada,degraus}') is distinct from 'array' then raise exception 'A tabela precisa de uma lista de degraus.'; end if;
    qtd := jsonb_array_length(p #> '{recuperacao,escada,degraus}');
    if qtd < 1 or qtd > 30 then raise exception 'A tabela aceita de 1 a 30 degraus.'; end if;
    for d in select value from jsonb_array_elements(p #> '{recuperacao,escada,degraus}') loop
      if d ? 'multiplicador' then n := (d ->> 'multiplicador')::numeric;
        if n is null or n < 1 or n > 50 then raise exception 'Cada multiplicador precisa ficar entre 1 e 50 vezes a entrada base.'; end if;
      elsif d ? 'valor' then n := (d ->> 'valor')::numeric;
        if n is null or n < 0.35 or n > 10000 then raise exception 'Cada valor fixo precisa ficar entre US$ 0,35 e US$ 10.000.'; end if;
      else raise exception 'Cada degrau precisa de um multiplicador ou de um valor fixo.'; end if;
    end loop;
    if (p #>> '{recuperacao,escada,depoisDoUltimo}') not in ('formula', 'repetir', 'parar') then raise exception 'Diga o que fazer depois do último degrau: formula, repetir ou parar.'; end if;
  elsif t is distinct from 'formula' then raise exception 'A escada precisa ser "formula" ou "tabela".'; end if;
  n := (p #>> '{limites,valorMaximoPorEntrada}')::numeric;
  if n is null or n < 0 or (n > 0 and n < 0.35) or n > 50000 then raise exception 'O teto por entrada precisa ser 0 (sem teto) ou um valor entre US$ 0,35 e US$ 50.000.'; end if;
  palm := p -> 'palm';
  if palm is not null and jsonb_typeof(palm) <> 'null' then
    if (palm ->> 'janela')::numeric is distinct from 25 then raise exception 'A janela do The Palm é fixa em 25 dígitos nesta versão.'; end if;
    n := (palm ->> 'limiteNove')::numeric; if n is null or n < 0 or n > 100 then raise exception 'O limite do dígito 9 precisa ficar entre 0% e 100%.'; end if;
    n := (palm ->> 'limiteBaixos')::numeric; if n is null or n < 0 or n > 100 then raise exception 'O mínimo de 0 a 4 precisa ficar entre 0% e 100%.'; end if;
    n := (palm ->> 'retornoInicial')::numeric; if n is null or n < 0.5 or n > 1.5 then raise exception 'O retorno presumido do Under 5 precisa ficar entre 0,50 e 1,50.'; end if;
    n := (palm ->> 'desconto')::numeric; if n is null or n < 0.8 or n > 1 then raise exception 'A segurança do payout do The Palm precisa ficar entre 0,80 e 1,00.'; end if;
    n := (palm ->> 'margem')::numeric; if n is null or n < 0 or n > 2 then raise exception 'O lucro ao fechar do The Palm precisa ficar entre 0% e 200%.'; end if;
  end if;
end $$;

-- ------------------------------------------------------------- versão, carimbo e autor
create or replace function public.teeds_robos_parametros_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare proxima integer;
begin
  perform public.teeds_robos_parametros_valida(new.parametros);
  if new.teste_demo is not null then perform public.teeds_robos_parametros_valida(new.teste_demo); end if;
  if new.rascunho is not null then perform public.teeds_robos_parametros_valida(new.rascunho); end if;
  if tg_op = 'INSERT' then
    -- continua a numeração de onde o histórico parou (um "restaurar padrão" apaga a linha, não a contagem)
    select coalesce(max(versao), 0) + 1 into proxima from public.robos_parametros_versoes where marca = new.marca and robo_id = new.robo_id;
    new.versao := proxima; new.publicado_em := now();
  elsif new.parametros is distinct from old.parametros then
    new.versao := old.versao + 1; new.publicado_em := now();
  else
    new.versao := old.versao; new.publicado_em := old.publicado_em;
  end if;
  new.atualizado_em := now();
  new.atualizado_por := coalesce(new.atualizado_por, auth.uid());   -- sob service_role auth.uid() é null: o servidor manda explícito
  return new;
end $$;

-- ------------------------------------------------------------- histórico append-only
create or replace function public.teeds_robos_parametros_depois() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into public.robos_parametros_versoes (marca, robo_id, versao, acao, parametros, parametros_anteriores, observacao, alterado_por)
    values (old.marca, old.robo_id, old.versao + 1, 'restaurou_padrao', '{}'::jsonb, old.parametros, 'Voltou ao padrão da plataforma', old.atualizado_por);
    return old;
  end if;
  if tg_op = 'INSERT' or new.parametros is distinct from old.parametros or new.teste_demo is distinct from old.teste_demo then
    insert into public.robos_parametros_versoes (marca, robo_id, versao, acao, parametros, parametros_anteriores, teste_demo, observacao, simulacao, alterado_por)
    values (new.marca, new.robo_id, new.versao, new.ultima_acao, new.parametros,
            case when tg_op = 'UPDATE' then old.parametros end, new.teste_demo, new.observacao, new.simulacao, new.atualizado_por);
  end if;
  return new;   -- mudança só no rascunho não gera linha de histórico
end $$;

drop trigger if exists robos_parametros_antes on public.robos_parametros;
create trigger robos_parametros_antes before insert or update on public.robos_parametros for each row execute function public.teeds_robos_parametros_antes();
drop trigger if exists robos_parametros_depois on public.robos_parametros;
create trigger robos_parametros_depois after insert or update or delete on public.robos_parametros for each row execute function public.teeds_robos_parametros_depois();

revoke all on function public.teeds_robos_parametros_valida(jsonb) from public, anon, authenticated;
revoke all on function public.teeds_robos_parametros_antes() from public, anon, authenticated;
revoke all on function public.teeds_robos_parametros_depois() from public, anon, authenticated;
grant execute on function public.teeds_robos_parametros_valida(jsonb) to service_role;

-- ------------------------------------------------------------- RLS: admin da marca lê; só o servidor escreve
alter table public.robos_parametros enable row level security;
alter table public.robos_parametros_versoes enable row level security;
drop policy if exists "admin da marca ve os parametros dos robos" on public.robos_parametros;
create policy "admin da marca ve os parametros dos robos" on public.robos_parametros
  for select to authenticated using (public.teeds_sou_admin_da(marca));
drop policy if exists "admin da marca ve o historico dos parametros" on public.robos_parametros_versoes;
create policy "admin da marca ve o historico dos parametros" on public.robos_parametros_versoes
  for select to authenticated using (public.teeds_sou_admin_da(marca));
revoke insert, update, delete, truncate on public.robos_parametros from anon, authenticated;
revoke insert, update, delete, truncate on public.robos_parametros_versoes from anon, authenticated;
commit;

-- Rollback (comentado):
-- drop trigger if exists robos_parametros_depois on public.robos_parametros;
-- drop trigger if exists robos_parametros_antes on public.robos_parametros;
-- drop function if exists public.teeds_robos_parametros_depois(), public.teeds_robos_parametros_antes(), public.teeds_robos_parametros_valida(jsonb);
-- drop table if exists public.robos_parametros_versoes; drop table if exists public.robos_parametros;
-- alter table public.sessoes_robos drop column if exists parametros_versao;
