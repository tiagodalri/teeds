# Gera as artes do checkout da Cakto (capa, banner, banner de celular e painel) em public/checkout-globalfly/.
# Uso: python3 scripts/artes-checkout-globalfly.py  (precisa de Pillow e da fonte Avenir Next do macOS)
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

P = '/Users/tiagodalri/Desktop/Teeds/public/'
OUT = '/Users/tiagodalri/Desktop/Teeds/public/checkout-globalfly/'
os.makedirs(OUT, exist_ok=True)
AV = '/System/Library/Fonts/Avenir Next.ttc'
S = 2  # desenha em 2x e reduz: bordas suaves

NAVY = (5, 21, 40); NAVY2 = (11, 35, 64); NAVY3 = (16, 46, 82)
GOLD = (183, 141, 57); GOLD_L = (216, 185, 104)
CREAM = (244, 239, 230); STEEL = (157, 179, 204)


def f(face, px):
    idx = {'bold': 0, 'demi': 2, 'medium': 5, 'regular': 7, 'heavy': 8}[face]
    return ImageFont.truetype(AV, int(px * S), index=idx)


def foto(nome):
    """A foto com um leve tom navy e menos brilho no céu, para todas conversarem com a marca."""
    im = Image.open(P + 'robos-globalfly/' + nome).convert('RGB')
    from PIL import ImageEnhance
    im = ImageEnhance.Brightness(im).enhance(0.86)
    im = ImageEnhance.Color(im).enhance(0.85)
    tom = Image.new('RGB', im.size, (8, 28, 56))
    return Image.blend(im, tom, 0.18)


def cobrir(img, w, h, foco_x=0.5):
    """Recorta a foto para cobrir w x h, mantendo o foco horizontal."""
    r = max(w / img.width, h / img.height)
    im = img.resize((round(img.width * r), round(img.height * r)), Image.LANCZOS)
    x = int((im.width - w) * foco_x)
    y = (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def degrade_esq(w, h, ate=0.72, forca=1.0):
    """Navy sólido à esquerda sumindo para a direita, mais uma vinheta embaixo."""
    m = Image.new('L', (w, h))
    px = m.load()
    for x in range(w):
        t = x / (w * ate)
        a = 255 if t <= 0.35 else max(0, int(255 * (1 - (t - 0.35) / 0.65) ** 1.6)) if t < 1 else 0
        a = int(a * forca)
        for y in range(h):
            px[x, y] = a
    return m


def vinheta_baixo(w, h, alt=0.45, forca=200):
    m = Image.new('L', (w, h))
    d = ImageDraw.Draw(m)
    y0 = int(h * (1 - alt))
    for y in range(y0, h):
        a = int(forca * ((y - y0) / (h - y0)) ** 1.5)
        d.line([(0, y), (w, y)], fill=a)
    return m


def logo(largura):
    lg = Image.open(P + 'globalfly-assinatura.png').convert('RGBA')
    r = largura / lg.width
    return lg.resize((int(lg.width * r), int(lg.height * r)), Image.LANCZOS)


def caps(d, xy, texto, fonte, cor, esp=0.18):
    """Texto em caixa alta com espaçamento entre letras."""
    x, y = xy
    for ch in texto:
        d.text((x, y), ch, font=fonte, fill=cor)
        x += d.textlength(ch, font=fonte) + fonte.size * esp
    return x


def quebrar(d, texto, fonte, largura):
    linhas, atual = [], ''
    for p in texto.split():
        t = (atual + ' ' + p).strip()
        if d.textlength(t, font=fonte) <= largura:
            atual = t
        else:
            linhas.append(atual); atual = p
    if atual:
        linhas.append(atual)
    return linhas


def check(d, cx, cy, r):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD)
    w = max(2, int(r * 0.28))
    d.line([(cx - r * 0.45, cy + r * 0.02), (cx - r * 0.1, cy + r * 0.38), (cx + r * 0.5, cy - r * 0.35)],
           fill=NAVY, width=w, joint='curve')


