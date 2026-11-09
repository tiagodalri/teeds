#!/bin/bash
# Roda um bloco de cenários. Uso: ./cenarios.sh <bloco>
cd /root/carga
passo() { # nome, N, duração, variáveis...
  local nome=$1 n=$2 d=$3; shift 3
  echo "== [$nome] $n robôs ($(date +%T))"
  env "$@" ./rodar.sh $n $d | sed 's/^/   /'
  sleep 8
}
case "$1" in
  1) # mistura das 5 I.A. da GF e Raptor puro, como hoje (com monitoramento)
     for n in 100 150 200 250; do passo "Mix 5 I.A." $n 90 IDS=goreme,falcon,legacy,superior5,ag2; done
     for n in 60 80 100 120; do passo "Raptor puro" $n 90 IDS=goreme; done ;;
  2) # 4 robôs por cliente na mesma conta e todo mundo apertando play junto
     for n in 100 200 300; do passo "Mix, 4 por cliente" $n 90 IDS=goreme,falcon,legacy,superior5,ag2 POR_CONTA=4; done
     for n in 80 120; do passo "Raptor, 4 por cliente" $n 90 IDS=goreme POR_CONTA=4; done
     passo "Rajada: mix todos de uma vez" 200 90 IDS=goreme,falcon,legacy,superior5,ag2 POR_CONTA=4 ONDA=100000
     passo "Rajada: Raptor todos de uma vez" 100 90 IDS=goreme POR_CONTA=4 ONDA=100000 ;;
  3) # resistência e o efeito de desligar o monitoramento
     passo "Longo: mix por 5 min" 150 300 IDS=goreme,falcon,legacy,superior5,ag2 POR_CONTA=4
     for n in 300 450 600; do passo "Mix sem monitoramento" $n 90 IDS=goreme,falcon,legacy,superior5,ag2 POR_CONTA=4 SEM_ESPELHO=1; done
     for n in 200 300; do passo "Raptor sem monitoramento" $n 90 IDS=goreme POR_CONTA=4 SEM_ESPELHO=1; done ;;
esac
echo "FIM $1"
