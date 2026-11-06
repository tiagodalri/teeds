-- Cursos na área de membros (06/11/2026).
--
-- Pedido do Tiago: vários cursos na plataforma, cada um com módulos e aulas, e
-- cada curso com a sua regra de acesso: todos os alunos, só alguns planos, ou
-- vendido à parte na Cakto, liberado sozinho quando a pessoa compra.
--
-- Os cursos moram no mesmo documento da grade (aulas_grade): `cursos` e o
-- `curso` de cada módulo. O que precisa de banco é a VENDA:
--  - cada curso vendido vira um produto `curso-<id>` (tabela produtos), e a
--    liberação de cada aluno é uma linha em cliente_produtos, como os robôs;
--  - os IDs dos produtos da Cakto ligados ao curso vão para cakto_produtos.
--    O servidor já consulta essa tabela (teeds_cakto_produto), então um curso
--    novo à venda NÃO pede atualização nem reinício do servidor;
--  - tudo isso é sincronizado na hora de publicar a grade.
-- E duas coisas novas valem para tudo o que a Cakto vende:
--  - produto com acesso vitalício (cakto_produtos.vitalicio): sem data de fim;
--  - quem pagou antes de ter cadastro é liberado no momento em que se cadastra.

alter table public.cakto_produtos add column if not exists vitalicio boolean not null default false;

-- ------------------------------------------------- a compra: vitalício
create or replace function public.teeds_cakto_aplicar(p_pedido text, p_evento text, p_marca text, p_email text, p_produto text default null, p_valor numeric default null)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare
  v_email   text := lower(trim(p_email));
  v_prod    text := lower(trim(coalesce(p_produto, '')));
  v_user    uuid;
  v_acao    text;
  v_libera  boolean;
  v_revoga  boolean;
  v_novo    integer;
  v_atual   timestamptz;
  v_expira  timestamptz;
  v_vitalicio boolean := exists (select 1 from public.cakto_produtos cp where cp.produto = v_prod and cp.vitalicio);
begin
  if coalesce(v_email, '') = '' or coalesce(p_pedido, '') = '' then
    return json_build_object('erro', 'pedido e e-mail são obrigatórios');
  end if;
  if v_prod not in ('gf-gulf', 'gf-phenom', 'gf-pack', 'gf-black', 'gf-prestige')
     and not exists (select 1 from public.cakto_produtos cp where cp.produto = v_prod) then
    return json_build_object('erro', 'produto desconhecido: ' || v_prod);
  end if;

  v_libera := p_evento in ('purchase_approved', 'subscription_created',
                           'subscription_renewed', 'subscription_resumed',
                           'subscription_late_recovered', 'paid', 'approved');
  v_revoga := p_evento in ('refund', 'chargeback', 'refunded', 'chargedback');
  v_acao := case when v_libera then 'liberou' when v_revoga then 'revogou' else 'ignorou' end;

  select c.user_id into v_user
  from public.clientes c
  where c.marca = p_marca and lower(c.email) = v_email
  limit 1;

  if v_libera and v_user is not null and not v_vitalicio then
    select max(cp.expira_em) into v_atual
    from public.cliente_produtos cp
    where cp.user_id = v_user and cp.marca = p_marca and cp.produto_id = v_prod and cp.ativo;
    v_expira := greatest(coalesce(v_atual, now()), now()) + interval '1 year' + interval '5 days';
    if v_atual is not null then v_acao := 'renovou'; end if;
  end if;

  insert into public.compras_cakto (pedido, evento, marca, email, produto, valor, user_id, acao, expira_em)
  values (p_pedido, p_evento, p_marca, v_email, v_prod, p_valor, v_user,
          case when v_user is null and v_libera then 'sem-cadastro' when v_user is null and v_revoga then 'sem-cadastro-revogou' else v_acao end, v_expira)
  on conflict (pedido, evento) do nothing;
  get diagnostics v_novo = row_count;
  if v_novo = 0 then
    return json_build_object('repetido', true, 'acao', 'nada', 'achou', v_user is not null);
  end if;

  if v_user is null then
    -- fica guardada: libera sozinha quando a pessoa se cadastrar (teeds_cakto_pendentes_no_cadastro)
    return json_build_object('repetido', false, 'achou', false, 'acao', 'sem-cadastro');
  end if;

  if v_libera then
    insert into public.cliente_produtos (user_id, produto_id, marca, ativo, origem, concedido_em, expira_em)
    values (v_user, v_prod, p_marca, true, 'cakto', now(), v_expira)
    on conflict (user_id, produto_id, marca)
      do update set ativo = true, expira_em = excluded.expira_em, concedido_em = now(), origem = 'cakto';
  elsif v_revoga then
    update public.cliente_produtos
       set ativo = false
     where user_id = v_user and marca = p_marca and produto_id = v_prod;
  end if;

  return json_build_object('repetido', false, 'achou', true, 'user_id', v_user,
                           'acao', v_acao, 'produto', v_prod, 'expira_em', v_expira);
