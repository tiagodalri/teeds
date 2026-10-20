#!/bin/bash
# a cada 2 s: CPU total, CPU do harness (robôs), da Deriv falsa, do servidor real, memória livre
H=$(pgrep -f carga-robos.mjs | head -1); F=$(pgrep -f deriv-falsa.mjs | head -1); S=$(pgrep -f dist/servidor.mjs | head -1)
tick() { awk '{print $14+$15}' /proc/$1/stat 2>/dev/null || echo 0; }
rss() { awk '/VmRSS/{print int($2/1024)}' /proc/$1/status 2>/dev/null || echo 0; }
read -r _ a b c d e f g h _ < /proc/stat; T0=$((a+b+c+d+e+f+g+h)); I0=$d; H0=$(tick $H); F0=$(tick $F); S0=$(tick $S)
echo "hora,cpu_total,cpu_robos,cpu_deriv_falsa,cpu_servidor_real,mem_livre_mb,rss_robos_mb"
while kill -0 $H 2>/dev/null; do
  sleep 2
  read -r _ a b c d e f g h _ < /proc/stat; T1=$((a+b+c+d+e+f+g+h)); I1=$d; H1=$(tick $H); F1=$(tick $F); S1=$(tick $S)
  DT=$((T1-T0)); [ $DT -eq 0 ] && DT=1
  echo "$(date +%T),$((100*(DT-(I1-I0))/DT)),$((100*(H1-H0)/DT)),$((100*(F1-F0)/DT)),$((100*(S1-S0)/DT)),$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo),$(rss $H)"
  T0=$T1; I0=$I1; H0=$H1; F0=$F1; S0=$S1
done
