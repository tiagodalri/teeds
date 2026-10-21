-- 21/10/2026 (revisão): as regras com que cada cliente cria e edita a própria
-- ficha já existiam no banco, mas não estavam em nenhuma migração. Um banco
-- recriado do zero quebraria perfil, foto e tour sem dar erro. Idempotente.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'clientes' and policyname = 'proprio cria') then
    create policy "proprio cria" on public.clientes for insert with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'clientes' and policyname = 'proprio edita') then
    create policy "proprio edita" on public.clientes for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
