# -*- coding: utf-8 -*-
"""
Peças da Legacy Pro para o site (25/11/2026, manual da marca v1.0).

    python3 scripts/marca-legacypro/gerar.py

Gera, a partir da geometria oficial (logo.py, a mesma do brandbook):
  public/pwa-legacypro/     ícones, favicon, atalhos e telas de abertura do app
  sobrepor-legacypro/       peças que entram POR CIMA das da GlobalFly, com o mesmo nome,
                            só no site da Legacy Pro (ver vite.config.ts)
Precisa do Google Chrome (desenha os SVG) e do Pillow.
"""
import os, sys, subprocess, json, shutil
from PIL import Image, ImageFilter
import numpy as np
AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
sys.path.insert(0, AQUI)
import logo as L
CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
PWA = os.path.join(RAIZ, 'public', 'pwa-legacypro')
SOBRE = os.path.join(RAIZ, 'sobrepor-legacypro')
CARBONO = (8, 8, 10)
TMP = os.path.join(AQUI, '.tmp')
os.makedirs(TMP, exist_ok=True)


def desenhar(miolo, w, h, largura):
    """SVG (miolo na caixa w x h) -> imagem RGBA com `largura` px, fundo transparente."""
    alt = int(round(largura * h / w))
    html = os.path.join(TMP, 't.html'); png = os.path.join(TMP, 't.png')
    open(html, 'w').write('<body style="margin:0;background:transparent">%s</body>' % L.svg(miolo, w, h, 0, 'width="%d" height="%d" style="display:block"' % (largura, alt)))
    for tentativa in range(4):          # o Chrome sem janela às vezes trava ao abrir: tempo limite e nova tentativa
        if os.path.exists(png):
            os.remove(png)
        try:
            subprocess.run([CH, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--user-data-dir=' + os.path.join(TMP, 'perfil'),
                            '--default-background-color=00000000', '--screenshot=' + png, '--window-size=%d,%d' % (largura, alt), 'file://' + html],
                           stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL, timeout=40)
        except subprocess.TimeoutExpired:
            continue
        if os.path.exists(png):
            return Image.open(png).convert('RGBA').copy()
    raise SystemExit('o Chrome nao desenhou a peca')


