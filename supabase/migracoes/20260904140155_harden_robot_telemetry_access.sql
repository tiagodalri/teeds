drop policy if exists "cliente grava suas operacoes de robo" on public.operacoes_robos;
create policy "cliente grava suas operacoes de robo" on public.operacoes_robos
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "cliente atualiza suas operacoes de robo" on public.operacoes_robos;
create policy "cliente atualiza suas operacoes de robo" on public.operacoes_robos
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "cliente ve suas operacoes de robo" on public.operacoes_robos;
create policy "cliente ve suas operacoes de robo" on public.operacoes_robos
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.teeds_sou_admin()));

revoke all on function public.teeds_metricas_robos(integer) from public;
revoke all on function public.teeds_metricas_robos(integer) from anon;
grant execute on function public.teeds_metricas_robos(integer) to authenticated;
