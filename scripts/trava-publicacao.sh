# Trava de publicação (lido por publicar-globalfly.sh e publicar-omni.sh).
#
# Regra do Tiago (27/11/2026): várias sessões mexem nas plataformas ao mesmo
# tempo, e uma publicação NUNCA pode desfazer o que outra pôs no ar.
# Já aconteceu três vezes (10/11, 16/11, 27/11): alguém publicou a partir de
# uma base velha, ou de um ramo fora da main, e a publicação seguinte apagou
# a mudança do site.
#
# Por isso:
#   1. Só se publica o que está na main do GitHub: HEAD tem de ser
#      exatamente origin/main, sem nada por commitar no código.
#   2. Cada publicação grava no site o commit de onde veio (.fonte). A
#      próxima só passa se partir desse commit ou de um mais novo.
#   3. Logo antes de enviar, confere de novo se a main não andou durante a
#      montagem. Se andou, para: quem subiu o mais novo publica.
#
# Não existe atalho para pular a trava. Se ela parar você, junte seu
# trabalho na main (git fetch, rebase ou merge, push) e publique de novo.

trava_falha() {
  printf '\n*** PUBLICAÇÃO BLOQUEADA ***\n%s\n\n' "$1" >&2
  printf 'Nada foi publicado. Junte o trabalho na main (git fetch; git rebase origin/main; git push) e rode de novo.\n\n' >&2
  exit 1
}

trava_conferir_base() {
  git fetch --quiet origin main || trava_falha "Não consegui buscar a main do GitHub."
  local sujo
  sujo="$(git status --porcelain --untracked-files=all -- src public index.html laboratorio.html vite.config.ts package.json 2>/dev/null || true)"
  [ -z "$sujo" ] || trava_falha "Há código não commitado (iria para o site sem estar na main):
$sujo"
  local h m
  h="$(git rev-parse HEAD)"; m="$(git rev-parse origin/main)"
  if [ "$h" != "$m" ]; then
    if git merge-base --is-ancestor HEAD origin/main; then
      trava_falha "Esta pasta está ATRÁS da main ($(git rev-list --count HEAD..origin/main) commits de outras sessões). Publicar daqui apagaria essas mudanças do site."
    elif git merge-base --is-ancestor origin/main HEAD; then
      trava_falha "Há commits aqui que ainda não estão na main ($(git rev-list --count origin/main..HEAD)). Dê push na main antes de publicar."
    else
      trava_falha "Esta pasta e a main se separaram (ramo fora da main). Publicar daqui apagaria o que só está na main."
    fi
  fi
  TRAVA_FONTE="$h"
}

# $1 = pasta do clone do site (já em origin/main do site, antes de apagar)
trava_conferir_site() {
  local clone="$1" anterior
  anterior="$(cat "$clone/.fonte" 2>/dev/null || true)"
  if [ -n "$anterior" ]; then
    git cat-file -e "$anterior^{commit}" 2>/dev/null || git fetch --quiet origin || true
    git merge-base --is-ancestor "$anterior" "$TRAVA_FONTE" 2>/dev/null \
      || trava_falha "O site no ar veio do commit ${anterior:0:8}, que NÃO está na base desta publicação. Publicar apagaria o que ele pôs no ar."
  fi
  git fetch --quiet origin main || trava_falha "Não consegui buscar a main do GitHub."
  [ "$(git rev-parse origin/main)" = "$TRAVA_FONTE" ] \
    || trava_falha "A main andou durante a montagem (outra sessão subiu código). Esta publicação ficou velha."
}
