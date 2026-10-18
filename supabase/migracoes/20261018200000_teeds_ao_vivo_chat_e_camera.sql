-- Pedidos do Victor (18/10/2026): o moderador abre e fecha o chat (como no
-- Google Meet) e escolhe em que canto da tela o rosto aparece. Os dois
-- ficam na live, para quem entra no meio já ver certo.
alter table public.lives add column if not exists chat_aberto boolean not null default true;
alter table public.lives add column if not exists camera_canto text not null default 'inf-dir'
  check (camera_canto in ('sup-esq','sup-dir','inf-esq','inf-dir'));

-- Chat fechado: só o moderador escreve.
drop policy if exists "escreve no chat" on public.live_mensagens;
create policy "escreve no chat" on public.live_mensagens for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and fixada = false and apagada = false
    and exists (
      select 1 from public.lives l
      where l.id = live_id and l.status = 'ao_vivo' and public.teeds_pode_assistir(l.marca)
        and (do_moderador = false or public.teeds_sou_admin_da(l.marca))
        and (l.chat_aberto or public.teeds_sou_admin_da(l.marca))
    )
    and not exists (select 1 from public.live_silenciados s where s.live_id = live_mensagens.live_id and s.user_id = (select auth.uid()))
  );
