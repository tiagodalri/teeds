-- Uma conta da corretora, um dono — POR PLATAFORMA.
--
-- A regra era "uma conta Deriv, um dono", com unicidade em conta_id sozinho.
-- Com duas plataformas isso passou a impedir o que deveria ser normal: a
-- mesma pessoa usar a própria conta da Deriv tanto na Teeds quanto na OMNI.
-- O login das duas é o mesmo Supabase, mas as fichas são separadas — e a
-- conta ficava presa na plataforma onde foi conectada primeiro.
--
-- A regra que importa continua de pé: dentro de UMA plataforma, uma conta
-- da corretora não pode ser reivindicada por dois logins diferentes. É o que
-- impede alguém apontar a conta de outra pessoa para si.

alter table public.contas_deriv drop constraint if exists contas_deriv_conta_id_key;
alter table public.contas_deriv drop constraint if exists contas_deriv_pkey;

alter table public.contas_deriv add primary key (user_id, conta_id, marca);
alter table public.contas_deriv add constraint contas_deriv_conta_por_marca unique (conta_id, marca);

comment on constraint contas_deriv_conta_por_marca on public.contas_deriv is
  'Dentro de uma plataforma, uma conta da corretora tem um dono só. Entre plataformas, a mesma pessoa pode usar a mesma conta.';
