-- 26/10/2026 (Tiago): vencimento de todos os clientes ativos da Teeds e da
-- OMNI adiado para 31/12/2027 23:59:59 (Brasília), para ninguém expirar.
-- Ficam como estavam: quem não tem prazo (null), o cancelado e o pendente.
-- Aplicado direto no banco: 11.495 na Teeds e 10 na OMNI.
-- Antes de alterar, os vencimentos antigos foram copiados para
-- public.backup_clientes_vencimento_20261026 (11.511 linhas, com RLS).
create table if not exists public.backup_clientes_vencimento_20261026 as
  select user_id, marca, status_acesso, acesso_expira_em, now() as copiado_em from public.clientes where marca in ('teeds','omni');
alter table public.backup_clientes_vencimento_20261026 enable row level security;
update public.clientes set acesso_expira_em = timestamptz '2027-12-31 23:59:59-03'
 where marca in ('teeds','omni') and status_acesso = 'ativo' and acesso_expira_em is not null;
