-- 06/11/2026 (Tiago): só a Nathalia (GF Member) usa a plataforma normal antes da live de 09/11;
-- o resto segue a estratégia da live. A exceção fica no banco, por cliente, e o site lê daqui.
-- Ligada para: nathaliaraslosnek@gmail.com (globalfly). O cliente não consegue ligar sozinho (teeds_proteger_plano).
alter table public.clientes add column if not exists liberado_antes_da_live boolean not null default false;
comment on column public.clientes.liberado_antes_da_live is 'GlobalFly: a plataforma (e as aulas) abrem para este cliente antes da live de lançamento.';
-- teeds_proteger_plano: no INSERT de cliente força false; no UPDATE de cliente, mudar a marca dá erro (aplicado em proteger_liberado_antes_da_live).
