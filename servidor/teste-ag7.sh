#!/usr/bin/env bash
#
# Atalho do primeiro teste: liga o AG7 na conta demo com freios curtos.
#
# Existe para o Tiago poder rodar digitando pouco no console web, que
# engole caracteres em comando longo. Quem liga o robo e ele, nao o
# assistente: e uma operacao financeira, ainda que em dinheiro ficticio.
#
cd "$(dirname "$0")"
echo
echo "AG7 · conta demo · entrada 0.35 · stop 2 · gain 1 · maximo 8 operacoes"
echo
node dist/teste.mjs --robo superior5 --entrada 0.35 --stop 2 --gain 1 --max 8
