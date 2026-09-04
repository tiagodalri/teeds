#!/usr/bin/env bash
#
# Deixa o servidor pronto: dependencias, build e o Caddy servindo o login
# com certificado valido (Let's Encrypt automatico via nip.io).
#
# Existe porque o console web da DigitalOcean embaralha comando longo — aqui
# tudo vira uma linha so: bash servidor/instalar.sh
#
set -euo pipefail
cd "$(dirname "$0")"

IP=$(curl -s --max-time 10 https://api.ipify.org || echo "198.211.96.238")
DOMINIO="${IP//./-}.nip.io"

echo "== 1/4 dependencias =="
npm install --no-audit --no-fund --silent

echo "== 2/4 build =="
npm run build 2>&1 | tail -2

echo "== 3/4 Caddy (certificado automatico) =="
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl >/dev/null 2>&1
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq >/dev/null 2>&1
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy >/dev/null 2>&1
fi

cat > /etc/caddy/Caddyfile <<CADDY
${DOMINIO} {
  reverse_proxy 127.0.0.1:8080
}
CADDY
systemctl reload caddy 2>/dev/null || systemctl restart caddy

echo "== 4/4 servico do login =="
cat > /etc/systemd/system/teeds-login.service <<UNIT
[Unit]
Description=Login da Deriv para o motor da Teeds
After=network.target

[Service]
Type=simple
WorkingDirectory=$(pwd)
Environment=RETORNO=https://${DOMINIO}/callback
ExecStart=/usr/bin/node $(pwd)/dist/login.mjs
Restart=on-failure
User=root

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable -q teeds-login 2>/dev/null || true
systemctl restart teeds-login
sleep 2

echo
echo "-------------------------------------------------"
echo " Login no ar. Abra no navegador:"
echo
echo "   https://${DOMINIO}"
echo
echo " Endereco de retorno para cadastrar na Deriv:"
echo "   https://${DOMINIO}/callback"
echo "-------------------------------------------------"
systemctl is-active teeds-login caddy | tr '\n' ' '; echo
