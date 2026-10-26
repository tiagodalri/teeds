-- Parceiros, parte 2 (27/10/2026). Tiago: "crie uma parte de links para
-- divulgação... link de cadastro, link da comunidade... para cada um encontrar
-- os seus links e não ter mistura" e "quero que a conta da divisão da comissão
-- seja feita pela própria Deriv... puxar o que é GlobalFly Victor, o que é
-- GlobalFly Naor".
--
--  * parceiros.email: o login do parceiro na plataforma (e-mail real). Com ele,
--    o parceiro vê a página "Meus links" com os links DELE e só os dele.
--  * parceiro_links: os links que o admin geral cadastra para cada parceiro
--    (comunidade, abrir conta na Deriv, Instagram...). Os de cadastro (/n e a
--    landing com ?parceiro=n) a tela monta sozinha, não ficam aqui.
--  * parceiros.deriv_app_id: o app da Deriv do parceiro. Cliente do parceiro
--    conecta a Deriv por esse app, e o markup cai nele: a Deriv separa sozinha.
--    Vazio = o app padrão da marca (o comportamento de antes).

alter table public.parceiros add column if not exists email text;
alter table public.parceiros add column if not exists deriv_app_id text;
alter table public.parceiros drop constraint if exists parceiros_app_formato;
alter table public.parceiros add constraint parceiros_app_formato check (deriv_app_id is null or deriv_app_id ~ '^[A-Za-z0-9_-]{4,64}$');
create unique index if not exists parceiros_app_unico on public.parceiros (deriv_app_id) where deriv_app_id is not null;

create table if not exists public.parceiro_links (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  codigo text not null,
  titulo text not null check (length(trim(titulo)) between 2 and 60),
  url text not null check (url ~ '^https://[^[:space:]]{4,}$' and length(url) <= 500),
  descricao text check (descricao is null or length(descricao) <= 200),
  ordem int not null default 100,
  atualizado_em timestamptz not null default now(),
  foreign key (marca, codigo) references public.parceiros (marca, codigo) on delete cascade
);
alter table public.parceiro_links enable row level security;
-- sem políticas: só pelas funções abaixo

-- O parceiro desta pessoa (pelo e-mail real da conta), nesta marca.
create or replace function public.teeds_meu_codigo_de_parceiro(p_marca text)
returns text language sql stable security definer set search_path to 'public' as $$
  select p.codigo from public.parceiros p
  join auth.users u on u.id = (select auth.uid())
  where p.marca = p_marca and p.ativo and p.email is not null
    and lower(p.email) = lower(public.teeds_email_real(u.email))
  limit 1;
$$;

-- Os links: o parceiro vê os dele; o admin geral vê todos e o que falta configurar.
create or replace function public.teeds_meus_links(p_marca text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_geral boolean := public.teeds_sou_admin_geral(); v_meu text := public.teeds_meu_codigo_de_parceiro(p_marca);
begin
  if not v_geral and v_meu is null then return null; end if;
  return jsonb_build_object('geral', v_geral, 'parceiros', coalesce((
    select jsonb_agg(jsonb_build_object(
      'codigo', p.codigo, 'nome', p.nome,
      'email', case when v_geral then p.email end,
      'deriv_app_id', case when v_geral then p.deriv_app_id end,
      'links', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'titulo', l.titulo, 'url', l.url, 'descricao', l.descricao, 'ordem', l.ordem) order by l.ordem, l.titulo)
                         from public.parceiro_links l where l.marca = p.marca and l.codigo = p.codigo), '[]'::jsonb)
    ) order by p.codigo)
    from public.parceiros p where p.marca = p_marca and p.ativo and (v_geral or p.codigo = v_meu)), '[]'::jsonb));
end $$;
grant execute on function public.teeds_meus_links(text) to authenticated;

