#!/usr/bin/env bash
#
# Monta a Legacy Pro e publica no repositorio dela (24/11/2026, copia do
# publicar-globalfly.sh).
#
#   bash scripts/publicar-legacypro.sh
#
# Por que um repositorio separado: o GitHub Pages aceita UM dominio proprio
# por repositorio, e o da Teeds e o da OMNI ja estao ocupados. O codigo continua sendo um
# so — este script apenas leva o resultado do build para a outra casa.
#
set -euo pipefail
cd "$(dirname "$0")/.."

# Trava: só publica o que está na main e nunca algo mais velho que o site no ar.
. scripts/trava-publicacao.sh
trava_conferir_base

# HTTPS, e nao SSH: e assim que este Mac ja guarda a credencial do GitHub.
REPO="${REPO_LEGACYPRO:-https://github.com/tiagodalri/legacypro.git}"
DOMINIO="legacyprotrade.com"
CLONE=".legacypro-publicacao"     # ignorado pelo git deste repositorio

echo "== 1/4 montando os dois e conferindo a separacao =="
# Monta as tres marcas e confere que uma mudanca de casca nao vazou para a
# outra marca. Se vazou, para aqui — melhor nao publicar do que publicar
# uma Teeds alterada sem querer.
# JA_CONFERIDO=1: a separação acabou de ser conferida (e os sites montados)
# na mesma publicação; não monta as três marcas de novo.
[ "${JA_CONFERIDO:-0}" = "1" ] || bash scripts/conferir-separacao.sh
# A trava monta Teeds, OMNI e GlobalFly; a Legacy Pro se monta aqui.
MARCA=legacypro npm run build --silent >/dev/null

echo "== 2/4 preparando a casa =="
if [ ! -d "$CLONE/.git" ]; then
  rm -rf "$CLONE"
  git clone --quiet "$REPO" "$CLONE" 2>/dev/null || {
    printf '\nNao consegui clonar %s\n' "$REPO"
    printf 'Crie o repositorio vazio no GitHub primeiro, ou passe outro:\n'
    printf '  REPO_LEGACYPRO=git@github.com:usuario/nome.git bash scripts/publicar-legacypro.sh\n\n'
    exit 1
  }
fi
git -C "$CLONE" fetch --quiet origin || true
git -C "$CLONE" checkout --quiet -B main
git -C "$CLONE" reset --quiet --hard "origin/main" 2>/dev/null || true
trava_conferir_site "$CLONE"

echo "== 3/4 copiando o site =="
# Apaga o que era e poe o que e — menos o .git, que e a identidade do clone.
find "$CLONE" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R docs-legacypro/. "$CLONE/"

# O CNAME e o que diz ao GitHub Pages qual dominio serve este repositorio.
printf '%s\n' "$DOMINIO" > "$CLONE/CNAME"
# De qual commit da main veio este site (a próxima publicação confere).
printf '%s\n' "$TRAVA_FONTE" > "$CLONE/.fonte"

echo "== 4/4 publicando =="
git -C "$CLONE" add -A
if git -C "$CLONE" diff --cached --quiet; then
  echo "Nada mudou desde a ultima publicacao."
  exit 0
fi
git -C "$CLONE" commit --quiet -m "Legacy Pro: $(date '+%Y-%m-%d %H:%M') (fonte ${TRAVA_FONTE:0:8})"
git -C "$CLONE" push --quiet origin main
echo
echo "Publicado. Em um minuto o site responde em https://${DOMINIO}"
