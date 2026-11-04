-- 04/11/2026: "de anúncio" no funil e nos horários da aba Anúncios contava como anúncio o link da bio do
-- Instagram (utm_source=ig&utm_medium=social, que o próprio Instagram põe) e qualquer link com fbclid
-- (compartilhado no Facebook/Instagram). No /n eram 17 "de anúncio", sendo 1 de anúncio de verdade.
-- Agora vale a mesma regra da Central de rastreio: rastreio_canal_do_lead(...) = 'anuncio-meta'
-- (utm_source=meta, ou facebook/instagram com utm_medium pago). Aplicado trocando a expressão:
do $$ declare f text; d text; n text; velho text := $a$(lower(coalesce(l.origem, '')) in ('meta', 'facebook', 'fb', 'instagram', 'ig', 'an', 'messenger', 'audience_network')
             or l.pagina ilike '%fbclid=%' or l.pagina ilike '%utm_source=meta%') as de_anuncio$a$;
  novo text := $a$(public.rastreio_canal_do_lead(l.origem, l.meio, l.pagina) = 'anuncio-meta') as de_anuncio$a$;
begin
  foreach f in array array['public.teeds_meta_funil(text,text,date,date)', 'public.teeds_meta_horarios(text,text,date,date)'] loop
    d := pg_get_functiondef(f::regprocedure);
    n := replace(d, velho, novo);
    if n <> d then execute n; end if;
  end loop;
end $$;
