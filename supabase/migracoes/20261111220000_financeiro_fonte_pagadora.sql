/*
  Financeiro › fonte pagadora (11/11/2026, Tiago: "Sempre que for lançar um pagamento, eu preciso colocar a fonte
  pagadora! ... Tiago Dal Ri, Victor Cordeiro, Naor Bezerra, Caixa da GlobalFly — seletor por favor").

  As regras (dele):
    - Tiago e Victor são sócios. Sócio pagou algo do projeto dele, de outro sócio ou da GlobalFly em geral:
      a GlobalFly devolve (socio_id, entra no acerto entre sócios).
    - Sócio pagou algo do projeto de um parceiro que não é sócio (Naor, Douglas): quem devolve é o parceiro,
      ao sócio que pagou (socio_id + pago_fora; a dívida aparece em "Devoluções").
    - O parceiro pagou: custo do bolso dele, ninguém devolve (pago_fora + pago_por = código do parceiro).
    - Tipo novo 'devolucao': o parceiro devolveu a um sócio (socio_id = quem recebeu, pago_por = quem devolveu).
*/
alter table public.fin_lancamentos add column if not exists pago_por text;
alter table public.fin_socios add column if not exists parceiro text;
alter table public.fin_projetos add column if not exists responsavel text;

alter table public.fin_lancamentos drop constraint if exists fin_lancamentos_tipo_check;
alter table public.fin_lancamentos add constraint fin_lancamentos_tipo_check check (tipo in ('receita', 'despesa', 'aporte', 'retirada', 'devolucao'));
alter table public.fin_lancamentos drop constraint if exists fin_socio_obrigatorio;
alter table public.fin_lancamentos add constraint fin_socio_obrigatorio check (tipo not in ('aporte', 'retirada', 'devolucao') or socio_id is not null);
alter table public.fin_lancamentos drop constraint if exists fin_devolucao_de_parceiro;
alter table public.fin_lancamentos add constraint fin_devolucao_de_parceiro check (tipo <> 'devolucao' or (pago_por is not null and pago_fora));

-- o nome de quem toca cada projeto (Naor Bezerra, Victor Cordeiro…), para a lista de fontes pagadoras
update public.fin_projetos f set responsavel = p.nome
  from public.parceiros p where p.marca = f.marca and p.codigo = f.parceiro and f.responsavel is null;

create or replace function public.fin_semear_projetos(p_marca text)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.fin_projetos (marca, nome, cor, parceiro, responsavel, ordem)
  select p.marca, 'Projeto ' || split_part(btrim(p.nome), ' ', 1),
         case p.codigo when 'v' then '#B78D39' when 'n' then '#0E8C9B' when 'd' then '#7C5CC4' else '#2F6FDB' end,
         p.codigo, btrim(p.nome), row_number() over (order by p.codigo desc)
  from public.parceiros p
  where p.marca = p_marca and p.ativo
    and not exists (select 1 from public.fin_projetos f where f.marca = p_marca);
$$;
revoke all on function public.fin_semear_projetos(text) from anon, authenticated, public;
