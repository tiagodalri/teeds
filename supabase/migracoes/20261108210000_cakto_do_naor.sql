-- 08/11/2026: Black e Prestige do GF Member também vendem pela Cakto do Naor
-- (conta UniTrade, webhook 82582, segredo em CAKTO_WEBHOOK_SECRET_NAOR no servidor).
-- Ofertas: pay.cakto.com.br/f2jvqbi (Black) e pay.cakto.com.br/3fnk7dt (Prestige).
-- Aplicado direto no banco em 08/11; este arquivo é o registro.
insert into public.cakto_produtos (cakto_id, marca, produto, nome) values
  ('c2f4044a-019a-493d-98e0-7fa06efcae50', 'globalfly', 'gf-black', 'GF Member Black (Cakto do Naor)'),
  ('f67aaf9c-752c-4ead-9fad-9c51706928f8', 'globalfly', 'gf-prestige', 'GF Member Prestige (Cakto do Naor)')
on conflict (cakto_id) do nothing;