create or replace function public.teeds_salvar_link_parceiro(p_marca text, p_codigo text, p_id uuid, p_titulo text, p_url text, p_descricao text, p_ordem int)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if not public.teeds_sou_admin_geral() then raise exception 'Só o admin geral edita os links dos parceiros.'; end if;
  if p_id is null then
    insert into public.parceiro_links (marca, codigo, titulo, url, descricao, ordem)
    values (p_marca, p_codigo, trim(p_titulo), trim(p_url), nullif(trim(coalesce(p_descricao, '')), ''), coalesce(p_ordem, 100)) returning id into v_id;
  else
    update public.parceiro_links set titulo = trim(p_titulo), url = trim(p_url), descricao = nullif(trim(coalesce(p_descricao, '')), ''),
      ordem = coalesce(p_ordem, ordem), atualizado_em = now()
    where id = p_id and marca = p_marca and codigo = p_codigo returning id into v_id;
    if v_id is null then raise exception 'Link não encontrado.'; end if;
  end if;
  return v_id;
end $$;
grant execute on function public.teeds_salvar_link_parceiro(text, text, uuid, text, text, text, int) to authenticated;

create or replace function public.teeds_apagar_link_parceiro(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.teeds_sou_admin_geral() then raise exception 'Só o admin geral edita os links dos parceiros.'; end if;
  delete from public.parceiro_links where id = p_id;
end $$;
grant execute on function public.teeds_apagar_link_parceiro(uuid) to authenticated;

-- O e-mail de acesso e o app da Deriv de um parceiro (admin geral).
create or replace function public.teeds_configurar_parceiro(p_marca text, p_codigo text, p_email text, p_deriv_app_id text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.teeds_sou_admin_geral() then raise exception 'Só o admin geral configura os parceiros.'; end if;
  update public.parceiros set email = nullif(lower(trim(coalesce(p_email, ''))), ''), deriv_app_id = nullif(trim(coalesce(p_deriv_app_id, '')), '')
  where marca = p_marca and codigo = p_codigo;
  if not found then raise exception 'Parceiro não encontrado.'; end if;
end $$;
grant execute on function public.teeds_configurar_parceiro(text, text, text, text) to authenticated;

-- O app da Deriv com que ESTE cliente conecta: o do parceiro dele, se houver; senão nulo (o padrão da marca).
create or replace function public.teeds_meu_app_deriv(p_marca text)
returns text language sql stable security definer set search_path to 'public' as $$
  select p.deriv_app_id from public.clientes c
  join public.parceiros p on p.marca = c.marca and p.codigo = c.parceiro and p.ativo
  where c.user_id = (select auth.uid()) and c.marca = p_marca;
$$;
grant execute on function public.teeds_meu_app_deriv(text) to authenticated;

-- Os apps conhecidos de cada marca (o servidor confere o app de cada autorização contra esta lista).
create or replace function public.teeds_apps_dos_parceiros()
returns table (marca text, codigo text, deriv_app_id text) language sql stable security definer set search_path to 'public' as $$
  select marca, codigo, deriv_app_id from public.parceiros where deriv_app_id is not null and ativo;
$$;
revoke all on function public.teeds_apps_dos_parceiros() from public, anon, authenticated;

-- O Victor já tem conta na GF; o login do Naor entra quando a conta dele for criada.
update public.parceiros set email = 'victooripardo@gmail.com' where marca = 'globalfly' and codigo = 'v' and email is null;

-- Links iniciais (os mesmos da casa para os dois; o admin troca pelo de cada um quando tiver).
insert into public.parceiro_links (marca, codigo, titulo, url, descricao, ordem)
select 'globalfly', c.codigo, x.titulo, x.url, x.descricao, x.ordem
from (values ('n'), ('v')) c(codigo)
cross join (values
  ('Comunidade no WhatsApp', 'https://chat.whatsapp.com/CPBJlfpTpZy7u2N5VF9Drq', 'O grupo oficial da GlobalFly.', 30),
  ('Abrir conta na Deriv', 'https://t.deriv.link?t=AYTXZHG2MTKA', 'Para quem ainda não tem conta na corretora.', 40)
) x(titulo, url, descricao, ordem)
where not exists (select 1 from public.parceiro_links l where l.marca = 'globalfly' and l.codigo = c.codigo);
