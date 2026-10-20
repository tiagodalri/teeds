-- 20/10/2026: as lives de verdade da GlobalFly ficam desligadas por ora
-- (livesAoVivo: false em src/marca/marcas.ts; o foco é a sala de treino).
-- O link público das lives, ligado na fase de testes, fecha junto.
update public.aovivo_config set link_publico = false where marca = 'globalfly';
