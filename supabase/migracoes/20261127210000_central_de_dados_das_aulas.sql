-- Central de dados das aulas (27/11/2026)
-- Tiago: "um painel pra ver todas as aulas da plataforma e a % de alunos que assistiram cada uma,
-- clicar e ver os detalhes, quem viu tudo, quem não viu".
--
-- teeds_aulas_controle já traz quem ABRIU cada aula. Para saber quem NÃO abriu faltava a base:
-- todos os alunos com acesso ativo na marca (sem a equipe/admins), com a mesma trava de admin
-- e de parceiro do controle (o admin do parceiro só vê os alunos dele).

drop function if exists public.teeds_aulas_alunos(text);
create function public.teeds_aulas_alunos(p_marca text)
returns table(user_id uuid, nome text, email text, plano_id text, plano text, parceiro text, foto_url text,
              criado_em timestamptz, visto_em timestamptz, cursos text[])
language sql stable security definer set search_path = public as $$
  select c.user_id,
         coalesce(nullif(c.nome, ''), nullif(u.raw_user_meta_data->>'nome', ''), nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)) as nome,
         regexp_replace(coalesce(u.email, c.email), '\+marca-[a-z]+@', '@') as email,
         c.plano_id,
         coalesce(pm.nome, c.plano_id) as plano,
         nullif(c.parceiro, '') as parceiro,
         nullif(c.foto_url, '') as foto_url,
         c.criado_em, c.visto_em,
         -- os cursos liberados à parte (a mesma fonte de teeds_meus_cursos)
         coalesce((select array_agg(substring(cp.produto_id from 7)) from public.cliente_produtos cp
                    where cp.user_id = c.user_id and cp.marca = p_marca and cp.ativo and cp.produto_id like 'curso-%'
                      and (cp.expira_em is null or cp.expira_em > now())), '{}') as cursos
    from public.clientes c
    join auth.users u on u.id = c.user_id
    left join public.planos_da_marca pm on pm.marca = c.marca and pm.plano_id = c.plano_id
   where c.marca = p_marca
     and coalesce(c.status_acesso, 'ativo') = 'ativo'
     and (c.acesso_expira_em is null or c.acesso_expira_em > now())
     and not exists (select 1 from public.administradores a where a.user_id = c.user_id and a.marca in (p_marca, 'teeds'))
     and public.teeds_admin_pleno_da(p_marca)
     and (public.teeds_parceiro_forcado(p_marca) is null or coalesce(c.parceiro, '') = public.teeds_parceiro_forcado(p_marca))
   order by c.criado_em desc;
$$;

revoke all on function public.teeds_aulas_alunos(text) from public, anon;
grant execute on function public.teeds_aulas_alunos(text) to authenticated;
