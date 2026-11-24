/*
  Financeiro: acesso só a alguns projetos (24/11/2026, Tiago: "pode liberar para o Naor também, mas o Naor só vai
  ver as coisas relacionadas ao projeto dele. Não vai ver nada relacionado ao projeto do Victor, coisas
  particulares de sócio (eu e Victor)... vai ver somente o dele").

  fin_credenciais.projetos: null = todos os projetos (como sempre foi); com ids = SÓ esses projetos, e só como
  leitor (a credencial limitada nunca lança, edita nem dá acesso).

  O que a credencial limitada lê (as políticas fazem o corte no banco, não na tela):
    - lançamentos, projetos, divisão (fin_partes) e Revenue Share: só dos projetos dela;
    - contas (saldos do caixa), histórico de mudanças: nada;
    - comprovantes: só os dos lançamentos dos projetos dela;
    - sócios e categorias: os nomes, para a tela mostrar quem leva quanto e a categoria de cada lançamento.
  Lançamento sem projeto (custo geral, aportes, retiradas, movimentos de sócio) não tem projeto: some.
*/

alter table public.fin_credenciais add column if not exists projetos uuid[];
alter table public.fin_credenciais drop constraint if exists fin_credenciais_projetos_so_leitor;
alter table public.fin_credenciais add constraint fin_credenciais_projetos_so_leitor check (projetos is null or papel = 'leitor');

-- Os projetos que a credencial de quem pede enxerga (null = todos). Pela pessoa, não pelo token: o Storage não
-- repassa o cabeçalho do token, e a credencial é uma por pessoa.
create or replace function public.fin_projetos_limite()
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  select c.projetos from public.fin_credenciais c where c.email = public.fin_meu_email();
$$;
revoke all on function public.fin_projetos_limite() from public, anon;
grant execute on function public.fin_projetos_limite() to authenticated;

-- ── Leitura ───────────────────────────────────────────────────────────────────────────────────────
drop policy if exists fin_ler on public.fin_lancamentos;
create policy fin_ler on public.fin_lancamentos for select to authenticated using (
  array[marca, '*'] && (select public.fin_marcas('leitor'))
  and ((select public.fin_projetos_limite()) is null or projeto_id = any ((select public.fin_projetos_limite())::uuid[])));

drop policy if exists fin_ler on public.fin_projetos;
create policy fin_ler on public.fin_projetos for select to authenticated using (
  array[marca, '*'] && (select public.fin_marcas('leitor'))
  and ((select public.fin_projetos_limite()) is null or id = any ((select public.fin_projetos_limite())::uuid[])));

drop policy if exists fin_ler on public.fin_partes;
create policy fin_ler on public.fin_partes for select to authenticated using (
  array[marca, '*'] && (select public.fin_marcas('leitor'))
  and ((select public.fin_projetos_limite()) is null or projeto_id = any ((select public.fin_projetos_limite())::uuid[])));

drop policy if exists fin_ler on public.fin_revshare;
create policy fin_ler on public.fin_revshare for select to authenticated using (
  array[marca, '*'] && (select public.fin_marcas('leitor'))
  and ((select public.fin_projetos_limite()) is null or projeto_id = any ((select public.fin_projetos_limite())::uuid[])));

drop policy if exists fin_ler on public.fin_contas;
create policy fin_ler on public.fin_contas for select to authenticated using (
  array[marca, '*'] && (select public.fin_marcas('leitor')) and (select public.fin_projetos_limite()) is null);

drop policy if exists fin_ler on public.fin_historico;
create policy fin_ler on public.fin_historico for select to authenticated using (
  array[marca, '*'] && (select public.fin_marcas('leitor')) and (select public.fin_projetos_limite()) is null);

-- ── Escrita: credencial limitada não escreve nada (além de já ser leitor) ──────────────────────────
drop policy if exists fin_escrever on public.fin_categorias;
create policy fin_escrever on public.fin_categorias for all to authenticated
  using (array[marca, '*'] && (select public.fin_marcas('editor')) and (select public.fin_projetos_limite()) is null)
  with check (array[marca, '*'] && (select public.fin_marcas('editor')) and (select public.fin_projetos_limite()) is null);
