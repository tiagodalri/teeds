-- 18/11/2026 (Victor via Tiago): clientes de outros projetos (Black/Fast/Indicador B3) usam a GlobalFly
-- como Gold mesmo sem saldo real. Exceção por cliente: a trava do Gold sem saldo não vale para quem tem
-- clientes.liberado_sem_saldo = true. Todo o resto da regra de 16/11 continua igual. APLICADA 18/11.
-- Liberados nesse dia: chales.contato@, gr9760621@ (depósito previsto 20/11), gianvictor2009@.
-- No mesmo pedido, mayconquintino@ virou Black (cliente_produtos gf-black origem admin + categoria black).
alter table public.clientes add column if not exists liberado_sem_saldo boolean not null default false;
alter table public.clientes add column if not exists liberado_sem_saldo_nota text;

create or replace function public.teeds_conta_travada(p_user uuid, p_marca text)
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select p_user is not null
     and p_marca = 'globalfly'
     and not exists (select 1 from administradores a where a.user_id = p_user and a.marca = p_marca)
     and exists (select 1 from clientes c where c.user_id = p_user and c.marca = p_marca)
     and not exists (select 1 from clientes c where c.user_id = p_user and c.marca = p_marca and c.liberado_sem_saldo)
     and public.teeds_subplano_id(p_user, p_marca) = 'gold'
     and not exists (select 1 from contas_deriv d
                      where d.user_id = p_user and d.marca = p_marca and d.tipo = 'real' and d.saldo > 0);
$function$;
