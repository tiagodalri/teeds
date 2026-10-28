-- Regras de acesso: auth.uid()/auth.jwt() calculados uma vez por consulta, e
-- não por linha (aviso auth_rls_initplan do Supabase, 28/10/2026). Mesmas
-- regras; só a forma de escrever. Pesam nas gravações que cada cliente faz a
-- cada minuto (presença em clientes, contas_deriv, comissoes_diarias).
alter policy "proprio cria" on public.clientes with check (user_id = (select auth.uid()));
alter policy "proprio edita" on public.clientes using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "proprio cria" on public.contas_deriv with check (user_id = (select auth.uid()));
alter policy "proprio edita" on public.contas_deriv using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "proprio cria" on public.comissoes_diarias with check (user_id = (select auth.uid()));
alter policy "proprio edita" on public.comissoes_diarias using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "ver a si" on public.administradores using (user_id = (select auth.uid()));
alter policy "cada um ve o proprio progresso" on public.aulas_progresso using (user_id = (select auth.uid()));
alter policy "cada um ve os planos da sua marca" on public.planos_da_marca
  using (teeds_sou_equipe_da(marca) or marca = teeds_marca_da_conta((select auth.jwt() ->> 'email')));
