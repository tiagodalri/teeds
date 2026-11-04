-- 04/11/2026, Tiago: "um panorama interpretado pela I.A. na Visão geral... um plano de ação... um botão
-- Otimizar campanhas com um modal com todas as alterações e o porquê; aprovar, confirmar, e aí aplicar no
-- Gerenciador". Cada análise fica aqui: o que a I.A. leu (entrada), o que ela escreveu (dados), o que o
-- admin aprovou e o que a Meta respondeu (resultado). Só a função meta-analise escreve e lê (service role).
create table if not exists public.anuncios_analises (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  parceiro text not null,
  de date not null,
  ate date not null,
  -- analisando | pronta | erro | aplicada | parcial (parte das mudanças falhou)
  situacao text not null default 'analisando',
  modelo text,
  -- os números que a I.A. recebeu (para conferir na hora de aplicar: orçamento de agora x o da análise)
  entrada jsonb,
  -- resumo, panorama, plano e mudanças propostas
  dados jsonb,
  erro text,
  uso jsonb,
  quem uuid,
  quem_nome text,
  criado_em timestamptz not null default now(),
  pronta_em timestamptz,
  aplicado_em timestamptz,
  -- cada mudança aplicada: { id, ok, mensagem, criadoId? }
  resultado jsonb
);
create index if not exists anuncios_analises_marca on public.anuncios_analises (marca, parceiro, criado_em desc);
alter table public.anuncios_analises enable row level security;
revoke all on public.anuncios_analises from anon, authenticated;
