-- 10/11/2026 (Tiago: "preciso conseguir clicar e visualizar as operações manuais ao vivo em tempo real
-- assim como nos bots"). A cabine da operação manual no Monitoramento desenha o preço ao vivo pela
-- cotação pública da Deriv (nada a mais no banco por tick); daqui ela só precisa do preço de entrada,
-- da barreira e, no fim, do preço de saída. O navegador do cliente grava a entrada uma vez, assim que a
-- Deriv informa, e a saída junto com o resultado. Colunas opcionais: operação antiga fica sem elas.
alter table public.operacoes_manuais
  add column if not exists preco_entrada numeric,
  add column if not exists preco_saida numeric,
  add column if not exists barreira numeric;
