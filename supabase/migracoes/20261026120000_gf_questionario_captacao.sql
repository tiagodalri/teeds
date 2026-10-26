-- Captação da GlobalFly (26/10/2026): cadastro -> questionário -> obrigado.
-- O cadastro continua pelo motor (/publico/leads). O questionário só COMPLETA
-- a linha que o motor gravou: a página chama esta função com a chave pública,
-- e ela só mexe nas três colunas abaixo, só na GlobalFly e só em cadastro
-- recebido nas últimas 24 horas. Ninguém lê nada por aqui.
alter table public.leads_capturados
  add column if not exists ex_cliente boolean,
  add column if not exists produtos_anteriores text[],
  add column if not exists questionario_em timestamptz;

create or replace function public.gf_responder_questionario(p_email text, p_ex_cliente boolean, p_produtos text[] default '{}', p_outro text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  validos constant text[] := array['b3','fast','calculadora_fast','stark','plano_socio','mentoria','grande_revolucao','outro'];
  produtos text[];
  n int;
begin
  if p_email is null or p_ex_cliente is null then return false; end if;
  select coalesce(array_agg(distinct p), '{}') into produtos
    from unnest(coalesce(p_produtos, '{}')) p where p = any(validos);
  if not p_ex_cliente then produtos := '{}'; end if;
  if 'outro' = any(produtos) and nullif(btrim(coalesce(p_outro, '')), '') is not null then
    produtos := array_remove(produtos, 'outro') || ('outro: ' || left(btrim(p_outro), 60));
  end if;
  update leads_capturados
     set ex_cliente = p_ex_cliente, produtos_anteriores = produtos, questionario_em = now(), atualizado_em = now()
   where marca = 'globalfly'
     and email_normalizado = lower(btrim(p_email))
     and coalesce(inscricao_recebida_em, convertido_em) > now() - interval '24 hours';
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke all on function public.gf_responder_questionario(text, boolean, text[], text) from public;
grant execute on function public.gf_responder_questionario(text, boolean, text[], text) to anon, authenticated;