drop policy if exists fin_escrever on public.fin_contas;
create policy fin_escrever on public.fin_contas for all to authenticated
  using (array[marca, '*'] && (select public.fin_marcas('editor')) and (select public.fin_projetos_limite()) is null)
  with check (array[marca, '*'] && (select public.fin_marcas('editor')) and (select public.fin_projetos_limite()) is null);
drop policy if exists fin_escrever on public.fin_socios;
create policy fin_escrever on public.fin_socios for all to authenticated
  using (array[marca, '*'] && (select public.fin_marcas('dono')) and (select public.fin_projetos_limite()) is null)
  with check (array[marca, '*'] && (select public.fin_marcas('dono')) and (select public.fin_projetos_limite()) is null);
drop policy if exists fin_escrever on public.fin_lancamentos;
create policy fin_escrever on public.fin_lancamentos for all to authenticated
  using (array[marca, '*'] && (select public.fin_marcas('editor')) and (select public.fin_projetos_limite()) is null)
  with check (array[marca, '*'] && (select public.fin_marcas('editor')) and (select public.fin_projetos_limite()) is null);
drop policy if exists fin_escrever on public.fin_projetos;
create policy fin_escrever on public.fin_projetos for all to authenticated
  using (array[marca, '*'] && (select public.fin_marcas('editor')) and (select public.fin_projetos_limite()) is null)
  with check (array[marca, '*'] && (select public.fin_marcas('editor')) and (select public.fin_projetos_limite()) is null);
drop policy if exists fin_escrever on public.fin_revshare;
create policy fin_escrever on public.fin_revshare for all to authenticated
  using (array[marca, '*'] && (select public.fin_marcas('editor')) and (select public.fin_projetos_limite()) is null)
  with check (array[marca, '*'] && (select public.fin_marcas('editor')) and (select public.fin_projetos_limite()) is null
    and exists (select 1 from public.fin_projetos p where p.id = fin_revshare.projeto_id and p.marca = fin_revshare.marca));

