#!/usr/bin/env bash
#
# A trava da casca: uma mudanca so na OMNI nao pode mudar a Teeds (nem o contrario).
#
#   npm run separacao
#
# Como confere: tira a impressao digital dos arquivos gerados de cada site,
# monta os dois de novo, tira de novo e compara. Depois olha o que mudou nas
# fontes desde o ultimo commit. Se so a casca de UMA marca mudou e o site da
# OUTRA saiu diferente, falha — e diz qual arquivo.
#
# Por que isso e confiavel: o build e deterministico. Fonte igual, saida igual,
# byte a byte. Entao "saiu diferente" significa "alguma fonte que a Teeds usa
# mudou" — exatamente o que a regra proibe quando a mudanca era so da OMNI.
set -euo pipefail
cd "$(dirname "$0")/.."

digital() {  # impressao digital dos arquivos gerados de uma marca
  local pasta="$1"
  if [ -d "$pasta/assets" ]; then
    (cd "$pasta/assets" && find . -type f \( -name '*.js' -o -name '*.css' \) | sort | xargs shasum -a 256 2>/dev/null) || true
  fi
}

ANTES_TEEDS="$(digital docs)"
ANTES_OMNI="$(digital docs-omni)"

echo "→ montando a Teeds…";            npm run build --silent >/dev/null
echo "→ montando a OMNI…";  MARCA=omni npm run build --silent >/dev/null

DEPOIS_TEEDS="$(digital docs)"
DEPOIS_OMNI="$(digital docs-omni)"

teeds_mudou=0; [ "$ANTES_TEEDS" != "$DEPOIS_TEEDS" ] && teeds_mudou=1
omni_mudou=0;  [ "$ANTES_OMNI"  != "$DEPOIS_OMNI"  ] && omni_mudou=1

# O que mudou nas fontes desde o ultimo commit (alterado, novo ou apagado).
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

echo
printf '  %-28s %s\n' "fontes alteradas:" "$( [ "$nada" = 1 ] && echo 'nenhuma' || echo "$MUDADOS" | wc -l | tr -d ' ')"
printf '  %-28s %s\n' "site da Teeds:" "$( [ "$teeds_mudou" = 1 ] && echo 'MUDOU' || echo 'identico')"
printf '  %-28s %s\n' "site da OMNI:"  "$( [ "$omni_mudou"  = 1 ] && echo 'MUDOU' || echo 'identico')"

falhou=0
if [ "$nada" = 0 ] && [ "$so_omni" = 1 ] && [ "$teeds_mudou" = 1 ]; then
  echo; echo "✕ A mudanca era so na casca da OMNI, mas o site da Teeds saiu diferente."; falhou=1
fi
if [ "$nada" = 0 ] && [ "$so_teeds" = 1 ] && [ "$omni_mudou" = 1 ]; then
  echo; echo "✕ A mudanca era so na casca da Teeds, mas o site da OMNI saiu diferente."; falhou=1
fi
if [ "$nada" = 1 ] && { [ "$teeds_mudou" = 1 ] || [ "$omni_mudou" = 1 ]; }; then
  echo; echo "✕ Nenhuma fonte mudou e mesmo assim um site saiu diferente — o build deixou de ser deterministico."; falhou=1
fi

if [ "$falhou" = 1 ]; then
  echo "  Arquivos alterados:"; echo "$MUDADOS" | sed 's/^/    /'
  exit 1
fi
echo; echo "✓ Separacao conferida."
