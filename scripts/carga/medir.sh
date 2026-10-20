#!/bin/bash
# mede a cada 2 s: CPU total, CPU do motor (node), CPU do LiveKit, memória livre e banda de saída (Mbps)
INT=$(ip route | awk '/default/{print $5;exit}')
NODE=$(pgrep -f "dist/servidor.mjs" | head -1); LK=$(pgrep -f livekit-server | head -1)
tick() { awk '{print $14+$15}' /proc/$1/stat 2>/dev/null; }
read -r _ a b c d e f g h _ < /proc/stat; T0=$((a+b+c+d+e+f+g+h)); I0=$d
N0=$(tick $NODE); L0=$(tick $LK); TX0=$(cat /sys/class/net/$INT/statistics/tx_bytes); RX0=$(cat /sys/class/net/$INT/statistics/rx_bytes)
echo "hora,cpu_total,cpu_motor,cpu_livekit,mem_livre_mb,saida_mbps,entrada_mbps"
while true; do
  sleep 2
  read -r _ a b c d e f g h _ < /proc/stat; T1=$((a+b+c+d+e+f+g+h)); I1=$d
  N1=$(tick $NODE); L1=$(tick $LK); TX1=$(cat /sys/class/net/$INT/statistics/tx_bytes); RX1=$(cat /sys/class/net/$INT/statistics/rx_bytes)
  DT=$((T1-T0)); [ $DT -eq 0 ] && DT=1
  echo "$(date +%T),$((100*(DT-(I1-I0))/DT)),$((100*(N1-N0)/DT)),$((100*(L1-L0)/DT)),$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo),$(( (TX1-TX0)*8/2/1000000 )),$(( (RX1-RX0)*8/2/1000000 ))"
  T0=$T1; I0=$I1; N0=$N1; L0=$L1; TX0=$TX1; RX0=$RX1
done
