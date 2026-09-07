-- As chaves que ainda misturavam as plataformas.
--
-- Encontradas varrendo TODA consulta do app contra as tabelas que têm marca.
-- Cada uma destas faria a gravação de uma plataforma sobrescrever a da
-- outra, em silêncio — que é o pior jeito de perder dado.

-- Comissão do dia: a mesma pessoa, na mesma conta da Deriv, no mesmo dia,
-- pode ter operado nas duas plataformas. Sem a marca na chave, a segunda
-- gravação apagava a primeira.
alter table public.comissoes_diarias drop constraint if exists comissoes_diarias_pkey;
alter table public.comissoes_diarias drop constraint if exists comissoes_diarias_conta_id_dia_key;
alter table public.comissoes_diarias drop constraint if exists comissoes_diarias_conta_dia_unica;
alter table public.comissoes_diarias add primary key (user_id, conta_id, dia, marca);

-- Markup oficial: a Deriv reporta POR APP. Guardar por dia só fazia a
-- segunda app sobrescrever a primeira — os dois números da mesma data.
alter table public.markup_oficial_diario drop constraint if exists markup_oficial_diario_pkey;
alter table public.markup_oficial_diario add primary key (dia, app_id);
