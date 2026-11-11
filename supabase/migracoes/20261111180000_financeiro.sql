/*
  Financeiro (11/11/2026, Tiago: "No menu de adm eu preciso criar uma parte de financeiro! ... pra acessar
  essa parte a pessoa vai ter uma credencial de acesso (senha individual). La dentro vamos acompanhar os
  custos do projeto, os resultados, etc: lançar despesas, pagamentos, recebimentos, divisões, tudo!").

  A trava é no banco, não só na tela:
    - fin_credenciais: uma senha por PESSOA (pelo e-mail real, o mesmo nas três marcas), guardada com bcrypt.
      Papel: dono (tudo, inclusive acessos e sócios), editor (lança e edita), leitor (só vê).
    - fin_entrar(senha) devolve um token de 12 h; a tela manda o token no cabeçalho x-fin-token e as
      políticas de cada tabela só liberam com um token válido DESTE usuário. Admin logado sem a senha do
      financeiro não lê nada, nem pela API.
    - 5 senhas erradas seguidas travam a credencial por 15 minutos.
    - O admin geral cria a própria senha no primeiro acesso; os outros recebem uma senha provisória do
      dono e trocam no primeiro acesso.

  Lançamentos: receita, despesa, aporte de sócio, retirada de sócio. Receita/despesa com sócio = "recebeu
  na conta pessoal" / "pagou do próprio bolso" (entra no acerto entre os sócios, não mexe na conta do
  projeto). Tudo o que muda num lançamento fica em fin_historico (quem, quando, antes e depois).
*/

create extension if not exists pgcrypto with schema extensions;

-- ── Credenciais e sessões (sem política: só as funções abaixo tocam) ─────────────────────────────
create table if not exists public.fin_credenciais (
  email text primary key,
  papel text not null default 'editor' check (papel in ('dono', 'editor', 'leitor')),
  marcas text[] not null default '{}',
  senha_hash text not null,
  trocar_senha boolean not null default true,
  ativo boolean not null default true,
  falhas int not null default 0,
  bloqueado_ate timestamptz,
  ultimo_acesso timestamptz,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.fin_credenciais enable row level security;

create table if not exists public.fin_sessoes (
  token_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  criada_em timestamptz not null default now(),
  expira_em timestamptz not null,
  encerrada_em timestamptz,
  ultimo_uso timestamptz not null default now()
);
create index if not exists fin_sessoes_user on public.fin_sessoes (user_id);
create index if not exists fin_sessoes_email on public.fin_sessoes (email);
alter table public.fin_sessoes enable row level security;

-- o e-mail real de quem pergunta (sem a etiqueta +marca-x)
create or replace function public.fin_meu_email()
returns text language sql stable security definer set search_path to 'public' as $$
  select lower(public.teeds_email_real(u.email)) from auth.users u where u.id = (select auth.uid());
$$;

create or replace function public.fin_token_pedido()
returns text language sql stable set search_path to 'public' as $$
  select nullif(btrim(coalesce((nullif(current_setting('request.headers', true), '')::json ->> 'x-fin-token'), '')), '');
$$;

create or replace function public.fin_nivel(p_papel text)
returns int language sql immutable as $$
  select case p_papel when 'dono' then 3 when 'editor' then 2 when 'leitor' then 1 else 0 end;
$$;

/*
  As marcas que o token desta requisição libera, com o papel mínimo pedido. '*' = todas (só o admin geral).
  As políticas usam `array[marca, '*'] && (select fin_marcas(...))`: calcula uma vez por consulta.
*/
create or replace function public.fin_marcas(p_min text default 'leitor')
returns text[] language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select case
      when '*' = any (c.marcas) and public.teeds_sou_admin_geral() then array['*']
      else array(select m from unnest(c.marcas) m where m <> '*' and public.teeds_sou_equipe_da(m))
    end
    from public.fin_sessoes s
    join public.fin_credenciais c on c.email = s.email
    where s.token_hash = encode(extensions.digest(coalesce(public.fin_token_pedido(), ''), 'sha256'), 'hex')
      and s.user_id = (select auth.uid())
      and s.expira_em > now() and s.encerrada_em is null
      and c.ativo and not c.trocar_senha
      and public.fin_nivel(c.papel) >= public.fin_nivel(p_min)
    limit 1
  ), '{}'::text[]);
