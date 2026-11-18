-- 18/11/2026 (Victor Cordeiro: "acrescenta no campo de leads ... e também da onde o cara veio, porque já
-- está na minha bio o link do nosso site"). A tela de Leads mostra "Veio de" em cada cadastro. Quando o
-- cadastro chegou sem marcação (origem vazia), vale o canal da 1ª visita do mesmo navegador
-- (rastreio_visitantes), ligado pelo lead_id ou pelo id anônimo gravado na página do cadastro.
--
-- rastreio_visitantes não abre para o site (RLS sem política): esta função só devolve os leads que o
-- próprio admin já enxerga em leads_capturados (a mesma regra da política "admin desta marca ve leads").
create or replace function public.teeds_origem_dos_leads(p_marca text)
returns table(lead_id uuid, canal text, link text, ref text)
language sql stable security definer set search_path to 'public' as $$
  select distinct on (l.id) l.id, r.p_canal, r.p_link, r.p_ref
    from public.leads_capturados l
    join public.rastreio_visitantes r
      on r.marca = l.marca
     and (r.lead_id = l.id or r.visitante = substring(l.pagina from '[?&]visitante=([^&#]+)'))
   where l.marca = p_marca
     and (l.marca = any(public.teeds_marcas_admin_total())
          or (l.marca || ':' || coalesce(l.parceiro, '')) = any(public.teeds_escopos()))
   order by l.id, (r.lead_id = l.id) desc nulls last, r.primeira_em
$$;
revoke all on function public.teeds_origem_dos_leads(text) from public, anon;
grant execute on function public.teeds_origem_dos_leads(text) to authenticated;
