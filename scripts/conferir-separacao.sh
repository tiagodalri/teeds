#!/usr/bin/env bash
#
# A trava da casca: uma mudanca so na OMNI nao pode mudar a Teeds (nem o contrario).
#
#   npm run separacao
#
# Como confere: monta os dois sites e compara a impressao digital dos arquivos
# gerados com a do ULTIMO COMMIT — nao com o que estava na pasta, porque a
# pasta pode ter sobra de um build com fontes que ja foram desfeitas. Depois
# olha o que mudou nas fontes desde o commit. Se so a casca de UMA marca mudou
# e o site da OUTRA saiu diferente, falha — e diz qual arquivo.
#
# A referencia da Teeds e a propria pasta docs/ guardada no commit. A da OMNI
# (docs-omni/ nao e versionada aqui: ela vive no repositorio dela) e o arquivo
# scripts/digital-omni.txt, que este script atualiza ao final de cada
# conferencia bem-sucedida e que entra no commit junto com a mudanca.
#
# Por que isso e confiavel: o build e deterministico. Fonte igual, saida igual,
# byte a byte. Entao "saiu diferente do commit" so tem duas explicacoes: uma
# fonte que aquela marca usa mudou, ou alguem fez commit de fonte sem montar.
set -euo pipefail
cd "$(dirname "$0")/.."

REF_OMNI="scripts/digital-omni.txt"

digital_disco() {  # impressao digital dos gerados de uma pasta, no disco
  local pasta="$1"
  [ -d "$pasta/assets" ] || return 0
  (cd "$pasta/assets" && find . -type f \( -name '*.js' -o -name '*.css' \) | sort | while read -r f; do
     printf '%s  %s\n' "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$f"; done)
}
digital_commit_teeds() {  # a mesma impressao, lida do ultimo commit
  git ls-tree --name-only HEAD docs/assets/ 2>/dev/null | grep -E '\.(js|css)$' | sort | while read -r f; do
    printf '%s  ./%s\n' "$(git show "HEAD:$f" | shasum -a 256 | cut -d' ' -f1)" "$(basename "$f")"; done
}

ANTES_TEEDS="$(digital_commit_teeds)"
ANTES_OMNI="$(git show "HEAD:$REF_OMNI" 2>/dev/null || true)"

echo "→ montando a Teeds…";            npm run build --silent >/dev/null
echo "→ montando a OMNI…";  MARCA=omni npm run build --silent >/dev/null

DEPOIS_TEEDS="$(digital_disco docs)"
DEPOIS_OMNI="$(digital_disco docs-omni)"

teeds_mudou=0; [ "$ANTES_TEEDS" != "$DEPOIS_TEEDS" ] && teeds_mudou=1
omni_mudou=0;  omni_sem_ref=0
if [ -z "$ANTES_OMNI" ]; then omni_sem_ref=1; else [ "$ANTES_OMNI" != "$DEPOIS_OMNI" ] && omni_mudou=1; fi

# O que mudou nas fontes desde o ultimo commit (alterado, novo ou apagado), um a um.
MUDADOS="$(git status --porcelain -uall -- src public index.html vite.config.ts tsconfig.json package.json 2>/dev/null | sed -E 's/^.{3}//; s/^.* -> //')"

so_omni=1; so_teeds=1; nada=1
while IFS= read -r f; do
  [ -z "$f" ] && continue
  nada=0
  case "$f" in
    src/casca/omni/*)  so_teeds=0 ;;
    src/casca/teeds/*) so_omni=0 ;;
    *) so_omni=0; so_teeds=0 ;;
  esac
done <<< "$MUDADOS"

rotulo() { [ "$1" = 1 ] && echo 'MUDOU em relacao ao commit' || echo 'identico ao commit'; }
echo
printf '  %-20s %s\n' "fontes alteradas:" "$( [ "$nada" = 1 ] && echo 'nenhuma' || echo "$MUDADOS" | wc -l | tr -d ' ')"
printf '  %-20s %s\n' "site da Teeds:" "$(rotulo $teeds_mudou)"
printf '  %-20s %s\n' "site da OMNI:"  "$( [ "$omni_sem_ref" = 1 ] && echo 'sem referencia ainda (gravando agora)' || rotulo $omni_mudou)"

falhou=0
if [ "$nada" = 0 ] && [ "$so_omni" = 1 ] && [ "$teeds_mudou" = 1 ]; then
  echo; echo "✕ A mudanca era so na casca da OMNI, mas o site da Teeds saiu diferente."; falhou=1
fi
if [ "$nada" = 0 ] && [ "$so_teeds" = 1 ] && [ "$omni_mudou" = 1 ]; then
  echo; echo "✕ A mudanca era so na casca da Teeds, mas o site da OMNI saiu diferente."; falhou=1
fi
# A referencia da OMNI so e regravada quando a conferencia passa. Se alguem
# montou e guardou fonte sem rodar a trava, a referencia envelhece e a trava
# passaria a barrar para sempre. ACEITAR_OMNI=1 diz "esta montagem e a boa":
# regrava a referencia e segue. So a da OMNI — a da Teeds e o proprio commit.
if [ "$nada" = 1 ] && [ "$omni_mudou" = 1 ] && [ "${ACEITAR_OMNI:-0}" = 1 ]; then
  echo; echo "• Aceitando a montagem atual da OMNI como nova referencia (ACEITAR_OMNI=1)."
  omni_mudou=0
fi
if [ "$nada" = 1 ] && { [ "$teeds_mudou" = 1 ] || [ "$omni_mudou" = 1 ]; }; then
  echo; echo "✕ Nenhuma fonte mudou, mas o site nao bate com o do commit: alguem guardou fonte sem montar,"
  echo "  ou o build deixou de ser deterministico. Monte e faca commit de docs/ e de $REF_OMNI."
  echo "  Se a montagem atual da OMNI e a boa: ACEITAR_OMNI=1 npm run separacao"; falhou=1
fi

if [ "$falhou" = 1 ]; then
  [ "$nada" = 0 ] && { echo "  Arquivos alterados:"; echo "$MUDADOS" | sed 's/^/    /'; }
  # Sobra na pasta (arquivo gerado por um build antigo, que o git nem ve) e a
  # causa mais comum de "nao bate sem fonte ter mudado" — e vai publicado.
  SOBRAS="$(comm -13 <(echo "$ANTES_TEEDS" | awk '{print $2}' | sort) <(echo "$DEPOIS_TEEDS" | awk '{print $2}' | sort))"
  [ -n "$SOBRAS" ] && { echo "  Em docs/assets ha arquivo que o commit nao conhece (sobra de build antigo?):"; echo "$SOBRAS" | sed 's/^/    docs\/assets\//'; }
  exit 1
fi

# Referencia da OMNI para a proxima conferencia — entra no commit junto.
printf '%s\n' "$DEPOIS_OMNI" > "$REF_OMNI"
echo; echo "✓ Separacao conferida."
