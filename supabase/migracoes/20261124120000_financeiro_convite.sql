/*
  Financeiro: convite com senha criada no primeiro acesso (24/11/2026, Tiago: "libere a função do financeiro
  para o Victor Cordeiro e peça para ele criar a senha de acesso dele no primeiro acesso ao menu financeiro").

  Credencial com senha_hash nulo = convite. fin_meu_acesso devolve criar=true, a trava mostra "Crie a sua
  senha" e fin_criar_minha_senha grava a senha (só a da própria pessoa, só uma vez). fin_entrar e
  fin_trocar_senha recusam credencial sem senha (a comparação com nulo não pode virar "senha certa").
  fin_dar_acesso sem p_senha numa pessoa nova cria o convite. Nenhuma outra regra muda.
*/
alter table public.fin_credenciais alter column senha_hash drop not null;

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
    -- convite: o dono liberou e a pessoa cria a própria senha no primeiro acesso
    'criar', c.email is not null and c.ativo and c.senha_hash is null,
    -- a credencial vale para a plataforma aberta? (quem é só da GF e abre a OMNI vê o aviso, não a senha)
    'nesta', p_marca is null or (c.email is not null and (('*' = any (c.marcas) and public.teeds_sou_admin_geral()) or (p_marca = any (c.marcas) and public.teeds_sou_equipe_da(p_marca)))),
    'bloqueado_ate', case when c.bloqueado_ate > now() then c.bloqueado_ate end);
end $$;

-- Criar a senha: o admin geral no primeiro acesso do financeiro (dono, todas as plataformas) OU quem recebeu
-- convite do dono (credencial ativa e ainda sem senha).
create or replace function public.fin_criar_minha_senha(p_senha text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_email text := public.fin_meu_email(); c public.fin_credenciais;
begin
  if current_setting('transaction_read_only', true) = 'on' then raise exception 'Use POST.'; end if;
  if v_email is null or not exists (select 1 from public.administradores a where a.user_id = (select auth.uid())) then
    raise exception 'Você não tem acesso ao financeiro.';
  end if;
  select * into c from public.fin_credenciais where email = v_email for update;
  if c.email is not null then
    if not c.ativo then raise exception 'Você não tem acesso ao financeiro.'; end if;
    if c.senha_hash is not null then raise exception 'Você já tem uma senha do financeiro.'; end if;
    if not public.fin_senha_valida(p_senha) then raise exception 'A senha precisa de 8 caracteres ou mais, com letras e números.'; end if;
    update public.fin_credenciais
       set senha_hash = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)), trocar_senha = false, falhas = 0, bloqueado_ate = null, atualizado_em = now()
     where email = v_email;
    return json_build_object('ok', true);
  end if;
  if not public.teeds_sou_admin_geral() then raise exception 'Peça ao responsável pelo financeiro para liberar o seu acesso.'; end if;
  -- só a primeira: depois disso, quem entra é pelo dono (Acessos)
  if exists (select 1 from public.fin_credenciais where '*' = any (marcas)) then raise exception 'O financeiro já tem um responsável. Peça a ele o seu acesso.'; end if;
  if not public.fin_senha_valida(p_senha) then raise exception 'A senha precisa de 8 caracteres ou mais, com letras e números.'; end if;
  insert into public.fin_credenciais (email, papel, marcas, senha_hash, trocar_senha, criado_por)
  values (v_email, 'dono', array['*'], extensions.crypt(p_senha, extensions.gen_salt('bf', 10)), false, v_email);
  return json_build_object('ok', true);
end $$;

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
  -- convite: ainda sem senha. Sem isto, a comparação com nulo daria "senha certa" para qualquer coisa.
  if c.senha_hash is null then return json_build_object('erro', 'criar'); end if;
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

create or replace function public.fin_trocar_senha(p_atual text, p_nova text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_email text := public.fin_meu_email(); c public.fin_credenciais;
begin
  if current_setting('transaction_read_only', true) = 'on' then raise exception 'Use POST.'; end if;
  -- a senha nova é conferida ANTES da atual: a resposta não pode servir de "sim/não" para a senha atual
  if not public.fin_senha_valida(p_nova) then return json_build_object('erro', 'fraca'); end if;
  if p_nova = p_atual then return json_build_object('erro', 'igual'); end if;
  select * into c from public.fin_credenciais where email = v_email for update;
  if c.email is null or not c.ativo or c.senha_hash is null then return json_build_object('erro', 'sem-acesso'); end if;
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
    -- sem senha = convite: a pessoa cria a dela no primeiro acesso ao financeiro
    insert into public.fin_credenciais (email, papel, marcas, senha_hash, trocar_senha, criado_por)
    values (v_email, p_papel, v_marcas, case when p_senha is null then null else extensions.crypt(p_senha, extensions.gen_salt('bf', 10)) end, true, v_eu);
  end if;
  return json_build_object('ok', true);
end $$;
