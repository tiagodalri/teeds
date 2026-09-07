-- O banco passa a separar as plataformas por conta própria.
--
-- Até agora a separação vivia nas consultas do app: cada uma pedia "só desta
-- marca". Funciona enquanto ninguém esquece — e hoje eu esqueci duas vezes,
-- em lugares diferentes, e a Administração da OMNI mostrou números da Teeds.
--
-- Uma regra que depende de todo mundo lembrar não é regra. As permissões do
-- banco passam a conhecer marca: um administrador da Teeds não alcança linha
-- da OMNI nem escrevendo a consulta à mão. Se eu esquecer um filtro de novo,
-- vem vazio — não vem errado.

-- Sou administrador DESTA plataforma?
create or replace function public.teeds_sou_admin_da(p_marca text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.administradores a
    where a.user_id = (select auth.uid()) and a.marca = p_marca
  );
$$;
grant execute on function public.teeds_sou_admin_da(text) to authenticated;

-- ---- clientes ----
drop policy if exists "admin gerencia clientes" on public.clientes;
create policy "admin gerencia clientes desta marca" on public.clientes
  for all to authenticated
  using (public.teeds_sou_admin_da(marca)) with check (public.teeds_sou_admin_da(marca));
drop policy if exists "proprio ou admin le" on public.clientes;
create policy "proprio ou admin desta marca le" on public.clientes
  for select to authenticated
  using (user_id = (select auth.uid()) or public.teeds_sou_admin_da(marca));

-- ---- contas da corretora ----
drop policy if exists "proprio ou admin le" on public.contas_deriv;
create policy "proprio ou admin desta marca le" on public.contas_deriv
  for select to authenticated
  using (user_id = (select auth.uid()) or public.teeds_sou_admin_da(marca));

-- ---- comissao ----
drop policy if exists "proprio ou admin le" on public.comissoes_diarias;
create policy "proprio ou admin desta marca le" on public.comissoes_diarias
  for select to authenticated
  using (user_id = (select auth.uid()) or public.teeds_sou_admin_da(marca));

-- ---- operacoes ----
drop policy if exists "cliente ve suas operacoes de robo" on public.operacoes_robos;
create policy "cliente ve suas operacoes de robo" on public.operacoes_robos
  for select to authenticated
  using (user_id = (select auth.uid()) or public.teeds_sou_admin_da(marca));

-- ---- sessoes ----
drop policy if exists "cliente ve suas sessoes de robo" on public.sessoes_robos;
create policy "cliente ve suas sessoes de robo" on public.sessoes_robos
  for select to authenticated
  using (user_id = (select auth.uid()) or public.teeds_sou_admin_da(marca));

-- ---- produtos liberados, uso e limites do chat ----
drop policy if exists "cliente ve seu uso de chat" on public.chat_uso;
create policy "cliente ve seu uso de chat" on public.chat_uso
  for select to authenticated
  using (user_id = (select auth.uid()) or public.teeds_sou_admin_da(marca));

drop policy if exists "cliente ve seus limites de chat" on public.chat_limites;
create policy "cliente ve seus limites de chat" on public.chat_limites
  for select to authenticated
  using (user_id = (select auth.uid()) or public.teeds_sou_admin_da(marca));

-- ---- administradores: cada um enxerga os pares da propria plataforma ----
drop policy if exists "admin ve administradores" on public.administradores;
create policy "admin ve administradores desta marca" on public.administradores
  for select to authenticated
  using (user_id = (select auth.uid()) or public.teeds_sou_admin_da(marca));

-- ---- catalogos: aparecem para quem administra alguma das marcas do item ----
drop policy if exists "admin gerencia produtos" on public.produtos;
drop policy if exists "admin gerencia planos" on public.planos;
create policy "admin gerencia produtos da sua marca" on public.produtos
  for all to authenticated
  using (exists (select 1 from unnest(marcas) m where public.teeds_sou_admin_da(m)))
  with check (exists (select 1 from unnest(marcas) m where public.teeds_sou_admin_da(m)));
create policy "admin gerencia planos da sua marca" on public.planos
  for all to authenticated
  using (exists (select 1 from unnest(marcas) m where public.teeds_sou_admin_da(m)))
  with check (exists (select 1 from unnest(marcas) m where public.teeds_sou_admin_da(m)));