def tela(peca, w, h, fracao, fundo=None, dy=0.0):
    """peça centrada numa tela w x h, ocupando `fracao` da largura."""
    lw = max(1, int(round(w * fracao)))
    p = peca.resize((lw, max(1, int(round(lw * peca.height / peca.width)))), Image.LANCZOS)
    t = Image.new('RGBA', (w, h), (fundo + (255,)) if fundo else (0, 0, 0, 0))
    t.alpha_composite(p, ((w - p.width) // 2, int(round((h - p.height) / 2 + dy * h))))
    return t


def salvar(im, *caminho, **kw):
    f = os.path.join(*caminho)
    os.makedirs(os.path.dirname(f), exist_ok=True)
    im.save(f, **kw)


mono_metal = desenhar(L.monograma('premium'), 100, 100, 1600)
mono_noite = desenhar(L.monograma('noite'), 100, 100, 1600)       # ouro + platina, para fundo escuro
mono_claro = desenhar(L.monograma('clara'), 100, 100, 1600)       # ouro + chumbo, para fundo claro
mh, wh, hh = L.assinatura_horizontal('premium', trilha=False)
ass_escura = desenhar(mh, wh, hh, 2400)
mh2, _, _ = L.assinatura_horizontal('clara')
ass_clara = desenhar(mh2, wh, hh, 2400)
mv, wv, hv = L.assinatura_vertical('premium', trilha=False)
ass_vertical = desenhar(mv, wv, hv, 2000)

# ---------- ícones do app ----------
if os.path.islink(PWA):
    os.unlink(PWA)
os.makedirs(PWA, exist_ok=True)
for nome, lado, f in [('icon-512.png', 512, .5), ('icon-192.png', 192, .5), ('icon-180.png', 180, .5), ('icon-167.png', 167, .5), ('icon-152.png', 152, .5),
                      ('icon-maskable-512.png', 512, .4), ('icon-maskable-192.png', 192, .4)]:
    salvar(tela(mono_metal, lado, lado, f, CARBONO), PWA, nome, optimize=True)
# favicons: sem degradê (manual, pág. 15), monograma maior para ler em 16 px
for lado, f in [(128, .68), (64, .72), (48, .76), (32, .78), (16, .84)]:
    salvar(tela(mono_noite, lado, lado, f, CARBONO), PWA, 'favicon-%d.png' % lado, optimize=True)
Image.open(os.path.join(PWA, 'favicon-48.png')).save(os.path.join(PWA, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
os.remove(os.path.join(PWA, 'favicon-48.png'))
import base64
open(os.path.join(PWA, 'icon.svg'), 'w').write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image href="data:image/png;base64,%s" width="512" height="512"/></svg>\n' % base64.b64encode(open(os.path.join(PWA, 'icon-512.png'), 'rb').read()).decode())
# monocromático e selo de notificação: só a forma, em branco
branco = Image.new('RGBA', mono_metal.size, (255, 255, 255, 0)); branco.putalpha(mono_metal.getchannel('A'))
salvar(tela(branco, 512, 512, .42), PWA, 'icon-monocromatico-512.png', optimize=True)
salvar(tela(branco, 96, 96, .6), PWA, 'badge-96.png', optimize=True)
# atalhos: o desenho de cada tela em ouro sobre o carbono
ATALHOS = {
    'robos': 'M10 4l1.8 4.9L16.7 10.7l-4.9 1.8L10 17.4l-1.8-4.9L3.3 10.7l4.9-1.8z M18 3v4 M16 5h4 M18.5 15.5v4 M16.5 17.5h4',
    'operar': 'M6 5v14 M4 8h4v7H4z M12 3v12 M10 5h4v6h-4z M18 9v12 M16 12h4v6h-4z',
    'aulas': 'M4 5h16v11H4z M10 8.5v4l3.5-2z M8 20h8',
}
for nome, d in ATALHOS.items():
    im = desenhar('<rect width="192" height="192" fill="#08080A"/><g transform="translate(48 48) scale(4)" fill="none" stroke="#C9A24A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="%s"/></g>' % d, 192, 192, 192)
    salvar(im, PWA, 'atalhos', nome + '.png', optimize=True)
# abertura do app (a mesma imagem das telas de abertura do iPhone, ver aberturaDoApp no vite.config.ts)
salvar(ass_escura.resize((1200, int(round(1200 * ass_escura.height / ass_escura.width))), Image.LANCZOS), PWA, 'abertura.png', optimize=True)
SPLASH = [[440, 956, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3], [375, 812, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3],
          [375, 667, 2], [320, 568, 2], [1024, 1366, 2], [834, 1194, 2], [820, 1180, 2], [810, 1080, 2], [768, 1024, 2], [744, 1133, 2]]
for w, h, e in SPLASH:
    salvar(tela(ass_escura, w * e, h * e, .36 if w >= 700 else .58, CARBONO).convert('RGB'), PWA, 'splash', '%dx%d.png' % (w * e, h * e))
json.dump(SPLASH, open(os.path.join(PWA, 'splash', 'telas.json'), 'w'), separators=(',', ':'))

# ---------- peças que cobrem as da GlobalFly ----------
shutil.rmtree(SOBRE, ignore_errors=True)
# o monograma justo ao lado do nome das I.A. (mesma tela das peças da GF: 546 x 315)
salvar(tela(mono_noite, 546, 315, 315 / 546.0), SOBRE, 'globalfly-gf-escuro.png', optimize=True)
salvar(tela(mono_claro, 546, 315, 315 / 546.0), SOBRE, 'globalfly-gf-claro.png', optimize=True)
# o monograma solto (selo do menu, marca d'água, favicon de reserva)
salvar(tela(mono_noite, 256, 256, .62), SOBRE, 'globalfly-marca.png', optimize=True)
salvar(tela(mono_claro, 256, 256, .62), SOBRE, 'globalfly-monograma-claro.png', optimize=True)
# a assinatura (cabeçalho, e-mails, estúdio): mesma tela 900 x 283
salvar(tela(ass_escura, 900, 283, 1.0), SOBRE, 'globalfly-assinatura.png', optimize=True)
salvar(tela(ass_clara, 900, 283, 1.0), SOBRE, 'globalfly-assinatura-clara.png', optimize=True)


def fundo_chumbo(w, h, foco=(0.3, 0.2)):
    """superfície de chumbo com uma luz suave, para fundos de câmera e de compartilhamento."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((x / w - foco[0]) * 1.2) ** 2 + ((y / h - foco[1]) * 0.9) ** 2)
    v = np.clip(1 - d / 1.1, 0, 1) ** 1.6
    base = np.array([10, 10, 12], np.float32); luz = np.array([38, 39, 43], np.float32)
    return Image.fromarray((base + (luz - base) * v[:, :, None]).astype(np.uint8), 'RGB').convert('RGBA')


# fundo de câmera da live: chumbo com o monograma apagado à direita
f = fundo_chumbo(1920, 1080)
m = mono_metal.resize((520, 520), Image.LANCZOS); m.putalpha(m.getchannel('A').point(lambda a: int(a * .32)))
f.alpha_composite(m, (1920 - 520 - 190, (1080 - 520) // 2))
salvar(f.convert('RGB'), SOBRE, 'fundos-globalfly', 'monograma-gf.jpg', quality=90)
salvar(f.convert('RGB').resize((320, 180), Image.LANCZOS), SOBRE, 'fundos-globalfly', 'monograma-gf-mini.jpg', quality=85)
# imagem de compartilhamento do cadastro (1200 x 630)
f = fundo_chumbo(1200, 630, (0.5, 0.35))
v = ass_vertical.resize((430, int(round(430 * ass_vertical.height / ass_vertical.width))), Image.LANCZOS)
f.alpha_composite(v, ((1200 - v.width) // 2, (630 - v.height) // 2))
salvar(f.convert('RGB'), SOBRE, 'globalfly-cadastro-compartilhar.jpg', quality=90)


def para_chumbo(origem, destino, **kw):
    """as cenas do login: o céu azul vira chumbo, a luz quente do horizonte vira o ouro da marca."""
    im = Image.open(origem).convert('RGB')
    a = np.asarray(im).astype(np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(-1); mn = a.min(-1); lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    quente = np.clip((r - b) / (mx + 1e-4), 0, 1) * np.clip((r - g * 0.6) * 3, 0, 1)   # 0 = frio/neutro, 1 = laranja
    quente = np.clip(quente * 1.4, 0, 1) ** 0.9
    cinza = np.stack([lum * 0.97, lum * 0.98, lum * 1.04], -1) * 0.82                   # chumbo levemente frio, mais escuro
    ouro = np.stack([lum * 1.62, lum * 1.12, lum * 0.42], -1)                           # a luz quente puxa para o ouro
    out = cinza * (1 - quente[..., None]) + ouro * quente[..., None]
    out = np.clip(out, 0, 1) ** 1.06
    salvar(Image.fromarray((out * 255).astype(np.uint8), 'RGB'), destino, **kw)


for n in ['nuvens', 'rastro', 'nuvens-celular', 'rastro-celular']:
    para_chumbo(os.path.join(RAIZ, 'public', 'login-globalfly', n + '.webp'), os.path.join(SOBRE, 'login-globalfly', n + '.webp'), quality=82, method=4)

shutil.rmtree(TMP, ignore_errors=True)
print('ok:', sum(len(f) for _, _, f in os.walk(PWA)), 'arquivos em pwa-legacypro,', sum(len(f) for _, _, f in os.walk(SOBRE)), 'em sobrepor-legacypro')
