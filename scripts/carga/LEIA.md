# Teste de carga (20/10/2026)

Robôs (motor de verdade contra uma Deriv falsa) e sala de treino (LiveKit).

**Robôs**, no servidor:
1. `cd servidor && npx esbuild ../scripts/carga/carga-robos.ts --bundle --platform=node --target=node22 --format=esm --outfile=/tmp/carga-robos.mjs`
2. Copiar `carga-robos.mjs`, `deriv-falsa.mjs`, `rodar.sh` e `medir-robos.sh` para `/root/carga/` e gerar
   `chave.pem`/`cert.pem` (`openssl req -x509 -newkey rsa:2048 -nodes -keyout chave.pem -out cert.pem -days 2 -subj "/CN=127.0.0.1"`).
3. `./rodar.sh 100 90` (robôs, segundos). Apagar `/root/carga` no fim.

**Sala de treino**, daqui: baixar o `lk` (github.com/livekit/livekit-cli), pôr um `chaves.env` com
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` e `LIVEKIT_URL` ao lado, copiar `medir.sh` para `/root/` e rodar
`./degraus.sh 25 50 100`. Um computador só não imita mais de ~100 pessoas (a banda dele vira o teto).

Resultados de 20/10/2026 na memória do projeto (teeds-capacidade-servidor).

# Teste v2 (08/11/2026)

`carga-v2.ts` aceita `IDS` (estratégias em rodízio), `POR_CONTA` (robôs na mesma conexão, como o mesmo cliente),
`ONDA` (robôs ligados por segundo; 100000 = todos de uma vez), `SEM_ESPELHO=1` e `LOTE=1` (monitoramento com o
carteiro em lote de `servidor/src/lote.ts`). O resumo mede o ritmo só depois de todos ligados. Montar como o v1
(trocando o arquivo) e rodar os blocos de `cenarios-v2.sh` (1: mix e Raptor; 2: 4 por cliente e rajada; 3: longo e
sem monitoramento), sempre sem ninguém operando. Resultados na memória do projeto (teeds-capacidade-servidor).