end;
$function$;

-- ------------------------------- quem pagou antes de ter cadastro
create or replace function public.teeds_cakto_pendentes_no_cadastro()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare r record; v_expira timestamptz; v_vitalicio boolean;
begin
  if coalesce(new.email, '') = '' then return new; end if;
  for r in
    select * from public.compras_cakto
     where marca = new.marca and lower(email) = lower(new.email) and user_id is null
       and acao in ('sem-cadastro', 'sem-cadastro-revogou')
     order by recebido_em
  loop
    v_vitalicio := exists (select 1 from public.cakto_produtos cp where cp.produto = r.produto and cp.vitalicio);
    if r.acao = 'sem-cadastro' then
      v_expira := case when v_vitalicio then null else greatest(coalesce(r.recebido_em, now()), now() - interval '1 year') + interval '1 year' + interval '5 days' end;
      insert into public.cliente_produtos (user_id, produto_id, marca, ativo, origem, concedido_em, expira_em)
      values (new.user_id, r.produto, new.marca, true, 'cakto', now(), v_expira)
      on conflict (user_id, produto_id, marca) do update set ativo = true, expira_em = excluded.expira_em, concedido_em = now(), origem = 'cakto';
      update public.compras_cakto set user_id = new.user_id, acao = 'liberou-no-cadastro', expira_em = v_expira where pedido = r.pedido and evento = r.evento;
    else
      update public.cliente_produtos set ativo = false where user_id = new.user_id and marca = new.marca and produto_id = r.produto;
      update public.compras_cakto set user_id = new.user_id, acao = 'revogou-no-cadastro' where pedido = r.pedido and evento = r.evento;
    end if;
  end loop;
  return new;
exception when others then
  -- o cadastro nunca pode falhar por causa disto
  raise warning 'teeds_cakto_pendentes_no_cadastro: %', sqlerrm;
  return new;
end;
$function$;

drop trigger if exists teeds_cliente_compras_pendentes on public.clientes;
create trigger teeds_cliente_compras_pendentes after insert on public.clientes
  for each row execute function public.teeds_cakto_pendentes_no_cadastro();

