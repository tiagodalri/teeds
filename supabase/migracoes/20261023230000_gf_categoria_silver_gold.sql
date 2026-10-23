-- GlobalFly: categoria Silver / Gold do cliente (Tiago, 23/10/2026).
--
-- É um selo, não um plano: não libera nem tranca nada. Aparece no topo da
-- plataforma, entre o "Conectado" e as iniciais. Só o administrador muda; o
-- cliente não consegue trocar a própria categoria (mesma regra do plano).
--
-- Na GlobalFly, todo cliente nasce Gold, inclusive os que já estavam
-- cadastrados. Silver existe para o admin usar quando quiser. Nas outras
-- marcas a coluna fica vazia e o selo não aparece.

alter table public.clientes add column if not exists categoria text
  check (categoria in ('silver', 'gold'));

comment on column public.clientes.categoria is
  'Selo do cliente (GlobalFly): silver ou gold. Só admin altera; GF nasce gold.';

update public.clientes set categoria = 'gold' where marca = 'globalfly' and categoria is null;

create or replace function public.teeds_proteger_plano()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not exists (select 1 from public.planos where id = new.plano_id and new.marca = any(marcas)) then
    raise exception 'Escolha um dos planos de clientes desta plataforma';
  end if;
  -- GlobalFly: todo cadastro novo nasce Gold
  if tg_op = 'INSERT' and new.marca = 'globalfly' and new.categoria is null then
    new.categoria := 'gold';
  end if;
  if auth.role()='authenticated' and not public.teeds_sou_admin_da(new.marca) then
    if tg_op='INSERT' then
      if new.plano_id<>'essencial' then raise exception 'Somente o administrador pode liberar o simulador'; end if;
      -- quem se cadastra sozinho não escolhe a própria categoria
      new.categoria := case when new.marca = 'globalfly' then 'gold' else null end;
    elsif new.plano_id is distinct from old.plano_id or new.status_acesso is distinct from old.status_acesso
          or new.acesso_expira_em is distinct from old.acesso_expira_em
          or new.categoria is distinct from old.categoria then
      raise exception 'Somente o administrador pode alterar o acesso';
    end if;
  end if;
  return new;
end $function$;
