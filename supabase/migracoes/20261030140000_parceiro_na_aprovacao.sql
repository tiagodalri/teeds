-- 30/10/2026 (Tiago): "quando eu for aprovar um cliente, conseguir selecionar
-- se ele é do Naor ou do Victor". Ainda há quem se cadastre em
-- globalflytrade.com sem o /n ou o /v; o admin geral decide na aprovação.
--
-- Só o admin geral (teeds_sou_admin_geral). Grava no pedido (clientes_pendentes)
-- e na ficha do cliente (clientes), com registro em parceiro_trocas. A ficha
-- costuma existir desde o cadastro; se ainda não existir, ela herda do pedido
-- quando nascer (teeds_cliente_herda_parceiro, abaixo).

create or replace function public.teeds_parceiro_na_aprovacao(p_id uuid, p_codigo text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r public.clientes_pendentes;
  v_para text := nullif(lower(trim(coalesce(p_codigo, ''))), '');
  v_user uuid;
  v_de text;
begin
  if not public.teeds_sou_admin_geral() then raise exception 'Só o admin geral define o parceiro de um cliente.'; end if;
  select * into r from public.clientes_pendentes where id = p_id for update;
  if not found then raise exception 'Cadastro não encontrado.'; end if;
  if v_para is not null and public.teeds_parceiro_valido(r.marca, v_para) is null then raise exception 'Parceiro desconhecido.'; end if;

  update public.clientes_pendentes set parceiro = v_para where id = p_id;

  v_user := coalesce(r.user_id, (select u.id from auth.users u where lower(u.email) = public.teeds_email_da_conta(r.email, r.marca) limit 1));
  if v_user is not null then
    select parceiro into v_de from public.clientes where user_id = v_user and marca = r.marca;
    if found and v_de is distinct from v_para then
      perform set_config('teeds.troca_parceiro', '1', true);
      update public.clientes set parceiro = v_para, parceiro_em = now(), parceiro_fonte = 'aprovacao'
       where user_id = v_user and marca = r.marca;
      perform set_config('teeds.troca_parceiro', '', true);
      insert into public.parceiro_trocas (marca, user_id, de, para, motivo, por, fonte)
      values (r.marca, v_user, v_de, v_para, 'Definido na aprovação do cadastro', auth.uid(), 'aprovacao');
    end if;
  end if;
  return coalesce(v_para, '');
end $function$;

revoke all on function public.teeds_parceiro_na_aprovacao(uuid, text) from public, anon;
grant execute on function public.teeds_parceiro_na_aprovacao(uuid, text) to authenticated;

-- Recadastro (novo envio do formulário) relê o parceiro do lead. Sem lead com
-- parceiro, fica o que já estava (a escolha do admin não some num recadastro).
create or replace function public.teeds_pendente_parceiro()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_codigo text;
begin
  select l.parceiro into v_codigo from public.leads_capturados l
   where l.marca = new.marca and l.email_normalizado = lower(new.email) and l.parceiro is not null
   order by coalesce(l.inscricao_recebida_em, l.atualizado_em, l.convertido_em) desc nulls last limit 1;
  new.parceiro := coalesce(v_codigo, case when tg_op = 'UPDATE' then old.parceiro end);
  return new;
end $function$;

-- A ficha que nasce depois da escolha herda do pedido quando o lead não diz nada.
create or replace function public.teeds_cliente_herda_parceiro()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_codigo text; v_fonte text := 'cadastro';
begin
  if new.parceiro is not null then
    if coalesce(current_setting('teeds.troca_parceiro', true), '') <> '1' then new.parceiro := null; new.parceiro_em := null; new.parceiro_fonte := null; end if;
    return new;
  end if;
  select l.parceiro into v_codigo from public.leads_capturados l
   where l.marca = new.marca and l.email_normalizado = lower(new.email) and l.parceiro is not null limit 1;
  if v_codigo is null then
    select p.parceiro into v_codigo from public.clientes_pendentes p
     where p.marca = new.marca and lower(p.email) = lower(new.email) and p.parceiro is not null
     order by p.ultima_inscricao_em desc nulls last limit 1;
    v_fonte := 'aprovacao';
  end if;
  if v_codigo is not null and new.criado_em >= (select p.criado_em from public.parceiros p where p.marca = new.marca and p.codigo = v_codigo) then
    new.parceiro := v_codigo; new.parceiro_em := now(); new.parceiro_fonte := v_fonte;
  end if;
  return new;
end $function$;
