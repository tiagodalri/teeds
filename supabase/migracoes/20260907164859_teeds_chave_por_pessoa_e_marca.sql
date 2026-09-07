-- Uma pessoa pode existir nas duas plataformas.
--
-- A chave era só o user_id, então cada pessoa tinha UMA linha — e a marca
-- dela era uma só. Na prática isso impedia o dono de ser administrador das
-- duas plataformas, e impediria um cliente de usar as duas com o mesmo
-- e-mail (o login do Supabase é o mesmo para as duas).
--
-- A chave passa a ser (pessoa, marca): a mesma pessoa tem uma linha por
-- plataforma, com acesso, plano e observações próprios de cada uma.
-- Nenhuma tabela depende destas chaves, então a troca é segura.

alter table public.administradores drop constraint if exists administradores_pkey;
alter table public.administradores add primary key (user_id, marca);

alter table public.clientes drop constraint if exists clientes_pkey;
alter table public.clientes add primary key (user_id, marca);

-- O dono administra as duas.
insert into public.administradores (user_id, marca)
values ('7679630d-54dc-439d-a0b5-f2e8d8f5a7aa', 'omni')
on conflict (user_id, marca) do nothing;
