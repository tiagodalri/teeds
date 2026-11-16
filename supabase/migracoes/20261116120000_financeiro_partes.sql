/*
  Financeiro › divisão por projeto (16/11/2026, Tiago: "Eu e o Victor somos sócios na GlobalFly... no projeto dele,
  /v, ele tem 50% e eu tenho 50% (primeiro pagamos as despesas do projeto e depois dividimos o resto). No projeto do
  Naor, o Naor tem 50%, eu tenho 25% e o Victor tem 25%... Precisava ter tipo uma previsão de quanto vai sobrar pra
  cada").

  fin_partes: quem leva quanto do lucro de cada projeto (projeto_id null = custo geral, o que não é de projeto).
  `quem` = 's:<id do sócio>' ou 'p:<código do parceiro>'. Sem linhas para um projeto, vale o percentual dos sócios.
  Só o dono muda (fin_salvar_partes confere que soma 100%).
*/
create table if not exists public.fin_partes (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  projeto_id uuid references public.fin_projetos (id) on delete cascade,
  quem text not null check (quem ~ '^(s:[0-9a-f-]{36}|p:[a-z0-9]{1,20})$'),
  percentual numeric(7, 4) not null check (percentual > 0 and percentual <= 100),
  criado_em timestamptz not null default now()
);
create unique index if not exists fin_partes_unica on public.fin_partes (marca, coalesce(projeto_id::text, 'geral'), quem);

alter table public.fin_partes enable row level security;
drop policy if exists fin_ler on public.fin_partes;
create policy fin_ler on public.fin_partes for select to authenticated using (array[marca, '*'] && (select public.fin_marcas('leitor')));
revoke all on public.fin_partes from anon, authenticated;
grant select on public.fin_partes to authenticated;

-- Troca a divisão de um projeto (ou do custo geral, p_projeto null) de uma vez: só o dono, e precisa somar 100%.
create or replace function public.fin_salvar_partes(p_marca text, p_projeto uuid, p_partes jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_soma numeric;
begin
  if not (array[p_marca, '*'] && public.fin_marcas('dono')) then raise exception 'Só quem é dono do financeiro muda a divisão.'; end if;
  if p_projeto is not null and not exists (select 1 from public.fin_projetos where id = p_projeto and marca = p_marca) then
    raise exception 'Projeto não encontrado.';
  end if;
  select coalesce(sum((x ->> 'percentual')::numeric), 0) into v_soma from jsonb_array_elements(coalesce(p_partes, '[]'::jsonb)) x;
  if jsonb_array_length(coalesce(p_partes, '[]'::jsonb)) > 0 and abs(v_soma - 100) > 0.001 then
    raise exception 'Os percentuais precisam somar 100%%.';
  end if;
  delete from public.fin_partes where marca = p_marca and projeto_id is not distinct from p_projeto;
  insert into public.fin_partes (marca, projeto_id, quem, percentual)
  select p_marca, p_projeto, x ->> 'quem', (x ->> 'percentual')::numeric
  from jsonb_array_elements(coalesce(p_partes, '[]'::jsonb)) x
  where (x ->> 'percentual')::numeric > 0;
  return json_build_object('ok', true);
end $$;
revoke all on function public.fin_salvar_partes(text, uuid, jsonb) from anon, public;
grant execute on function public.fin_salvar_partes(text, uuid, jsonb) to authenticated;
