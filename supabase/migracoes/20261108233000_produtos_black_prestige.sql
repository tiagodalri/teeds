-- 08/11/2026: gf-black e gf-prestige faltavam na tabela produtos.
-- cliente_produtos.produto_id tem chave estrangeira para produtos, então toda
-- compra de Black/Prestige pela Cakto (Victor ou Naor) de quem JÁ tem cadastro
-- falhava com 23503 e o servidor respondia 500. Achado na revisão da Cakto do
-- Naor, antes de qualquer venda real. Aplicado direto no banco em 08/11.
insert into public.produtos (id, nome, categoria, preco_centavos, ativo, marcas) values
  ('gf-black', 'GF Member Black', 'acesso', 99700, true, array['globalfly']),
  ('gf-prestige', 'GF Member Prestige', 'acesso', 199700, true, array['globalfly'])
on conflict (id) do nothing;
