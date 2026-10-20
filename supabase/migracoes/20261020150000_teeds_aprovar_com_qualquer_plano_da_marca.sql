-- 20/10/2026: aprovar um cadastro com o plano GF Member ('treino') dava
-- "Plano inválido": a aprovação só aceitava 'essencial' e 'pro'. Agora vale
-- qualquer plano ativo oferecido à marca do cadastro (tabela planos).
alter table public.clientes_pendentes drop constraint if exists clientes_pendentes_plano_id_check;
alter table public.clientes_pendentes
  add constraint clientes_pendentes_plano_id_fkey foreign key (plano_id) references public.planos(id);

create or replace function public.teeds_decidir_lead(p_id uuid, p_marca text, p_admin uuid, p_acao text, p_trava uuid, p_plano text default 'essencial')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r public.clientes_pendentes;
begin
  if not exists(select 1 from public.administradores where user_id=p_admin and marca=p_marca) then raise exception 'Administrador não autorizado'; end if;
  select * into r from public.clientes_pendentes where id=p_id and marca=p_marca for update;
  if not found then raise exception 'Cadastro não encontrado'; end if;
  if r.status in ('aprovado','recusado') then return to_jsonb(r); end if;
  if r.status='processando' and r.trava_ate>now() then raise exception 'Aprovação em andamento. Aguarde.'; end if;
  if p_acao='recusar' then
    -- Uma aprovação iniciada pode ter criado o login: só pode ser retomada.
    if r.status='processando' then raise exception 'Retome a aprovação já iniciada'; end if;
    update public.clientes_pendentes set status='recusado',decidido_por=p_admin,decidido_em=now() where id=p_id returning * into r;
  elsif p_acao='aprovar' then
    -- qualquer plano ativo que a marca ofereça (o GF Member só existe na GlobalFly)
    if not exists(select 1 from public.planos where id=p_plano and ativo and p_marca = any(marcas)) then raise exception 'Plano inválido'; end if;
    update public.clientes_pendentes set plano_id=case when status='pendente' then p_plano else plano_id end,status='processando',trava=p_trava,trava_ate=now()+interval '2 minutes',decidido_por=p_admin where id=p_id returning * into r;
  else raise exception 'Ação inválida'; end if;
  return to_jsonb(r);
end $function$;
