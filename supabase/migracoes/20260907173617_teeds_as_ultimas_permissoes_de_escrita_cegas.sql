-- As últimas permissões cegas — e desta vez são as de ESCRITA.
--
-- A varredura anterior olhou quem PODE LER de cada tabela e parou ali. Só que
-- em Postgres as permissões se somam: uma regra antiga de gravação, deixada
-- para trás, continua valendo do lado da nova. Sobraram quatro, todas de
-- escrita, e a pior delas na tabela do dinheiro:
--
--   markup_oficial_diario — é o número que a Deriv reporta e contra o qual a
--   conferência compara. Com a regra cega de INSERT/UPDATE ainda de pé, quem
--   administra a Teeds podia gravar por cima do número da OMNI, e vice-versa.
--   Não é vazamento de leitura: é adulteração silenciosa do valor de
--   comissão de uma plataforma a partir da outra.
--
--   auditoria_admin — o registro de quem fez o quê. Cego para gravar, ele
--   aceitaria carimbar uma ação na plataforma errada, que é justamente o que
--   uma auditoria não pode deixar acontecer.
--
--   arquivo_duplicatas — a lixeira de linhas removidas em 4 de setembro,
--   quando passou a valer "uma conta da corretora por login". Nasceu antes
--   da OMNI existir, então tudo que está lá é da Teeds.

-- ---- o número oficial da Deriv: escrita só de quem administra a marca ----
drop policy if exists "admin grava o markup oficial"    on public.markup_oficial_diario;
drop policy if exists "admin atualiza o markup oficial" on public.markup_oficial_diario;

-- ---- auditoria: grava na própria plataforma, não na do vizinho ----
drop policy if exists "admin grava auditoria" on public.auditoria_admin;
create policy "admin desta marca grava auditoria" on public.auditoria_admin
  for insert to authenticated
  with check (public.teeds_sou_admin_da(marca));

-- ---- a lixeira também tem dono ----
alter table public.arquivo_duplicatas
  add column if not exists marca text not null default 'teeds';

comment on column public.arquivo_duplicatas.marca is
  'De qual plataforma veio a linha arquivada. As de 4/9/2026 são da Teeds: a OMNI ainda não existia.';

drop policy if exists "admin le o arquivo de duplicatas" on public.arquivo_duplicatas;
create policy "admin desta marca le o arquivo de duplicatas" on public.arquivo_duplicatas
  for select to authenticated
  using (public.teeds_sou_admin_da(marca));