def cadeado(d, x, y, s):
    d.rounded_rectangle([x, y + s * 0.42, x + s, y + s], radius=int(s * 0.14), fill=GOLD)
    d.arc([x + s * 0.2, y, x + s * 0.8, y + s * 0.8], 180, 360, fill=GOLD, width=max(2, int(s * 0.13)))
    d.line([(x + s * 0.2, y + s * 0.4), (x + s * 0.2, y + s * 0.5)], fill=GOLD, width=max(2, int(s * 0.13)))
    d.line([(x + s * 0.8, y + s * 0.4), (x + s * 0.8, y + s * 0.5)], fill=GOLD, width=max(2, int(s * 0.13)))
    d.ellipse([x + s * 0.43, y + s * 0.6, x + s * 0.57, y + s * 0.74], fill=NAVY)


def fundo_foto(prod, W, H, foco=0.5, ate=None, inicio=0.40):
    """Foto do jato (ou dos dois, no Pack) ocupando a direita, fundindo no navy à esquerda."""
    RW = W - int(W * inicio)
    if prod['fotos'] == 2:
        a = cobrir(foto('superior5.webp'), RW, H, 0.5)
        b = cobrir(foto('ag2.webp'), RW, H, 0.72)
        mask = Image.new('L', (RW, H), 0)
        corte = int(RW * 0.58)
        ImageDraw.Draw(mask).polygon([(corte, 0), (RW, 0), (RW, H), (corte - int(H * 0.32), H)], fill=255)
        reg = a.copy(); reg.paste(b, (0, 0), mask)
        ImageDraw.Draw(reg).line([(corte, 0), (corte - int(H * 0.32), H)], fill=GOLD, width=3 * S)
    else:
        reg = cobrir(foto(prod['foto']), RW, H, prod.get('foco', foco))
    base = Image.new('RGB', (W, H), NAVY)
    m = Image.new('L', (RW, H))
    px = m.load()
    faixa = int(RW * 0.62)
    for x in range(RW):
        t = x / faixa
        a = 255 if x >= faixa else int(255 * (t * t * (3 - 2 * t)) ** 1.3)
        for y in range(H):
            px[x, y] = a
    base.paste(reg, (W - RW, 0), m)
    navy = Image.new('RGB', (W, H), NAVY)
    return Image.composite(navy, base, vinheta_baixo(W, H, 0.32, 160))


def capa(prod):
    """6:5 (a Cakto recomenda 300x250). Foto na proporção original embaixo, navy em cima; o texto fica
    na faixa central, que é a parte que a lista de produtos mostra."""
    W, H = 1200 * S, 1000 * S
    sub_h = 760 * S
    pc = dict(prod); pc['foco'] = prod.get('foco_capa', prod.get('foco', 0.5))
    sub = fundo_foto(pc, W, sub_h, inicio=0.30)
    fade = Image.new('L', (W, sub_h), 255)
    fd = ImageDraw.Draw(fade)
    for y in range(int(sub_h * 0.30)):
        fd.line([(0, y), (W, y)], fill=int(255 * (y / (sub_h * 0.30)) ** 1.4))
    im = Image.new('RGB', (W, H), NAVY)
    im.paste(sub, (0, H - sub_h), fade)
    d = ImageDraw.Draw(im)
    lg = logo(230 * S); im.paste(lg, (150 * S, 120 * S), lg)
    y = 330 * S
    caps(d, (154 * S, y), prod['selo'], f('demi', 17), GOLD_L)
    y += 40 * S
    for linha in prod['titulo_capa']:
        d.text((150 * S, y), linha, font=f('demi', prod['tam_capa']), fill=CREAM)
        y += int(prod['tam_capa'] * 1.08 * S)
    y += 14 * S
    d.line([(154 * S, y), (234 * S, y)], fill=GOLD, width=3 * S)
    y += 26 * S
    d.text((154 * S, y), 'Assinatura anual  ·  Liberação automática', font=f('medium', 24), fill=STEEL)
    return im.resize((1200, 1000), Image.LANCZOS)


