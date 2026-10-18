-- Plano de treino (18/10/2026, GlobalFly): para influenciadores e equipe
-- ensaiarem lives numa sala SIMULADA, com público e chat gerados. Quem tem
-- este plano não é cliente; nada da simulação chega a cliente nenhum (ela
-- roda só no navegador de quem treina) e a imagem leva o selo "Simulação".
insert into public.planos (id, nome, duracao_dias, ativo, recursos, marcas)
values ('treino', 'Treino de influenciadores', null, true,
  '{"aulas": true, "robos": true, "operar": true, "simulador": true, "gerenciamento": true, "sala_de_treino": true}'::jsonb,
  array['globalfly'])
on conflict (id) do update set nome = excluded.nome, ativo = true, recursos = excluded.recursos, marcas = excluded.marcas;

-- Quem entra na sala de treino: admin da marca ou conta ativa do plano de treino.
create or replace function public.teeds_minha_sala_de_treino(p_marca text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.teeds_sou_admin_da(p_marca) or exists (
    select 1 from public.clientes c
    where c.user_id = (select auth.uid()) and c.marca = p_marca and c.plano_id = 'treino'
      and coalesce(c.status_acesso, 'ativo') = 'ativo'
      and (c.acesso_expira_em is null or c.acesso_expira_em > now())
  );
$$;
revoke execute on function public.teeds_minha_sala_de_treino(text) from public, anon;
grant execute on function public.teeds_minha_sala_de_treino(text) to authenticated;