$$;

-- Para o armazenamento dos comprovantes (o Storage não repassa o cabeçalho): sessão aberta deste usuário,
-- usada nos últimos 30 minutos (fin_sessao renova o último uso a cada leitura e antes de cada envio).
create or replace function public.fin_usuario_liberado(p_marca text, p_min text default 'leitor')
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.fin_sessoes s join public.fin_credenciais c on c.email = s.email
    where s.user_id = (select auth.uid()) and s.expira_em > now() and s.encerrada_em is null
      and s.ultimo_uso > now() - interval '30 minutes'
      and c.ativo and not c.trocar_senha and public.fin_nivel(c.papel) >= public.fin_nivel(p_min)
      and ((('*' = any (c.marcas)) and public.teeds_sou_admin_geral()) or (p_marca = any (c.marcas) and public.teeds_sou_equipe_da(p_marca)))
  );
$$;

-- ── Cadastros ─────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.fin_categorias (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  tipo text not null check (tipo in ('entrada', 'saida')),
  nome text not null check (length(btrim(nome)) between 1 and 60),
  cor text not null default '#64748B',
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists fin_categorias_marca on public.fin_categorias (marca);

create table if not exists public.fin_contas (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  nome text not null check (length(btrim(nome)) between 1 and 60),
  tipo text not null default 'banco' check (tipo in ('banco', 'caixa', 'cartao', 'plataforma', 'outro')),
  saldo_inicial numeric(14, 2) not null default 0,
  cor text not null default '#1E3D6E',
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists fin_contas_marca on public.fin_contas (marca);

create table if not exists public.fin_socios (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  nome text not null check (length(btrim(nome)) between 1 and 60),
  percentual numeric(7, 4) not null default 0 check (percentual >= 0 and percentual <= 100),
  cor text not null default '#B78D39',
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists fin_socios_marca on public.fin_socios (marca);

-- ── Lançamentos ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public.fin_lancamentos (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  tipo text not null check (tipo in ('receita', 'despesa', 'aporte', 'retirada')),
  descricao text not null check (length(btrim(descricao)) between 1 and 160),
  valor numeric(14, 2) not null check (valor > 0 and valor < 1000000000),
  vencimento date not null,
  pago_em date,
  categoria_id uuid references public.fin_categorias (id) on delete set null,
  conta_id uuid references public.fin_contas (id) on delete set null,
  socio_id uuid references public.fin_socios (id) on delete restrict,
  contraparte text check (contraparte is null or length(contraparte) <= 120),
  forma text check (forma is null or length(forma) <= 40),
  observacoes text check (observacoes is null or length(observacoes) <= 2000),
  grupo uuid,
  parcela int,
  parcelas int,
  anexos jsonb not null default '[]'::jsonb,
  origem text,
  origem_id text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_por uuid,
  atualizado_em timestamptz not null default now(),
  constraint fin_socio_obrigatorio check (tipo not in ('aporte', 'retirada') or socio_id is not null)
);
create index if not exists fin_lancamentos_marca_venc on public.fin_lancamentos (marca, vencimento);
create index if not exists fin_lancamentos_grupo on public.fin_lancamentos (grupo) where grupo is not null;
create unique index if not exists fin_lancamentos_origem on public.fin_lancamentos (marca, origem, origem_id) where origem is not null;

create table if not exists public.fin_historico (
  id bigserial primary key,
  marca text not null,
  lancamento_id uuid,
  acao text not null,
  por uuid,
  em timestamptz not null default now(),
  antes jsonb,
  depois jsonb
);
create index if not exists fin_historico_marca on public.fin_historico (marca, em desc);

-- quem criou e quem mexeu é sempre quem está logado (a tela não escolhe)
create or replace function public.fin_carimbar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := (select auth.uid());
    new.criado_em := now();
  else
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
    new.marca := old.marca;
  end if;
  new.atualizado_por := (select auth.uid());
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists fin_carimbar on public.fin_lancamentos;
create trigger fin_carimbar before insert or update on public.fin_lancamentos for each row execute function public.fin_carimbar();

create or replace function public.fin_registrar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_acao text;
begin
  if tg_op = 'INSERT' then v_acao := 'criou';
  elsif tg_op = 'DELETE' then v_acao := 'apagou';
  elsif old.pago_em is null and new.pago_em is not null then v_acao := 'pagou';
  elsif old.pago_em is not null and new.pago_em is null then v_acao := 'reabriu';
  else v_acao := 'editou';
  end if;
  insert into public.fin_historico (marca, lancamento_id, acao, por, antes, depois)
  values (coalesce(new.marca, old.marca), coalesce(new.id, old.id), v_acao, (select auth.uid()),
          case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;
drop trigger if exists fin_registrar on public.fin_lancamentos;
create trigger fin_registrar after insert or update or delete on public.fin_lancamentos for each row execute function public.fin_registrar();

-- ── Políticas ─────────────────────────────────────────────────────────────────────────────────────
alter table public.fin_categorias enable row level security;
alter table public.fin_contas enable row level security;
alter table public.fin_socios enable row level security;
alter table public.fin_lancamentos enable row level security;
alter table public.fin_historico enable row level security;

drop policy if exists fin_ler on public.fin_categorias;
create policy fin_ler on public.fin_categorias for select to authenticated using (array[marca, '*'] && (select public.fin_marcas('leitor')));
drop policy if exists fin_escrever on public.fin_categorias;
create policy fin_escrever on public.fin_categorias for all to authenticated
  using (array[marca, '*'] && (select public.fin_marcas('editor'))) with check (array[marca, '*'] && (select public.fin_marcas('editor')));

drop policy if exists fin_ler on public.fin_contas;
create policy fin_ler on public.fin_contas for select to authenticated using (array[marca, '*'] && (select public.fin_marcas('leitor')));
drop policy if exists fin_escrever on public.fin_contas;
create policy fin_escrever on public.fin_contas for all to authenticated
  using (array[marca, '*'] && (select public.fin_marcas('editor'))) with check (array[marca, '*'] && (select public.fin_marcas('editor')));

-- sócios e percentuais: só o dono muda
drop policy if exists fin_ler on public.fin_socios;
create policy fin_ler on public.fin_socios for select to authenticated using (array[marca, '*'] && (select public.fin_marcas('leitor')));
drop policy if exists fin_escrever on public.fin_socios;
create policy fin_escrever on public.fin_socios for all to authenticated
  using (array[marca, '*'] && (select public.fin_marcas('dono'))) with check (array[marca, '*'] && (select public.fin_marcas('dono')));

drop policy if exists fin_ler on public.fin_lancamentos;
create policy fin_ler on public.fin_lancamentos for select to authenticated using (array[marca, '*'] && (select public.fin_marcas('leitor')));
drop policy if exists fin_escrever on public.fin_lancamentos;
create policy fin_escrever on public.fin_lancamentos for all to authenticated
  using (array[marca, '*'] && (select public.fin_marcas('editor'))) with check (array[marca, '*'] && (select public.fin_marcas('editor')));

drop policy if exists fin_ler on public.fin_historico;
create policy fin_ler on public.fin_historico for select to authenticated using (array[marca, '*'] && (select public.fin_marcas('leitor')));

revoke all on public.fin_credenciais, public.fin_sessoes from anon, authenticated;
revoke all on public.fin_categorias, public.fin_contas, public.fin_socios, public.fin_lancamentos, public.fin_historico from anon;
grant select, insert, update, delete on public.fin_categorias, public.fin_contas, public.fin_socios, public.fin_lancamentos to authenticated;
grant select on public.fin_historico to authenticated;

-- ── Entrada, senha e acessos ──────────────────────────────────────────────────────────────────────

-- O que a tela precisa saber antes de pedir a senha.
create or replace function public.fin_meu_acesso(p_marca text default null)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare v_email text := public.fin_meu_email(); c public.fin_credenciais;
begin
  if v_email is null or not exists (select 1 from public.administradores a where a.user_id = (select auth.uid())) then
    return json_build_object('admin', false, 'tem', false);
  end if;
  select * into c from public.fin_credenciais where email = v_email;
  return json_build_object(
    'admin', true, 'geral', public.teeds_sou_admin_geral(), 'tem', c.email is not null,
    'ativo', coalesce(c.ativo, false), 'papel', c.papel, 'marcas', coalesce(to_json(c.marcas), '[]'::json),
    'trocar_senha', coalesce(c.trocar_senha, false),
    -- a credencial vale para a plataforma aberta? (quem é só da GF e abre a OMNI vê o aviso, não a senha)
    'nesta', p_marca is null or (c.email is not null and (('*' = any (c.marcas) and public.teeds_sou_admin_geral()) or (p_marca = any (c.marcas) and public.teeds_sou_equipe_da(p_marca)))),
    'bloqueado_ate', case when c.bloqueado_ate > now() then c.bloqueado_ate end);
end $$;

create or replace function public.fin_senha_valida(p_senha text)
returns boolean language sql immutable as $$
  select p_senha is not null and length(p_senha) between 8 and 72 and p_senha ~ '[A-Za-z]' and p_senha ~ '[0-9]';
$$;

-- Primeiro acesso do admin geral: cria a própria senha (dono, todas as plataformas).
create or replace function public.fin_criar_minha_senha(p_senha text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_email text := public.fin_meu_email();
begin
  if not public.teeds_sou_admin_geral() then raise exception 'Só o administrador geral cria a primeira senha do financeiro.'; end if;
  if exists (select 1 from public.fin_credenciais where email = v_email) then raise exception 'Você já tem uma senha do financeiro.'; end if;
  -- só a primeira: depois disso, quem entra é pelo dono (Acessos)
  if exists (select 1 from public.fin_credenciais where '*' = any (marcas)) then raise exception 'O financeiro já tem um responsável. Peça a ele o seu acesso.'; end if;
  if not public.fin_senha_valida(p_senha) then raise exception 'A senha precisa de 8 caracteres ou mais, com letras e números.'; end if;
  insert into public.fin_credenciais (email, papel, marcas, senha_hash, trocar_senha, criado_por)
  values (v_email, 'dono', array['*'], extensions.crypt(p_senha, extensions.gen_salt('bf', 10)), false, v_email);
  return json_build_object('ok', true);
end $$;

/*
  Entrar. Senha errada NÃO levanta exceção (a exceção desfaria a contagem de erros): devolve
  {erro, restam} e, na 5ª seguida, trava por 15 minutos.
*/
create or replace function public.fin_entrar(p_senha text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_email text := public.fin_meu_email(); c public.fin_credenciais; v_token text; v_expira timestamptz := now() + interval '12 hours';
begin
  if current_setting('transaction_read_only', true) = 'on' then raise exception 'Use POST.'; end if;
  if not exists (select 1 from public.administradores a where a.user_id = (select auth.uid())) then
    return json_build_object('erro', 'sem-acesso');
  end if;
  select * into c from public.fin_credenciais where email = v_email for update;
  if c.email is null or not c.ativo then return json_build_object('erro', 'sem-acesso'); end if;
  if c.bloqueado_ate > now() then return json_build_object('erro', 'bloqueado', 'ate', c.bloqueado_ate); end if;
  if c.senha_hash <> extensions.crypt(coalesce(p_senha, ''), c.senha_hash) then
    if c.falhas + 1 >= 5 then
      update public.fin_credenciais set falhas = 0, bloqueado_ate = now() + interval '15 minutes' where email = v_email;
      return json_build_object('erro', 'bloqueado', 'ate', now() + interval '15 minutes');
    end if;
    update public.fin_credenciais set falhas = c.falhas + 1 where email = v_email;
    return json_build_object('erro', 'senha', 'restam', 5 - (c.falhas + 1));
  end if;
  update public.fin_credenciais set falhas = 0, bloqueado_ate = null, ultimo_acesso = now() where email = v_email;
  delete from public.fin_sessoes where email = v_email and (expira_em < now() - interval '7 days' or encerrada_em < now() - interval '7 days');
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.fin_sessoes (token_hash, user_id, email, expira_em)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), (select auth.uid()), v_email, v_expira);
  return json_build_object('token', v_token, 'expira_em', v_expira, 'papel', c.papel, 'marcas', to_json(c.marcas), 'trocar_senha', c.trocar_senha);
end $$;

-- O token desta requisição ainda vale? Devolve o papel (ou null). A tela confere antes de ler: com o token
-- vencido as tabelas respondem vazio em vez de erro, e a tela mostraria "nenhum lançamento".
create or replace function public.fin_sessao()
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_papel text;
begin
  if cardinality(public.fin_marcas('leitor')) = 0 then return null; end if;
  if current_setting('transaction_read_only', true) <> 'on' then
    update public.fin_sessoes set ultimo_uso = now()
     where token_hash = encode(extensions.digest(coalesce(public.fin_token_pedido(), ''), 'sha256'), 'hex') and user_id = (select auth.uid());
  end if;
  select c.papel into v_papel from public.fin_credenciais c where c.email = public.fin_meu_email();
  return v_papel;
end $$;

-- Bloquear (o botão do cadeado, ou o tempo parado na tela).
create or replace function public.fin_sair()
returns void language sql security definer set search_path to 'public' as $$
  update public.fin_sessoes set encerrada_em = now()
  where token_hash = encode(extensions.digest(coalesce(public.fin_token_pedido(), ''), 'sha256'), 'hex') and user_id = (select auth.uid());
$$;

-- Trocar a própria senha (obrigatório no primeiro acesso com a senha provisória).
create or replace function public.fin_trocar_senha(p_atual text, p_nova text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_email text := public.fin_meu_email(); c public.fin_credenciais;
begin
  if current_setting('transaction_read_only', true) = 'on' then raise exception 'Use POST.'; end if;
  -- a senha nova é conferida ANTES da atual: a resposta não pode servir de "sim/não" para a senha atual
  if not public.fin_senha_valida(p_nova) then return json_build_object('erro', 'fraca'); end if;
  if p_nova = p_atual then return json_build_object('erro', 'igual'); end if;
  select * into c from public.fin_credenciais where email = v_email for update;
  if c.email is null or not c.ativo then return json_build_object('erro', 'sem-acesso'); end if;
  if c.bloqueado_ate > now() then return json_build_object('erro', 'bloqueado', 'ate', c.bloqueado_ate); end if;
  if c.senha_hash <> extensions.crypt(coalesce(p_atual, ''), c.senha_hash) then
    if c.falhas + 1 >= 5 then
      update public.fin_credenciais set falhas = 0, bloqueado_ate = now() + interval '15 minutes' where email = v_email;
      return json_build_object('erro', 'bloqueado', 'ate', now() + interval '15 minutes');
    end if;
    update public.fin_credenciais set falhas = c.falhas + 1 where email = v_email;
    return json_build_object('erro', 'senha', 'restam', 5 - (c.falhas + 1));
  end if;
  update public.fin_credenciais
     set senha_hash = extensions.crypt(p_nova, extensions.gen_salt('bf', 10)), trocar_senha = false, falhas = 0, atualizado_em = now()
   where email = v_email;
  -- as outras sessões abertas (outro aparelho, outra aba) saem; esta continua
  update public.fin_sessoes set encerrada_em = now()
   where email = v_email and encerrada_em is null
     and token_hash <> encode(extensions.digest(coalesce(public.fin_token_pedido(), ''), 'sha256'), 'hex');
  return json_build_object('ok', true);
end $$;

-- Quem tem acesso (só o dono, com o financeiro destravado).
create or replace function public.fin_acessos()
returns table (email text, nome text, papel text, marcas text[], ativo boolean, trocar_senha boolean, bloqueado boolean, ultimo_acesso timestamptz, criado_em timestamptz, eu boolean)
language plpgsql stable security definer set search_path to 'public' as $$
#variable_conflict use_column
begin
  if cardinality(public.fin_marcas('dono')) = 0 then raise exception 'Só quem é dono do financeiro vê os acessos.'; end if;
  return query
  select c.email,
         (select cl.nome from public.clientes cl join auth.users u on u.id = cl.user_id
           where lower(public.teeds_email_real(u.email)) = c.email and coalesce(cl.nome, '') <> '' limit 1),
         c.papel, c.marcas, c.ativo, c.trocar_senha, coalesce(c.bloqueado_ate > now(), false), c.ultimo_acesso, c.criado_em,
         c.email = public.fin_meu_email()
  from public.fin_credenciais c
  where '*' = any (public.fin_marcas('dono')) or c.marcas && public.fin_marcas('dono')
  order by c.ativo desc, c.papel = 'dono' desc, c.criado_em;
end $$;

-- Os administradores que podem receber acesso (uma linha por pessoa, com as plataformas de cada um).
create or replace function public.fin_candidatos()
returns table (email text, nome text, marcas text[])
language plpgsql stable security definer set search_path to 'public' as $$
#variable_conflict use_column
begin
  if cardinality(public.fin_marcas('dono')) = 0 then raise exception 'Só quem é dono do financeiro dá acesso.'; end if;
  return query
  select lower(public.teeds_email_real(u.email)) as e,
         max(cl.nome) filter (where coalesce(cl.nome, '') <> ''),
         array_agg(distinct a.marca order by a.marca)
  from public.administradores a
  join auth.users u on u.id = a.user_id
  left join public.clientes cl on cl.user_id = a.user_id
  where '*' = any (public.fin_marcas('dono')) or a.marca = any (public.fin_marcas('dono'))
  group by 1
  order by 2 nulls last;
end $$;

-- Dar acesso, mudar papel/plataformas ou gerar uma senha provisória nova (p_senha null = mantém a senha).
create or replace function public.fin_dar_acesso(p_email text, p_papel text, p_marcas text[], p_senha text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_eu text := public.fin_meu_email();
  v_minhas text[] := public.fin_marcas('dono');
  v_email text := lower(btrim(p_email));
  v_marcas text[];
begin
  if cardinality(v_minhas) = 0 then raise exception 'Só quem é dono do financeiro dá acesso.'; end if;
  if v_email = v_eu then raise exception 'Você não pode mudar o seu próprio acesso.'; end if;
  if p_papel not in ('dono', 'editor', 'leitor') then raise exception 'Papel inválido.'; end if;
  if not exists (select 1 from public.administradores a join auth.users u on u.id = a.user_id where lower(public.teeds_email_real(u.email)) = v_email) then
    raise exception 'Essa pessoa não é administradora da plataforma.';
  end if;
  /* Dono de uma plataforma só mexe na parte dele: o que a pessoa tem em outras plataformas fica como está.
     novas = (antigas − minhas) ∪ (pedidas ∩ minhas). */
  v_marcas := array(
    select distinct m from (
      select m from unnest(coalesce((select marcas from public.fin_credenciais where email = v_email), '{}')) m
       where not ('*' = any (v_minhas)) and not (m = any (v_minhas))
      union
      select m from unnest(coalesce(p_marcas, '{}')) m where m <> '*' and ('*' = any (v_minhas) or m = any (v_minhas))
    ) x);
  if not exists (select 1 from unnest(coalesce(p_marcas, '{}')) m where m <> '*' and ('*' = any (v_minhas) or m = any (v_minhas))) then
    raise exception 'Escolha pelo menos uma plataforma.';
  end if;
  -- papel e senha valem para todas as plataformas da pessoa: quem não é dono de todas elas não muda
  if not ('*' = any (v_minhas)) and exists (
    select 1 from public.fin_credenciais c, unnest(c.marcas) m where c.email = v_email and not (m = any (v_minhas))) then
    raise exception 'Essa pessoa também tem acesso a outra plataforma. Só o administrador geral muda esse acesso.';
  end if;
  if exists (select 1 from public.fin_credenciais where email = v_email and '*' = any (marcas)) then
    raise exception 'O acesso do administrador geral não pode ser mudado por aqui.';
  end if;
  if p_senha is not null and not public.fin_senha_valida(p_senha) then raise exception 'A senha provisória precisa de 8 caracteres ou mais, com letras e números.'; end if;
  if exists (select 1 from public.fin_credenciais where email = v_email) then
    update public.fin_credenciais set papel = p_papel, marcas = v_marcas, ativo = true, atualizado_em = now(),
      senha_hash = case when p_senha is null then senha_hash else extensions.crypt(p_senha, extensions.gen_salt('bf', 10)) end,
      trocar_senha = case when p_senha is null then trocar_senha else true end,
      falhas = case when p_senha is null then falhas else 0 end,
      bloqueado_ate = case when p_senha is null then bloqueado_ate end
    where email = v_email;
    if p_senha is not null then update public.fin_sessoes set encerrada_em = now() where email = v_email and encerrada_em is null; end if;
  else
    if p_senha is null then raise exception 'Defina uma senha provisória.'; end if;
    insert into public.fin_credenciais (email, papel, marcas, senha_hash, trocar_senha, criado_por)
    values (v_email, p_papel, v_marcas, extensions.crypt(p_senha, extensions.gen_salt('bf', 10)), true, v_eu);
  end if;
  return json_build_object('ok', true);
end $$;

create or replace function public.fin_tirar_acesso(p_email text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_email text := lower(btrim(p_email));
begin
  if cardinality(public.fin_marcas('dono')) = 0 then raise exception 'Só quem é dono do financeiro tira acesso.'; end if;
  if v_email = public.fin_meu_email() then raise exception 'Você não pode tirar o seu próprio acesso.'; end if;
  if exists (select 1 from public.fin_credenciais where email = v_email and '*' = any (marcas)) then
    raise exception 'O acesso do administrador geral não pode ser tirado.';
  end if;
  if not ('*' = any (public.fin_marcas('dono'))) and exists (
    select 1 from public.fin_credenciais c, unnest(c.marcas) m where c.email = v_email and not (m = any (public.fin_marcas('dono')))) then
    raise exception 'Essa pessoa também tem acesso a outra plataforma. Só o administrador geral tira esse acesso.';
  end if;
  update public.fin_credenciais set ativo = false, atualizado_em = now() where email = v_email;
  update public.fin_sessoes set encerrada_em = now() where email = v_email and encerrada_em is null;
  return json_build_object('ok', true);
end $$;

-- Nomes de quem lançou e mexeu (para o histórico e o "criado por").
create or replace function public.fin_pessoas(p_ids uuid[])
returns table (user_id uuid, nome text, email text)
language plpgsql stable security definer set search_path to 'public' as $$
#variable_conflict use_column
begin
  if cardinality(public.fin_marcas('leitor')) = 0 then return; end if;
  return query
  select u.id,
         coalesce((select cl.nome from public.clientes cl where cl.user_id = u.id and coalesce(cl.nome, '') <> '' limit 1), split_part(public.teeds_email_real(u.email), '@', 1)),
         lower(public.teeds_email_real(u.email))
  from auth.users u where u.id = any (p_ids);
end $$;

-- Primeira vez numa plataforma: categorias e contas de partida (só se ainda não tem nenhuma).
create or replace function public.fin_preparar(p_marca text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not (array[p_marca, '*'] && public.fin_marcas('editor')) then return; end if;
  if not exists (select 1 from public.fin_categorias where marca = p_marca) then
    insert into public.fin_categorias (marca, tipo, nome, cor, ordem) values
      (p_marca, 'saida', 'Anúncios', '#2F6FDB', 1),
      (p_marca, 'saida', 'Ferramentas e assinaturas', '#7C5CC4', 2),
      (p_marca, 'saida', 'Servidores e tecnologia', '#0E8C9B', 3),
      (p_marca, 'saida', 'Equipe e prestadores', '#C2410C', 4),
      (p_marca, 'saida', 'Comissões de parceiros', '#B78D39', 5),
      (p_marca, 'saida', 'Impostos e taxas', '#DC1F2E', 6),
      (p_marca, 'saida', 'Contabilidade e jurídico', '#64748B', 7),
      (p_marca, 'saida', 'Produção de conteúdo', '#DB2777', 8),
      (p_marca, 'saida', 'Outras despesas', '#94A3B8', 9),
      (p_marca, 'entrada', 'Markup da Deriv', '#0B9E4A', 1),
      (p_marca, 'entrada', 'Vendas de planos', '#B78D39', 2),
      (p_marca, 'entrada', 'Comissão de afiliado', '#2F8F72', 3),
      (p_marca, 'entrada', 'Outras receitas', '#64748B', 4);
  end if;
  if not exists (select 1 from public.fin_contas where marca = p_marca) then
    insert into public.fin_contas (marca, nome, tipo, cor, ordem) values
      (p_marca, 'Conta principal', 'banco', '#1E3D6E', 1),
      (p_marca, 'Caixa', 'caixa', '#2F8F72', 2);
  end if;
end $$;

revoke all on function public.fin_meu_acesso(text), public.fin_sessao(), public.fin_criar_minha_senha(text), public.fin_entrar(text), public.fin_sair(),
  public.fin_trocar_senha(text, text), public.fin_acessos(), public.fin_candidatos(), public.fin_dar_acesso(text, text, text[], text),
  public.fin_tirar_acesso(text), public.fin_pessoas(uuid[]), public.fin_preparar(text) from anon, public;
grant execute on function public.fin_meu_acesso(text), public.fin_sessao(), public.fin_criar_minha_senha(text), public.fin_entrar(text), public.fin_sair(),
  public.fin_trocar_senha(text, text), public.fin_acessos(), public.fin_candidatos(), public.fin_dar_acesso(text, text, text[], text),
  public.fin_tirar_acesso(text), public.fin_pessoas(uuid[]), public.fin_preparar(text) to authenticated;

-- ── Comprovantes ──────────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('financeiro', 'financeiro', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists fin_comprovantes_ler on storage.objects;
create policy fin_comprovantes_ler on storage.objects for select to authenticated
  using (bucket_id = 'financeiro' and public.fin_usuario_liberado((storage.foldername(name))[1], 'leitor'));
drop policy if exists fin_comprovantes_enviar on storage.objects;
create policy fin_comprovantes_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'financeiro' and public.fin_usuario_liberado((storage.foldername(name))[1], 'editor'));
drop policy if exists fin_comprovantes_apagar on storage.objects;
create policy fin_comprovantes_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'financeiro' and public.fin_usuario_liberado((storage.foldername(name))[1], 'editor'));