def faixa_email(d, x, y, w, h, tam):
    d.rounded_rectangle([x, y, x + w, y + h], radius=int(h * 0.3), fill=(11, 35, 64), outline=GOLD, width=2 * S)
    fo_b = f('demi', tam); fo = f('medium', tam)
    t1 = 'Importante: '
    t2 = 'use na compra o mesmo e-mail da sua conta GlobalFly.'
    tw = d.textlength(t1, font=fo_b) + d.textlength(t2, font=fo)
    tx = x + (w - tw) / 2; ty = y + (h - tam * S * 1.25) / 2
    d.text((tx, ty), t1, font=fo_b, fill=GOLD_L)
    d.text((tx + d.textlength(t1, font=fo_b), ty), t2, font=fo, fill=CREAM)


def banner(prod):
    """Desktop: a Cakto mostra numa coluna de 720 px. Foto à direita, título, selos e a faixa do e-mail."""
    W, H = 1200 * S, 600 * S
    im = fundo_foto(prod, W, 480 * S, inicio=0.46)
    base = Image.new('RGB', (W, H), NAVY); base.paste(im, (0, 0)); im = base
    d = ImageDraw.Draw(im)
    lg = logo(220 * S); im.paste(lg, (60 * S, 40 * S), lg)
    y = 140 * S
    caps(d, (64 * S, y), prod['selo'], f('demi', 17), GOLD_L)
    y += 36 * S
    for linha in prod['titulo_banner']:
        d.text((60 * S, y), linha, font=f('demi', prod['tam_banner']), fill=CREAM)
        y += int(prod['tam_banner'] * 1.06 * S)
    y += 8 * S
    d.text((64 * S, y), prod['frase'], font=f('medium', 25), fill=STEEL)
    x = 64 * S; yb = 400 * S
    for t in ['Acesso por 12 meses', 'Liberação automática', 'Pix ou cartão em até 12x']:
        fo = f('demi', 20)
        tw = d.textlength(t, font=fo)
        d.rounded_rectangle([x, yb, x + tw + 40 * S, yb + 46 * S], radius=23 * S, outline=GOLD, width=2 * S, fill=(11, 35, 64))
        d.text((x + 20 * S, yb + 10 * S), t, font=fo, fill=CREAM)
        x += tw + 54 * S
    faixa_email(d, 40 * S, 500 * S, W - 80 * S, 72 * S, 24)
    return im.resize((1200, 600), Image.LANCZOS)


