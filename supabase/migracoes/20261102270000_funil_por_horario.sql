-- Aba Anúncios (02/11/2026, Tiago: "relatórios e indicadores"): os cadastros por hora do dia e
-- por dia da semana (horário de Brasília), para o quadro dos melhores horários.
create or replace function public.teeds_meta_horarios(p_marca text, p_parceiro text, p_de date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral vê os anúncios'; end if;
  with l as (
    select (l.inscricao_recebida_em at time zone 'America/Sao_Paulo') as quando,
           (lower(coalesce(l.origem, '')) in ('meta', 'facebook', 'fb', 'instagram', 'ig', 'an', 'messenger', 'audience_network')
             or l.pagina ilike '%fbclid=%' or l.pagina ilike '%utm_source=meta%') as de_anuncio
      from public.leads_capturados l
     where l.marca = p_marca
       and (l.parceiro = p_parceiro or l.pagina ilike '%/' || p_parceiro || '/%')
       and (l.inscricao_recebida_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  )
  select jsonb_build_object(
    'porHora', (select coalesce(jsonb_agg(s order by s.hora), '[]'::jsonb) from (
                 select extract(hour from quando)::int as hora, count(*) as cadastros, count(*) filter (where de_anuncio) as "deAnuncio" from l group by 1) s),
    'porSemana', (select coalesce(jsonb_agg(s order by s.dia), '[]'::jsonb) from (
                 select extract(dow from quando)::int as dia, count(*) as cadastros, count(*) filter (where de_anuncio) as "deAnuncio" from l group by 1) s)
  ) into v;
  return v;
end $$;
revoke all on function public.teeds_meta_horarios(text, text, date, date) from public, anon;
grant execute on function public.teeds_meta_horarios(text, text, date, date) to authenticated;
