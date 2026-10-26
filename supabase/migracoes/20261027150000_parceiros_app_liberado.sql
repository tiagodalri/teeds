-- Aplicada pelo painel em 27/10/2026 (ver o texto completo na migração aplicada "parceiros_app_liberado").
-- O app do parceiro só passa a ser usado quando o servidor das I.A. já sabe lidar com ele
-- (o servidor só reinicia sem cliente operando). Até lá, o cliente conecta pelo app padrão.
-- teeds_meu_app_deriv exige app_liberado; teeds_meus_links mostra app_liberado ao admin geral;
-- teeds_configurar_parceiro desliga a liberação quando o app muda.
alter table public.parceiros add column if not exists app_liberado boolean not null default false;