-- ── Comprovantes: <marca>/<lançamento>/<arquivo> ────────────────────────────────────────────────────
create or replace function public.fin_anexo_visivel(p_lancamento text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.fin_projetos_limite() is null
      or exists (select 1 from public.fin_lancamentos l
                  where l.id::text = p_lancamento and l.projeto_id = any (public.fin_projetos_limite()));
$$;
revoke all on function public.fin_anexo_visivel(text) from public, anon;
grant execute on function public.fin_anexo_visivel(text) to authenticated;

drop policy if exists fin_comprovantes_ler on storage.objects;
create policy fin_comprovantes_ler on storage.objects for select to authenticated
  using (bucket_id = 'financeiro' and public.fin_usuario_liberado((storage.foldername(name))[1], 'leitor')
         and public.fin_anexo_visivel((storage.foldername(name))[2]));

-- ── Sincronizar receitas: continua para todos; a credencial limitada não vê as contagens ───────────
create or replace function public.fin_sincronizar_receitas(p_marca text, p_cotacao numeric default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare r json;
begin
  if not (array[p_marca, '*'] && public.fin_marcas('leitor')) then raise exception 'O financeiro foi bloqueado.' using errcode = '42501'; end if;
  r := public.fin_sincronizar_receitas_agora(p_marca, p_cotacao);
  if public.fin_projetos_limite() is not null then return '{}'::json; end if;
  return r;
end $$;

-- ── O que a tela sabe da própria credencial ─────────────────────────────────────────────────────────
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
    -- só alguns projetos (null = todos)
    'projetos', to_json(c.projetos),
    -- a credencial vale para a plataforma aberta? (quem é só da GF e abre a OMNI vê o aviso, não a senha)
    'nesta', p_marca is null or (c.email is not null and (('*' = any (c.marcas) and public.teeds_sou_admin_geral()) or (p_marca = any (c.marcas) and public.teeds_sou_equipe_da(p_marca)))),
    'bloqueado_ate', case when c.bloqueado_ate > now() then c.bloqueado_ate end);
end $$;

-- ── Acessos (só o dono): a lista mostra os projetos; uma função muda só isso ────────────────────────
drop function if exists public.fin_acessos();
create function public.fin_acessos()
returns table (email text, nome text, papel text, marcas text[], ativo boolean, trocar_senha boolean, bloqueado boolean, ultimo_acesso timestamptz, criado_em timestamptz, eu boolean, projetos uuid[])
language plpgsql stable security definer set search_path to 'public' as $$
#variable_conflict use_column
begin
  if cardinality(public.fin_marcas('dono')) = 0 then raise exception 'Só quem é dono do financeiro vê os acessos.'; end if;
  return query
  select c.email,
         (select cl.nome from public.clientes cl join auth.users u on u.id = cl.user_id
           where lower(public.teeds_email_real(u.email)) = c.email and coalesce(cl.nome, '') <> '' limit 1),
         c.papel, c.marcas, c.ativo, c.trocar_senha, coalesce(c.bloqueado_ate > now(), false), c.ultimo_acesso, c.criado_em,
         c.email = public.fin_meu_email(), c.projetos
  from public.fin_credenciais c
  where '*' = any (public.fin_marcas('dono')) or c.marcas && public.fin_marcas('dono')
  order by c.ativo desc, c.papel = 'dono' desc, c.criado_em;
end $$;
revoke all on function public.fin_acessos() from public, anon;
grant execute on function public.fin_acessos() to authenticated;

-- p_projetos null = volta a ver todos; com ids = só esses (a pessoa precisa ser leitor).
create or replace function public.fin_limitar_projetos(p_email text, p_projetos uuid[])
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_email text := lower(btrim(p_email)); v_minhas text[] := public.fin_marcas('dono'); c public.fin_credenciais;
begin
  if current_setting('transaction_read_only', true) = 'on' then raise exception 'Use POST.'; end if;
  if cardinality(v_minhas) = 0 then raise exception 'Só quem é dono do financeiro muda os acessos.'; end if;
  if v_email = public.fin_meu_email() then raise exception 'Você não pode mudar o seu próprio acesso.'; end if;
  select * into c from public.fin_credenciais where email = v_email for update;
  if c.email is null then raise exception 'Essa pessoa ainda não tem acesso ao financeiro.'; end if;
  if '*' = any (c.marcas) then raise exception 'O acesso do administrador geral não pode ser mudado por aqui.'; end if;
  if not ('*' = any (v_minhas)) and exists (select 1 from unnest(c.marcas) m where not (m = any (v_minhas))) then
    raise exception 'Essa pessoa também tem acesso a outra plataforma. Só o administrador geral muda esse acesso.';
  end if;
  if p_projetos is not null then
    if cardinality(p_projetos) = 0 then raise exception 'Escolha pelo menos um projeto.'; end if;
    if c.papel <> 'leitor' then raise exception 'Quem vê só alguns projetos entra como leitor.'; end if;
    if exists (select 1 from unnest(p_projetos) x where not exists (
      select 1 from public.fin_projetos p where p.id = x and p.marca = any (c.marcas))) then
      raise exception 'Projeto que não é das plataformas dessa pessoa.';
    end if;
  end if;
  update public.fin_credenciais set projetos = p_projetos, atualizado_em = now() where email = v_email;
  -- mudou o que a pessoa vê: as sessões abertas dela fecham (abre de novo já com o novo recorte)
  update public.fin_sessoes set encerrada_em = now() where email = v_email and encerrada_em is null;
  return json_build_object('ok', true);
end $$;
revoke all on function public.fin_limitar_projetos(text, uuid[]) from public, anon;
grant execute on function public.fin_limitar_projetos(text, uuid[]) to authenticated;
