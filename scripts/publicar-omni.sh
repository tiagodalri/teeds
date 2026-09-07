#!/usr/bin/env bash
#
# Monta a OMNI e publica no repositorio dela.
#
#   bash scripts/publicar-omni.sh
#
# Por que um repositorio separado: o GitHub Pages aceita UM dominio proprio
# por repositorio, e o da Teeds ja esta ocupado. O codigo continua sendo um
# so — este script apenas leva o resultado do build para a outra casa.
#
set -euo pipefail
cd "$(dirname "$0")/.."

# HTTPS, e nao SSH: e assim que este Mac ja guarda a credencial do GitHub.
REPO="${REPO_OMNI:-https://github.com/tiagodalri/omni.git}"
DOMINIO="omnifinanc.com"
CLONE=".omni-publicacao"     # ignorado pelo git deste repositorio

echo "== 1/4 montando os dois e conferindo a separacao =="
# Monta a OMNI e a Teeds e confere que uma mudanca de casca nao vazou para a
# outra marca. Se vazou, para aqui — melhor nao publicar do que publicar
# uma Teeds alterada sem querer.
bash scripts/conferir-separacao.sh

echo "== 2/4 preparando a casa =="
if [ ! -d "$CLONE/.git" ]; then
  rm -rf "$CLONE"
  git clone --quiet "$REPO" "$CLONE" 2>/dev/null || {
    printf '\nNao consegui clonar %s\n' "$REPO"
    printf 'Crie o repositorio vazio no GitHub primeiro, ou passe outro:\n'
    printf '  REPO_OMNI=git@github.com:usuario/nome.git bash scripts/publicar-omni.sh\n\n'
    exit 1
  }
fi
git -C "$CLONE" fetch --quiet origin || true
git -C "$CLONE" checkout --quiet -B main
git -C "$CLONE" reset --quiet --hard "origin/main" 2>/dev/null || true

echo "== 3/4 copiando o site =="
# Apaga o que era e poe o que e — menos o .git, que e a identidade do clone.
find "$CLONE" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R docs-omni/. "$CLONE/"

# O CNAME e o que diz ao GitHub Pages qual dominio serve este repositorio.
printf '%s\n' "$DOMINIO" > "$CLONE/CNAME"

echo "== 4/4 publicando =="
git -C "$CLONE" add -A
if git -C "$CLONE" diff --cached --quiet; then
  echo "Nada mudou desde a ultima publicacao."
  exit 0
fi
git -C "$CLONE" commit --quiet -m "OMNI: $(date '+%Y-%m-%d %H:%M')"
git -C "$CLONE" push --quiet origin main
echo
echo "Publicado. Em um minuto o site responde em https://${DOMINIO}"
