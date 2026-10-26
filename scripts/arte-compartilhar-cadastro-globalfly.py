# A imagem que aparece quando o link do /cadastro da GlobalFly é compartilhado
# (WhatsApp, Instagram, Telegram): 1200 x 630, azul da marca sobre as nuvens.
# Antes era a assinatura transparente, e o WhatsApp a mostrava sobre branco.
# Uso: python3 scripts/arte-compartilhar-cadastro-globalfly.py  (Pillow + Avenir Next do macOS)
from PIL import Image, ImageDraw, ImageFont, ImageEnhance

P = '/Users/tiagodalri/Desktop/Teeds/public/'
SAIDA = P + 'globalfly-cadastro-compartilhar.jpg'
AV = '/System/Library/Fonts/Avenir Next.ttc'
S = 2  # desenha em 2x e reduz: bordas suaves
W, H = 1200 * S, 630 * S

NAVY = (5, 21, 40)
GOLD = (183, 141, 57); GOLD_L = (212, 166, 74)
CREAM = (243, 240, 233); STEEL = (156, 177, 199)


def f(face, px):
    idx = {'bold': 0, 'demi': 2, 'medium': 5, 'regular': 7}[face]
    return ImageFont.truetype(AV, int(px * S), index=idx)


# fundo: as nuvens do login, com o horizonte dourado no terço de baixo
ceu = Image.open(P + 'login-globalfly/nuvens.webp').convert('RGB')
r = max(W / ceu.width, H / ceu.height) * 1.08
ceu = ceu.resize((round(ceu.width * r), round(ceu.height * r)), Image.LANCZOS)
y = int(ceu.height * 0.5 - H * 0.66)
ceu = ceu.crop(((ceu.width - W) // 2, y, (ceu.width - W) // 2 + W, y + H))
ceu = ImageEnhance.Brightness(ceu).enhance(0.9)

# azul GF da esquerda para a direita, para o texto ler bem
mascara = Image.new('L', (W, H))
d = ImageDraw.Draw(mascara)
for x in range(W):
    t = x / W
    u = min(1, max(0, (t - 0.3) / 0.62))
    a = int(240 * (1 - u * u * (3 - 2 * u)))  # suave, sem emenda visível
    d.line([(x, 0), (x, H)], fill=a)
arte = Image.composite(Image.new('RGB', (W, H), NAVY), ceu, mascara)
d = ImageDraw.Draw(arte)

M = 84 * S  # margem
# assinatura oficial (versão para fundo escuro)
ass = Image.open(P + 'globalfly-assinatura.png').convert('RGBA')
caixa = ass.getbbox()
ass = ass.crop(caixa)
lw = 360 * S
ass = ass.resize((lw, round(ass.height * lw / ass.width)), Image.LANCZOS)
arte.paste(ass, (M, 78 * S), ass)

# selo "Live de lançamento"
y0 = 262 * S
d.ellipse([M, y0 + 9 * S, M + 14 * S, y0 + 23 * S], fill=GOLD_L)
d.text((M + 28 * S, y0), 'LIVE DE LANÇAMENTO', font=f('demi', 25), fill=GOLD_L, spacing=0)

# data e hora, grandes
d.text((M - 3 * S, y0 + 46 * S), 'Segunda, 9 de novembro', font=f('bold', 64), fill=CREAM)
d.text((M - 3 * S, y0 + 124 * S), 'às 20h', font=f('bold', 64), fill=GOLD_L)

# chamada
d.text((M, y0 + 222 * S), 'Cadastre-se e entre na comunidade oficial.', font=f('medium', 28), fill=STEEL)

arte.resize((1200, 630), Image.LANCZOS).save(SAIDA, quality=88, optimize=True, progressive=True)
print('ok', SAIDA)
