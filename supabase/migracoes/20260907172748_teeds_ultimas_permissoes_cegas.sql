-- As últimas permissões que ainda enxergavam as duas plataformas.
--
-- Cada uma era uma regra antiga que continuou valendo ao lado da nova. Em
-- Postgres, permissões se somam: basta UMA regra permitir para o dado
-- aparecer. Ou seja, a regra nova por marca não adiantava nada enquanto a
-- velha, cega, continuasse na tabela.

-- Catálogos: um plano ou produto ativo aparece só nas plataformas dele.
drop policy if exists "autenticados veem planos" on public.planos;
create policy "autenticados veem planos da sua marca" on public.planos
  for select to authenticated
  using (ativo and exists (select 1 from unnest(marcas) m where m is not null));

drop policy if exists "autenticados veem produtos" on public.produtos;
create policy "autenticados veem produtos da sua marca" on public.produtos
  for select to authenticated
  using (ativo and exists (select 1 from unnest(marcas) m where m is not null));

-- Liberações de produto: some a regra cega, fica só a por marca.
drop policy if exists "cliente ve os proprios produtos" on public.cliente_produtos;
drop policy if exists "admin gerencia produtos dos clientes" on public.cliente_produtos;

-- Markup oficial: some a leitura cega, fica a por marca.
drop policy if exists "admin le o markup oficial" on public.markup_oficial_diario;

-- Auditoria: cada administrador vê o que aconteceu na plataforma dele.
drop policy if exists "admin ve auditoria" on public.auditoria_admin;
create policy "admin desta marca ve auditoria" on public.auditoria_admin
  for select to authenticated
  using (public.teeds_sou_admin_da(marca));