def banner_celular(prod):
    """Celular: a tela tem ~360 px, então tudo maior e empilhado."""
    W, H = 1080 * S, 1250 * S
    im = Image.new('RGB', (W, H), NAVY)
    foto_h = 620 * S
    if prod['fotos'] == 2:
        topo = fundo_foto(prod, W, foto_h, inicio=0.0)
    else:
        topo = cobrir(foto(prod['foto']), W, foto_h, prod.get('foco_lat', 0.5))
    navy = Image.new('RGB', topo.size, NAVY)
    topo = Image.composite(navy, topo, vinheta_baixo(W, foto_h, 0.55, 255))
    im.paste(topo, (0, 0))
    d = ImageDraw.Draw(im)
    lg = logo(330 * S); im.paste(lg, (60 * S, 50 * S), lg)
    y = 560 * S
    caps(d, (66 * S, y), prod['selo'], f('demi', 30), GOLD_L)
    y += 58 * S
    for linha in prod.get('titulo_celular', prod['titulo_banner']):
        d.text((60 * S, y), linha, font=f('demi', prod.get('tam_celular', 120)), fill=CREAM)
        y += int(prod.get('tam_celular', 120) * 1.06 * S)
    y += 10 * S
    d.text((66 * S, y), prod['frase'], font=f('medium', 38), fill=STEEL)
    y += 86 * S
    x = 66 * S
    for t in ['12 meses', 'Liberação automática', 'Pix ou 12x']:
        fo = f('demi', 32); tw = d.textlength(t, font=fo)
        d.rounded_rectangle([x, y, x + tw + 52 * S, y + 70 * S], radius=35 * S, outline=GOLD, width=3 * S, fill=(11, 35, 64))
        d.text((x + 26 * S, y + 15 * S), t, font=fo, fill=CREAM)
        x += tw + 70 * S
    y += 110 * S
    # aviso do e-mail em duas linhas
    h = 150 * S
    d.rounded_rectangle([50 * S, y, W - 50 * S, y + h], radius=34 * S, fill=(11, 35, 64), outline=GOLD, width=3 * S)
    d.text((86 * S, y + 24 * S), 'Importante', font=f('demi', 34), fill=GOLD_L)
    d.text((86 * S, y + 76 * S), 'Use o mesmo e-mail da sua conta GlobalFly.', font=f('medium', 34), fill=CREAM)
    fim = y + h + 50 * S
    im = im.crop((0, 0, W, fim))
    return im.resize((1080, fim // S), Image.LANCZOS)


def lateral(prod):
    W, H = 700 * S, 1240 * S
    im = Image.new('RGB', (W, H), NAVY)
    # monograma de marca d'água no pé
    mono = Image.open(P + 'globalfly-monograma-claro.png').convert('RGBA')
    mono = mono.resize((560 * S, 560 * S), Image.LANCZOS)
    a = mono.split()[3].point(lambda v: int(v * 0.06))
    mono.putalpha(a)
    im.paste(mono, (W - 420 * S, H - 470 * S), mono)
    d = ImageDraw.Draw(im)
    # moldura dourada fina
    d.rounded_rectangle([3 * S, 3 * S, W - 3 * S, H - 3 * S], radius=28 * S, outline=(54, 70, 92), width=2 * S)
    # foto pequena no topo
    topo = fundo_foto(prod, W - 12 * S, 300 * S, inicio=0.0) if prod['fotos'] == 2 else \
        cobrir(foto(prod['foto']), W - 12 * S, 300 * S, prod.get('foco_lat', 0.5))
    navy = Image.new('RGB', topo.size, NAVY)
    topo = Image.composite(navy, topo, vinheta_baixo(topo.width, topo.height, 0.6, 255))
    mk = Image.new('L', topo.size, 0)
    ImageDraw.Draw(mk).rounded_rectangle([0, 0, topo.width, topo.height + 40 * S], radius=24 * S, fill=255)
    im.paste(topo, (6 * S, 6 * S), mk)
    d = ImageDraw.Draw(im)
    x0 = 52 * S; y = 268 * S
    caps(d, (x0, y), prod['selo'], f('demi', 15), GOLD_L)
    y += 34 * S
    d.text((x0, y), prod['nome'], font=f('demi', 44), fill=CREAM)
    y += 70 * S
    d.line([(x0, y), (x0 + 70 * S, y)], fill=GOLD, width=3 * S)
    y += 34 * S
    d.text((x0, y), 'O que você recebe', font=f('demi', 26), fill=CREAM)
    y += 56 * S
    fo = f('medium', 22)
    for item in prod['itens']:
        linhas = quebrar(d, item, fo, W - x0 - 100 * S)
        check(d, x0 + 15 * S, y + 17 * S, 15 * S)
        for ln in linhas:
            d.text((x0 + 48 * S, y), ln, font=fo, fill=(214, 225, 238))
            y += 32 * S
        y += 20 * S
    y += 12 * S
    d.line([(x0, y), (W - x0, y)], fill=(40, 60, 88), width=2 * S)
    y += 34 * S
    cadeado(d, x0, y, 34 * S)
    d.text((x0 + 52 * S, y - 2 * S), 'Compra segura', font=f('demi', 24), fill=CREAM)
    y += 42 * S
    for ln in quebrar(d, 'Pagamento pela Cakto, no Pix ou no cartão em até 12x.', f('regular', 20),
                      W - x0 - 60 * S):
        d.text((x0, y), ln, font=f('regular', 20), fill=STEEL); y += 30 * S
    y += 26 * S
    # aviso do e-mail (é por ele que a liberação acha a conta)
    caixa_h = 132 * S
    d.rounded_rectangle([x0 - 4 * S, y, W - x0 + 4 * S, y + caixa_h], radius=18 * S, fill=(11, 35, 64),
                        outline=GOLD, width=2 * S)
    d.text((x0 + 20 * S, y + 20 * S), 'Importante', font=f('demi', 20), fill=GOLD_L)
    yy = y + 52 * S
    for ln in quebrar(d, 'Use na compra o mesmo e-mail da sua conta GlobalFly. É por ele que o acesso é liberado.',
                      f('medium', 19), W - 2 * x0 - 40 * S):
        d.text((x0 + 20 * S, yy), ln, font=f('medium', 19), fill=(214, 225, 238)); yy += 28 * S
    yc = y + caixa_h + 30 * S
    for ln in quebrar(d, 'Fotos: ' + prod['credito'], f('regular', 15), W - 2 * x0):
        d.text((x0, yc), ln, font=f('regular', 15), fill=(110, 132, 158)); yc += 22 * S
    fim = yc + 30 * S
    im = im.crop((0, 0, W, fim))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([3 * S, 3 * S, W - 3 * S, fim - 3 * S], radius=28 * S, outline=(54, 70, 92), width=2 * S)
    return im.resize((700, fim // S), Image.LANCZOS)


PRODUTOS = {
    'gulf': dict(credito='Gulfstream G650 por Bene Riobó (CC BY-SA 4.0), via Wikimedia Commons.', nome='GF Gulf', foto='superior5.webp', fotos=1, foco=0.5, foco_lat=0.5, selo='I.A. EXCLUSIVA',
                 titulo_capa=['GF Gulf'], tam_capa=104, titulo_banner=['GF Gulf'], tam_banner=86,
                 frase='Longo alcance nos dígitos altos.',
                 itens=['Acesso por 12 meses à I.A. GF Gulf',
                        'Liberada sozinha na sua conta GlobalFly assim que o pagamento é confirmado',
                        'Você escolhe valor de entrada, meta e limite de perda',
                        'Opera na sua conta Deriv, pela plataforma GlobalFly',
                        'Renovação anual; cancele quando quiser']),
    'phenom': dict(credito='Embraer Phenom 300 por Alan Wilson (CC BY-SA 2.0), via Wikimedia Commons.', nome='GF Phenom', foto='ag2.webp', fotos=1, foco=0.92, foco_capa=0.8, foco_lat=0.6, selo='I.A. EXCLUSIVA',
                   titulo_capa=['GF Phenom'], tam_capa=86, titulo_banner=['GF Phenom'], tam_banner=78,
                   frase='Jato leve, pouso preciso nos dígitos baixos.',
                   itens=['Acesso por 12 meses à I.A. GF Phenom',
                          'Liberada sozinha na sua conta GlobalFly assim que o pagamento é confirmado',
                          'Você escolhe valor de entrada, meta e limite de perda',
                          'Opera na sua conta Deriv, pela plataforma GlobalFly',
                          'Renovação anual; cancele quando quiser']),
    'pack': dict(credito='Gulfstream G650 por Bene Riobó (CC BY-SA 4.0) e Embraer Phenom 300 por Alan Wilson (CC BY-SA 2.0), via Wikimedia Commons.', nome='Pack Gulf + Phenom', fotos=2, selo='AS DUAS I.A. EXCLUSIVAS',
                 titulo_capa=['Pack', 'Gulf + Phenom'], tam_capa=66, titulo_banner=['Pack', 'Gulf + Phenom'], titulo_celular=['Pack', 'Gulf + Phenom'], tam_celular=104,
                 tam_banner=60, frase='As duas juntas, R$ 97 a menos.',
                 itens=['GF Gulf e GF Phenom, as duas I.A. exclusivas',
                        'R$ 97 a menos do que comprar as duas separadas',
                        'Acesso por 12 meses, liberado sozinho na sua conta GlobalFly',
                        'Você escolhe valor de entrada, meta e limite de perda em cada uma',
                        'Renovação anual; cancele quando quiser']),
}

if __name__ == '__main__':
    for k, p in PRODUTOS.items():
        capa(p).save(OUT + f'capa-{k}.jpg', quality=88, optimize=True, progressive=True)
        banner(p).save(OUT + f'banner-{k}.jpg', quality=88, optimize=True, progressive=True)
        banner_celular(p).save(OUT + f'banner-celular-{k}.jpg', quality=88, optimize=True, progressive=True)
        lateral(p).save(OUT + f'lateral-{k}.jpg', quality=88, optimize=True, progressive=True)
        print(k, 'ok')
