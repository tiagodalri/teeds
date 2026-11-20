/*
  Financeiro › previsão com o Revenue Share da Deriv (20/11/2026, Tiago: "o Revenue Share da Deriv varia todo dia e fecha
  no último dia do mês... um campo 'Revenue Share até o momento', um para o Projeto Naor e outro para o Projeto Victor,
  que eu atualizo diariamente, e ver quanto teriam a receber no total se o mês fechasse com aquele valor").

  fin_revshare: o valor parcial do mês por projeto. Não é lançamento: não entra em receitas, resultado, saldo nem
  acerto; só a previsão do Resumo usa. Uma linha por (marca, projeto, mês); a tela grava por upsert e apaga quando o
  campo fica vazio. Lê quem é leitor; grava editor ou dono (as mesmas regras de fin_lancamentos).
*/
create table if not exists public.fin_revshare (
  marca text not null,
  projeto_id uuid not null references public.fin_projetos (id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  valor numeric(14, 2) not null check (valor >= 0),
  moeda text not null default 'USD' check (moeda in ('USD', 'BRL')),
  -- dólar comercial do momento em que foi salvo (só em USD)
  cotacao numeric(10, 4) check (cotacao is null or (cotacao > 1 and cotacao < 50)),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  primary key (marca, projeto_id, mes),
  check (moeda = 'BRL' or cotacao is not null)
);

-- quem gravou e quando: sempre o do banco, nunca o que vier da tela
create or replace function public.fin_revshare_carimbo() returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;
drop trigger if exists fin_revshare_carimbo on public.fin_revshare;
create trigger fin_revshare_carimbo before insert or update on public.fin_revshare for each row execute function public.fin_revshare_carimbo();

alter table public.fin_revshare enable row level security;
drop policy if exists fin_ler on public.fin_revshare;
create policy fin_ler on public.fin_revshare for select to authenticated using (array[marca, '*'] && (select public.fin_marcas('leitor')));
drop policy if exists fin_escrever on public.fin_revshare;
create policy fin_escrever on public.fin_revshare for all to authenticated
  using (array[marca, '*'] && (select public.fin_marcas('editor')))
  with check (array[marca, '*'] && (select public.fin_marcas('editor'))
    and exists (select 1 from public.fin_projetos p where p.id = projeto_id and p.marca = fin_revshare.marca));
revoke all on public.fin_revshare from anon, authenticated;
grant select, insert, update, delete on public.fin_revshare to authenticated;