-- ------------------------------------ publicar: os cursos à venda
-- Lê os cursos da grade e deixa produtos e cakto_produtos iguais a ela.
-- Nunca apaga um produto `curso-*` (apagar levaria junto as liberações dos alunos).
create or replace function public.teeds_cursos_sincronizar(p_marca text, p_grade jsonb)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare c jsonb; v_id text; v_prod text; v_ids text[] := '{}'; v_ckt text; v_dono text; v_vit boolean;
begin
  for c in select * from jsonb_array_elements(coalesce(p_grade -> 'cursos', '[]'::jsonb)) loop
    v_id := c ->> 'id';
    if coalesce(v_id, '') = '' or coalesce(c #>> '{acesso,modo}', 'todos') <> 'compra' then continue; end if;
    v_prod := 'curso-' || v_id;
    v_vit := coalesce((c #>> '{acesso,vitalicio}')::boolean, true);
    insert into public.produtos (id, nome, categoria, preco_centavos, ativo, marcas)
    values (v_prod, coalesce(nullif(btrim(c ->> 'titulo'), ''), 'Curso'), 'curso', null, true, array[p_marca])
    on conflict (id) do update set nome = excluded.nome, ativo = true, categoria = 'curso';
    for v_ckt in select btrim(x) from jsonb_array_elements_text(coalesce(c #> '{acesso,cakto}', '[]'::jsonb)) x where btrim(x) <> '' loop
      select produto into v_dono from public.cakto_produtos where cakto_id = v_ckt;
      if v_dono is not null and v_dono <> v_prod and v_dono not like 'curso-%' then
        raise exception 'O produto da Cakto % já libera "%". Use outro produto para este curso.', v_ckt, v_dono;
      end if;
      insert into public.cakto_produtos (cakto_id, marca, produto, nome, vitalicio)
      values (v_ckt, p_marca, v_prod, coalesce(nullif(btrim(c ->> 'titulo'), ''), 'Curso'), v_vit)
      on conflict (cakto_id) do update set marca = excluded.marca, produto = excluded.produto, nome = excluded.nome, vitalicio = excluded.vitalicio;
      v_ids := v_ids || v_ckt;
    end loop;
  end loop;
  delete from public.cakto_produtos where marca = p_marca and produto like 'curso-%' and not (cakto_id = any (v_ids));
end;
$function$;
revoke all on function public.teeds_cursos_sincronizar(text, jsonb) from public, anon, authenticated;

create or replace function public.teeds_aulas_publicar(p_marca text, p_grade jsonb, p_nota text default null)
returns timestamptz language plpgsql security definer set search_path to 'public' as $function$
declare v_agora timestamptz := now();
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só o administrador publica as aulas.'; end if;
  if p_grade is null or jsonb_typeof(p_grade -> 'modulos') <> 'array' then raise exception 'Grade inválida.'; end if;
  perform public.teeds_cursos_sincronizar(p_marca, p_grade);
  insert into public.aulas_grade (marca, rascunho, rascunho_em, rascunho_por, publicada, publicada_em, publicada_por)
  values (p_marca, p_grade, v_agora, auth.uid(), p_grade, v_agora, auth.uid())
  on conflict (marca) do update set rascunho = excluded.rascunho, rascunho_em = v_agora, rascunho_por = auth.uid(),
    publicada = excluded.publicada, publicada_em = v_agora, publicada_por = auth.uid();
  insert into public.aulas_grade_versoes (marca, grade, nota, criada_por) values (p_marca, p_grade, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid());
  return v_agora;
end $function$;

-- ----------------------------------------------- o aluno: os cursos dele
create or replace function public.teeds_meus_cursos(p_marca text)
returns text[] language sql stable security definer set search_path to 'public' as $function$
  select coalesce(array_agg(substring(cp.produto_id from 7)), '{}')
    from public.cliente_produtos cp
   where cp.user_id = (select auth.uid()) and cp.marca = p_marca and cp.ativo
     and cp.produto_id like 'curso-%' and (cp.expira_em is null or cp.expira_em > now());
$function$;
grant execute on function public.teeds_meus_cursos(text) to authenticated;

-- --------------------------------------------- o admin: alunos do curso
create or replace function public.teeds_curso_alunos(p_marca text, p_curso text)
returns json language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só o administrador vê os alunos do curso.'; end if;
  return coalesce((
    select json_agg(json_build_object('user_id', cp.user_id, 'nome', c.nome, 'email', c.email, 'origem', cp.origem,
             'concedido_em', cp.concedido_em, 'expira_em', cp.expira_em, 'ativo', cp.ativo and (cp.expira_em is null or cp.expira_em > now()))
             order by cp.concedido_em desc)
      from public.cliente_produtos cp
      left join public.clientes c on c.user_id = cp.user_id and c.marca = cp.marca
     where cp.marca = p_marca and cp.produto_id = 'curso-' || p_curso), '[]'::json);
end;
$function$;
grant execute on function public.teeds_curso_alunos(text, text) to authenticated;

-- Liberar ou tirar à mão, pelo e-mail do aluno. p_dias nulo = vitalício.
create or replace function public.teeds_curso_liberar(p_marca text, p_curso text, p_titulo text, p_email text, p_liberar boolean, p_dias integer default null)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare v_user uuid; v_nome text; v_prod text := 'curso-' || p_curso;
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só o administrador libera cursos.'; end if;
  select c.user_id, c.nome into v_user, v_nome from public.clientes c where c.marca = p_marca and lower(c.email) = lower(btrim(p_email)) limit 1;
  if v_user is null then return json_build_object('erro', 'Nenhum cadastro com este e-mail nesta plataforma.'); end if;
  insert into public.produtos (id, nome, categoria, preco_centavos, ativo, marcas)
  values (v_prod, coalesce(nullif(btrim(p_titulo), ''), 'Curso'), 'curso', null, true, array[p_marca])
  on conflict (id) do nothing;
  if p_liberar then
    insert into public.cliente_produtos (user_id, produto_id, marca, ativo, origem, concedido_em, expira_em)
    values (v_user, v_prod, p_marca, true, 'manual', now(), case when p_dias is null then null else now() + make_interval(days => p_dias) end)
    on conflict (user_id, produto_id, marca) do update set ativo = true, origem = 'manual', concedido_em = now(), expira_em = excluded.expira_em;
  else
    update public.cliente_produtos set ativo = false where user_id = v_user and marca = p_marca and produto_id = v_prod;
  end if;
  return json_build_object('ok', true, 'nome', v_nome);
end;
$function$;
grant execute on function public.teeds_curso_liberar(text, text, text, text, boolean, integer) to authenticated;
