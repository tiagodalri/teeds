-- 04/11/2026 (Tiago: "lógica rasa"): o funil da aba Anúncios dividia as etapas da Meta (só anúncio) por
-- "começaram o cadastro" de todo o /n (orgânico junto). teeds_meta_funil passa a devolver também
-- passosAnuncio: os mesmos passos só de quem veio dos anúncios, lidos da Central de rastreio
-- (rastreio_eventos, canal anuncio-meta; existe desde 04/11/2026). Aplicado trocando o fim da função:
do $$ declare d text := pg_get_functiondef('public.teeds_meta_funil(text,text,date,date)'::regprocedure); n text; begin
  if position('passosAnuncio' in d) > 0 then return; end if;
  n := replace(d, $a$  return v;
end$a$, $a$  v := v || jsonb_build_object('passosAnuncio', (select jsonb_build_object(
      'visitas', count(distinct e.visitante) filter (where e.evento in ('entrada', 'pagina')),
      'formulario', count(distinct e.visitante) filter (where e.evento = 'formulario'),
      'clicou', count(distinct e.visitante) filter (where e.evento = 'clicou'),
      'comecou', count(distinct e.visitante) filter (where e.evento = 'comecou'))
    from public.rastreio_eventos e
   where e.marca = p_marca and e.parceiro = p_parceiro and e.canal = 'anuncio-meta'
     and e.criado_em >= (p_de::timestamp at time zone 'America/Sao_Paulo') and e.criado_em < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')));
  return v;
end$a$);
  execute n;
end $$;
