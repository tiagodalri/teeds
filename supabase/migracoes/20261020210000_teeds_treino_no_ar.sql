-- 20/10/2026: a sala de treino no ar avisa os GF Members (selo vermelho no
-- topo, ponto no menu "Ao vivo" e o aviso "Live iniciada").
--
-- O navegador do admin manda um pulso a cada 15 s enquanto transmite (câmera,
-- tela, microfone ou simulação ligada) e apaga ao sair. Se o navegador dele
-- fechar sem avisar, a sala deixa de contar como no ar 75 s depois do último
-- pulso. A tabela não tem leitura direta: tudo passa pelas duas funções.
create table if not exists public.treino_no_ar (
  marca text primary key,
  apresentador text,
  iniciada_em timestamptz not null default now(),
  visto_em timestamptz not null default now()
);
alter table public.treino_no_ar enable row level security;

create or replace function public.teeds_treino_pulso(p_marca text, p_no_ar boolean, p_apresentador text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.teeds_sou_admin_da(p_marca) then raise exception 'Só o administrador transmite na sala de treino'; end if;
  if p_no_ar then
    insert into public.treino_no_ar (marca, apresentador, iniciada_em, visto_em)
    values (p_marca, left(nullif(trim(p_apresentador), ''), 60), now(), now())
    on conflict (marca) do update
      set visto_em = now(),
          apresentador = coalesce(excluded.apresentador, public.treino_no_ar.apresentador),
          -- pulso depois de um silêncio longo: é uma sessão nova
          iniciada_em = case when public.treino_no_ar.visto_em < now() - interval '75 seconds'
                             then now() else public.treino_no_ar.iniciada_em end;
  else
    delete from public.treino_no_ar where marca = p_marca;
  end if;
end $function$;

-- Para o GF Member (e o admin): a sala de treino está no ar agora?
create or replace function public.teeds_treino_agora(p_marca text)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select jsonb_build_object('iniciadaEm', t.iniciada_em, 'apresentador', t.apresentador)
    from public.treino_no_ar t
   where t.marca = p_marca and t.visto_em > now() - interval '75 seconds'
     and public.teeds_minha_sala_de_treino(p_marca);
$function$;

revoke all on function public.teeds_treino_pulso(text, boolean, text) from public, anon;
revoke all on function public.teeds_treino_agora(text) from public, anon;
grant execute on function public.teeds_treino_pulso(text, boolean, text) to authenticated;
grant execute on function public.teeds_treino_agora(text) to authenticated;
