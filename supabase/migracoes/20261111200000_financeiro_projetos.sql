/*
  Financeiro › projetos (11/11/2026, Tiago: "Preciso também ter um custo por projeto ok? Tipo projeto do Victor,
  projeto do Naor, etc").

  Cada lançamento pode ser de um projeto (ou de nenhum = custo geral da plataforma). Os projetos de partida
  saem dos parceiros de divulgação da marca (Victor /v, Naor /n, Douglas /d); dá para criar outros.
*/
create table if not exists public.fin_projetos (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  nome text not null check (length(btrim(nome)) between 1 and 60),
  cor text not null default '#1E3D6E',
  parceiro text,
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists fin_projetos_marca on public.fin_projetos (marca);

alter table public.fin_lancamentos add column if not exists projeto_id uuid references public.fin_projetos (id) on delete set null;
create index if not exists fin_lancamentos_projeto on public.fin_lancamentos (projeto_id) where projeto_id is not null;

alter table public.fin_projetos enable row level security;
drop policy if exists fin_ler on public.fin_projetos;
create policy fin_ler on public.fin_projetos for select to authenticated using (array[marca, '*'] && (select public.fin_marcas('leitor')));
drop policy if exists fin_escrever on public.fin_projetos;
create policy fin_escrever on public.fin_projetos for all to authenticated
  using (array[marca, '*'] && (select public.fin_marcas('editor'))) with check (array[marca, '*'] && (select public.fin_marcas('editor')));
revoke all on public.fin_projetos from anon;
grant select, insert, update, delete on public.fin_projetos to authenticated;

-- os projetos de partida: um por parceiro de divulgação da marca
create or replace function public.fin_semear_projetos(p_marca text)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.fin_projetos (marca, nome, cor, parceiro, ordem)
  select p.marca, 'Projeto ' || split_part(btrim(p.nome), ' ', 1),
         case p.codigo when 'v' then '#B78D39' when 'n' then '#0E8C9B' when 'd' then '#7C5CC4' else '#2F6FDB' end,
         p.codigo, row_number() over (order by p.codigo desc)
  from public.parceiros p
  where p.marca = p_marca and p.ativo
    and not exists (select 1 from public.fin_projetos f where f.marca = p_marca);
$$;
revoke all on function public.fin_semear_projetos(text) from anon, authenticated, public;

-- fin_preparar passa a semear também os projetos (o resto igual)
create or replace function public.fin_preparar(p_marca text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not (array[p_marca, '*'] && public.fin_marcas('editor')) then return; end if;
  if not exists (select 1 from public.fin_categorias where marca = p_marca) then
    insert into public.fin_categorias (marca, tipo, nome, cor, ordem) values
      (p_marca, 'saida', 'Anúncios', '#2F6FDB', 1),
      (p_marca, 'saida', 'Ferramentas e assinaturas', '#7C5CC4', 2),
      (p_marca, 'saida', 'Servidores e tecnologia', '#0E8C9B', 3),
      (p_marca, 'saida', 'Equipe e prestadores', '#C2410C', 4),
      (p_marca, 'saida', 'Comissões de parceiros', '#B78D39', 5),
      (p_marca, 'saida', 'Impostos e taxas', '#DC1F2E', 6),
      (p_marca, 'saida', 'Contabilidade e jurídico', '#64748B', 7),
      (p_marca, 'saida', 'Produção de conteúdo', '#DB2777', 8),
      (p_marca, 'saida', 'Outras despesas', '#94A3B8', 9),
      (p_marca, 'entrada', 'Markup da Deriv', '#0B9E4A', 1),
      (p_marca, 'entrada', 'Vendas de planos', '#B78D39', 2),
      (p_marca, 'entrada', 'Comissão de afiliado', '#2F8F72', 3),
      (p_marca, 'entrada', 'Outras receitas', '#64748B', 4);
  end if;
  if not exists (select 1 from public.fin_contas where marca = p_marca) then
    insert into public.fin_contas (marca, nome, tipo, cor, ordem) values
      (p_marca, 'Conta principal', 'banco', '#1E3D6E', 1),
      (p_marca, 'Caixa', 'caixa', '#2F8F72', 2);
  end if;
  perform public.fin_semear_projetos(p_marca);
end $$;
