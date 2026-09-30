#!/usr/bin/env python3
"""
Escreve o aviãozinho do Telegram, branco e com fundo transparente.

    python3 scripts/telegram-aviao.py

Vai para `public/telegram-aviao.png` e é usado no botão do Telegram dentro
dos e-mails. Existe como PNG, e não como SVG, porque cliente de e-mail não
desenha SVG: o Gmail simplesmente apaga. E existe como script, e não como
arquivo solto, pelo mesmo motivo do `emblema.py` — daqui a um ano alguém vai
querer em outro tamanho, e trocar um número é melhor que procurar o original.

Branco sobre transparente para o botão poder ser azul do Telegram por CSS
(`bgcolor`, que todo cliente entende) sem depender de o PNG ter o fundo certo.
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
DESTINO = AQUI.parent / 'public' / 'telegram-aviao.png'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

# O traçado oficial da marca, no quadro de 24 por 24.
CAMINHO = (
    'M9.417 15.181l-.397 5.584c.568 0 .814-.244 1.109-.537l2.663-2.545 '
    '5.518 4.041c1.012.564 1.725.267 1.998-.931L23.93 3.821c.321-1.496-.541-'
    '2.081-1.527-1.714L1.386 10.212c-1.463.564-1.443 1.383-.244 1.751l5.443 '
    '1.693L19.24 5.79c.593-.394 1.132-.176.688.218L9.417 15.181z'
)
LADO = 96          # desenhado em dobro pela tela retina: sai 192 de verdade
MARGEM = 0.10      # folga em volta, para o avião não encostar na borda


def main() -> int:
    if not Path(CHROME).exists():
        print(f'não achei o Chrome em {CHROME}', file=sys.stderr)
        return 1

    pagina = AQUI / '.telegram-aviao.html'
    pagina.write_text(
        '<!doctype html><meta charset="utf-8">'
        f'<style>html,body{{margin:0;padding:0;width:{LADO}px;height:{LADO}px;'
        'background:transparent}svg{display:block;width:100%;height:100%}</style>'
        f'<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
        f'<path fill="#ffffff" d="{CAMINHO}"/></svg>',
        encoding='utf-8',
    )
    bruto = AQUI / '.telegram-aviao-bruto.png'
    subprocess.run(
        [CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
         '--default-background-color=00000000', '--force-device-scale-factor=2',
         f'--window-size={LADO},{LADO}', '--virtual-time-budget=3000',
         f'--screenshot={bruto}', pagina.as_uri()],
        check=True, capture_output=True,
    )

    # Recorta no desenho e recentraliza num quadrado: o traçado do Telegram não
    # é simétrico, e sem isto o avião fica torto dentro do botão.
    im = Image.open(bruto).convert('RGBA')
    recorte = im.crop(im.getbbox())
    lado = round(max(recorte.size) * (1 + 2 * MARGEM))
    quadro = Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
    quadro.alpha_composite(recorte, ((lado - recorte.width) // 2, (lado - recorte.height) // 2))
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    quadro.save(DESTINO, optimize=True)

    pagina.unlink(missing_ok=True)
    bruto.unlink(missing_ok=True)
    print(f'{DESTINO.relative_to(AQUI.parent)} · {quadro.width}×{quadro.height} · '
          f'{DESTINO.stat().st_size} bytes')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
