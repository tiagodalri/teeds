# -*- coding: utf-8 -*-
"""Legacy Pro — geometria oficial da marca (símbolo, letreiro e monograma LP).
Tudo é construído numa malha de 60°: um triângulo equilátero de lado 100.
Distâncias: a = até a base, b = até o lado esquerdo, r = até o lado direito (a+b+r = H)."""
import math
import re

S3 = math.sqrt(3)
W = 100.0
H = W * S3 / 2          # 86.60
G = 10.0                # espessura do ouro (1X)
D = 6.5                 # respiro entre as peças
C = 13.0                # espessura do chumbo
CF = 10.0               # espessura do pé do chumbo
CH = 7.0                # chanfro do canto

# ---------- cores ----------
PRETO = '#08080A'
CARBONO = '#0E0F11'
CHUMBO_P = '#17181B'
CHUMBO = '#2B2D31'
CHUMBO_M = '#3D4046'
ACO = '#7B8089'
PLATINA = '#C9CCD1'
OURO = '#C9A24A'
OURO_C = '#F0D58A'
OURO_P = '#8A6A26'
MARFIM = '#F3EFE6'
BRANCO = '#FFFFFF'
VERDE = '#3DBE8B'
CORAL = '#E5645A'


def P(a=None, b=None, r=None):
    """ponto pela distância a dois lados; devolve (x, y) com y para baixo."""
    if a is None:
        a = H - b - r
    if b is None:
        b = H - a - r
    x = a / S3 + b / (S3 / 2)
    return (round(x, 3), round(H - a, 3))


def pts(lst):
    return ' '.join('%g,%g' % p for p in lst)


def ouro_pts():
    rc = C + D
    return [P(b=0, r=rc), P(b=G, r=rc), P(a=G + D, b=G), P(a=G, b=G + D),
            P(a=G, r=rc), P(a=0, r=rc), P(a=0, b=CH), P(a=CH, b=0)]


def chumbo_pts():
    s = G + D
    m = s + C
    fb = G + D
    ft = fb + CF
    return [P(b=0, r=0), P(b=m, r=0), P(a=ft, b=m), P(a=ft, r=0), P(a=0, r=0),
            P(a=0, r=C), P(a=fb, r=C), P(a=fb, b=s), P(b=s, r=C), P(b=0, r=C)]


def circuito(cor, op=1.0):
    """trilha de circuito no canto do ouro (só na versão premium, acima de 120 px)."""
    o = []
    def ln(pp, w=0.55):
        o.append('<polyline points="%s" fill="none" stroke="%s" stroke-width="%g" stroke-linejoin="round" stroke-linecap="round"/>' % (pts(pp), cor, w))
    def nd(p, rr=0.95):
        o.append('<circle cx="%g" cy="%g" r="%g" fill="none" stroke="%s" stroke-width="0.5"/>' % (p[0], p[1], rr, cor))
    # trilhas na barra da base
    y0 = H
    ln([(9, y0 - 6.6), (22, y0 - 6.6), (24, y0 - 4.6), (31, y0 - 4.6)]); nd((32, y0 - 4.6))
    ln([(12.5, y0 - 3.4), (19, y0 - 3.4), (21, y0 - 1.9), (27, y0 - 1.9)]); nd((28, y0 - 1.9))
    ln([(9, y0 - 3.4), (10.6, y0 - 3.4)]); nd((8, y0 - 3.4), .8)
    ln([(18, y0 - 8.4), (28, y0 - 8.4)]); nd((29, y0 - 8.4))
    # trilhas subindo pela haste
    def hp(a, b):
        return P(a=a, b=b)
    ln([hp(7.2, 3.2), hp(12, 3.2), hp(13.6, 2.2), hp(19, 2.2)]); nd(hp(20.1, 2.2))
    ln([hp(8.2, 5.6), hp(15, 5.6), hp(16.5, 6.8), hp(22, 6.8)]); nd(hp(23.1, 6.8))
    ln([hp(9.5, 8.0), hp(13.5, 8.0)]); nd(hp(14.6, 8.0))
    return '<g opacity="%g">%s</g>' % (op, ''.join(o))


DEFS = '''
<linearGradient id="%(p)souro" gradientUnits="userSpaceOnUse" x1="0" y1="86.6" x2="62" y2="10">
 <stop offset="0" stop-color="#7A5A1E"/><stop offset=".22" stop-color="#B8903C"/><stop offset=".5" stop-color="#D9B761"/>
 <stop offset=".74" stop-color="#F7E6A8"/><stop offset=".86" stop-color="#E2C270"/><stop offset="1" stop-color="#A47C2E"/></linearGradient>
<linearGradient id="%(p)sourob" gradientUnits="userSpaceOnUse" x1="5" y1="80" x2="85" y2="80">
 <stop offset="0" stop-color="#8A6A26"/><stop offset=".45" stop-color="#D2AE58"/><stop offset=".8" stop-color="#C39B45"/><stop offset="1" stop-color="#7A5A1E"/></linearGradient>
<linearGradient id="%(p)schumbo" gradientUnits="userSpaceOnUse" x1="40" y1="0" x2="80" y2="86.6">
 <stop offset="0" stop-color="#7A7F88"/><stop offset=".28" stop-color="#4B4F56"/><stop offset=".62" stop-color="#34373C"/><stop offset="1" stop-color="#3F4248"/></linearGradient>
<linearGradient id="%(p)sfio" gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="90" y2="86.6">
 <stop offset="0" stop-color="#F2F3F5" stop-opacity=".95"/><stop offset=".5" stop-color="#B4B8BF" stop-opacity=".7"/><stop offset="1" stop-color="#8A8F97" stop-opacity=".55"/></linearGradient>
<linearGradient id="%(p)sfioo" gradientUnits="userSpaceOnUse" x1="0" y1="86.6" x2="60" y2="0">
 <stop offset="0" stop-color="#F7E6A8" stop-opacity=".35"/><stop offset="1" stop-color="#FFF6D2" stop-opacity=".95"/></linearGradient>
'''


def simbolo(modo='premium', ouro=OURO, chumbo=CHUMBO, pid='s', trilha=True):
    """devolve o miolo SVG do símbolo, na caixa 0 0 100 86.6."""
    go, gc = pts(ouro_pts()), pts(chumbo_pts())
    if modo == 'premium':
        d = DEFS % {'p': pid}
        # a barra da base usa um degradê próprio; recorte pela linha a = G
        s = '<defs>%s<clipPath id="%sbar"><rect x="0" y="%g" width="100" height="%g"/></clipPath></defs>' % (d, pid, H - G, G)
        s += '<polygon points="%s" fill="url(#%souro)"/>' % (go, pid)
        s += '<polygon points="%s" fill="url(#%sourob)" clip-path="url(#%sbar)"/>' % (go, pid, pid)
        s += '<polygon points="%s" fill="none" stroke="url(#%sfioo)" stroke-width=".45" stroke-linejoin="miter"/>' % (go, pid)
        s += '<polygon points="%s" fill="url(#%schumbo)"/>' % (gc, pid)
        s += '<polygon points="%s" fill="none" stroke="url(#%sfio)" stroke-width=".45" stroke-linejoin="miter"/>' % (gc, pid)
        if trilha:
            s = s.replace('</defs>', '<clipPath id="%sgo"><polygon points="%s"/></clipPath></defs>' % (pid, go), 1)
            s += '<g clip-path="url(#%sgo)">%s</g>' % (pid, circuito('#5E4514', .85))
        return s
    return '<polygon points="%s" fill="%s"/><polygon points="%s" fill="%s"/>' % (go, ouro, gc, chumbo)


# ---------- letreiro próprio ----------
# cada letra numa caixa de altura 100; traço 10. ('s', d) = traço; ('f', pontos) = preenchido; ('c', cx, cy, r) = ponto
GLIFOS = {
    'L': (70, [('s', 'M5 0 V95 H70')]),
    'E': (72, [('s', 'M0 5 H72'), ('s', 'M0 50 H62'), ('s', 'M0 95 H72')]),
    'G': (84, [('s', 'M84 5 H23 Q5 5 5 23 V77 Q5 95 23 95 H79 V50 H44')]),
    'A': (92, [('f', [(0, 100), (40.6, 0), (51.4, 0), (92, 100), (81, 100), (46, 13.8), (11, 100)]), ('c', 46, 78, 6.2)]),
    'C': (80, [('s', 'M80 5 H23 Q5 5 5 23 V77 Q5 95 23 95 H80')]),
    'Y': (92, [('f', [(0, 0), (11.8, 0), (46, 44.5), (80.2, 0), (92, 0), (51, 53.4), (51, 100), (41, 100), (41, 53.4)])]),
    'P': (76, [('s', 'M5 100 V5 H53 Q71 5 71 23 V37 Q71 55 53 55 H5')]),
    'R': (78, [('s', 'M5 100 V5 H53 Q71 5 71 23 V37 Q71 55 53 55 H5'), ('f', [(35, 55), (47.6, 55), (78, 100), (65.4, 100)])]),
    'O': (84, [('s', 'M23 5 H61 Q79 5 79 23 V77 Q79 95 61 95 H23 Q5 95 5 77 V23 Q5 5 23 5 Z')]),
    ' ': (40, []),
}


def largura(txt, track=60):
    return sum(GLIFOS[c][0] for c in txt) + track * (len(txt) - 1)


def _desloca(d, dx):
    out = []
    for cmd, args in re.findall(r'([MLHVQZ])([^MLHVQZ]*)', d):
        n = [float(v) for v in args.split()]
        if cmd in 'MLQ':
            n = [v + dx if i % 2 == 0 else v for i, v in enumerate(n)]
        elif cmd == 'H':
            n = [v + dx for v in n]
        out.append(cmd + ' '.join('%g' % v for v in n))
    return ' '.join(out)


def letreiro(txt, cor, track=60, peso=10, ponto=None):
    """miolo SVG do letreiro na caixa 0 0 largura(txt) 100. cor pode ser url(#...)."""
    x = 0
    o = []
    for ch in txt:
        w, partes = GLIFOS[ch]
        g = []
        for p in partes:
            if p[0] == 's':
                g.append('<path d="%s" fill="none" stroke="%s" stroke-width="%g" stroke-linejoin="miter"/>' % (_desloca(p[1], x), cor, peso))
            elif p[0] == 'f':
                g.append('<polygon points="%s" fill="%s"/>' % (pts([(q[0] + x, q[1]) for q in p[1]]), cor))
            else:
                g.append('<circle cx="%g" cy="%g" r="%g" fill="%s"/>' % (p[1] + x, p[2], p[3], ponto or cor))
        o.append(''.join(g))
        x += w + track
    return ''.join(o)


def grad_h(idn, x1, x2, stops):
    return '<linearGradient id="%s" gradientUnits="userSpaceOnUse" x1="%g" y1="0" x2="%g" y2="0">%s</linearGradient>' % (
        idn, x1, x2, ''.join('<stop offset="%g" stop-color="%s"/>' % s for s in stops))


OURO_STOPS = [(0, '#B38A38'), (.3, '#E8CC83'), (.55, '#C9A24A'), (.8, '#F0D58A'), (1, '#A8822F')]
PLAT_STOPS = [(0, '#8F949C'), (.3, '#DADDE1'), (.6, '#A4A9B0'), (1, '#E4E6EA')]
MISTO_STOPS = [(0, '#B8903C'), (.2, '#E8CC83'), (.42, '#C9A24A'), (.56, '#B9B4A6'), (.75, '#D5D8DC'), (1, '#9BA0A8')]

_n = [0]


def uid(p='k'):
    _n[0] += 1
    return '%s%d' % (p, _n[0])


def tema(modo):
    """cores por versão: devolve dict com ouro, chumbo, texto, pro, linha, premium."""
    T = {
        'premium': dict(premium=True),                                   # fundo escuro, metal
        'plana': dict(ouro=OURO, chumbo=ACO, texto=PLATINA, pro=OURO),   # fundo escuro, chapado
        'noite': dict(ouro=OURO, chumbo=PLATINA, texto=PLATINA, pro=OURO),  # fundo escuro, tamanhos pequenos
        'clara': dict(ouro=OURO, chumbo=CHUMBO, texto=CHUMBO, pro='#A07C2C'),  # fundo claro
        'preta': dict(ouro='#000', chumbo='#000', texto='#000', pro='#000'),
        'branca': dict(ouro='#fff', chumbo='#fff', texto='#fff', pro='#fff'),
        'ouro': dict(ouro=OURO, chumbo=OURO, texto=OURO, pro=OURO),
        'chumbo': dict(ouro=CHUMBO, chumbo=CHUMBO, texto=CHUMBO, pro=CHUMBO),
    }
    return T[modo]


def _texto_legacy(modo, k):
    t = tema(modo)
    wl = largura('LEGACY')
    if t.get('premium'):
        defs = grad_h(k + 'm', 0, wl, MISTO_STOPS)
        return defs, letreiro('LEGACY', 'url(#%sm)' % k, ponto=OURO_C)
    return '', letreiro('LEGACY', t['texto'], ponto=t['pro'])


def _texto_pro(modo, k):
    t = tema(modo)
    wp = largura('PRO', 70)
    if t.get('premium'):
        defs = grad_h(k + 'p', 0, wp, OURO_STOPS)
        return defs, letreiro('PRO', 'url(#%sp)' % k, track=70, peso=13)
    return '', letreiro('PRO', t['pro'], track=70, peso=13)


def _simb(modo, k, trilha=True):
    t = tema(modo)
    if t.get('premium'):
        return simbolo('premium', pid=k, trilha=trilha)
    return simbolo('plana', ouro=t['ouro'], chumbo=t['chumbo'])


def _linha(modo, k, x1, x2, y, esp=1.6):
    t = tema(modo)
    if t.get('premium'):
        g = '<linearGradient id="%sl" gradientUnits="userSpaceOnUse" x1="%g" y1="0" x2="%g" y2="0"><stop offset="0" stop-color="#C9A24A" stop-opacity="0"/><stop offset=".5" stop-color="#F0D58A"/><stop offset="1" stop-color="#C9A24A" stop-opacity="0"/></linearGradient>' % (k, x1, x2)
        return '<defs>%s</defs><rect x="%g" y="%g" width="%g" height="%g" fill="url(#%sl)"/>' % (g, x1, y - esp / 2, x2 - x1, esp, k)
    return '<rect x="%g" y="%g" width="%g" height="%g" fill="%s"/>' % (x1, y - esp / 2, x2 - x1, esp, t['pro'])


# ---------- assinaturas ----------
def assinatura_vertical(modo='premium', trilha=True):
    """símbolo em cima, LEGACY, e PRO entre duas linhas. devolve (svg_miolo, largura, altura)."""
    k = uid()
    wl = largura('LEGACY')            # 790
    hs = 400.0                        # altura do símbolo
    es = hs / H                       # escala do símbolo
    ws = W * es
    Wt = wl
    y = 0
    o = []
    d1, tl = _texto_legacy(modo, k)
    d2, tp = _texto_pro(modo, k)
    o.append('<defs>%s%s</defs>' % (d1, d2))
    o.append('<g transform="translate(%g %g) scale(%g)">%s</g>' % ((Wt - ws) / 2, 0, es, _simb(modo, k, trilha)))
    y = hs + 78
    o.append('<g transform="translate(0 %g)">%s</g>' % (y, tl))
    y += 100 + 62
    ep = 0.46                         # PRO = 46% da altura de LEGACY
    wp = largura('PRO', 70) * ep
    xp = (Wt - wp) / 2
    o.append('<g transform="translate(%g %g) scale(%g)">%s</g>' % (xp, y, ep, tp))
    ym = y + 50 * ep
    o.append(_linha(modo, k + 'a', 0, xp - 34, ym))
    o.append(_linha(modo, k + 'b', xp + wp + 34, Wt, ym))
    return ''.join(o), Wt, y + 100 * ep


def assinatura_horizontal(modo='premium', trilha=True):
    """símbolo à esquerda; LEGACY em cima, linha + PRO embaixo."""
    k = uid()
    wl = largura('LEGACY')
    ep = 0.46
    wp = largura('PRO', 70) * ep
    ht = 100 + 44 + 100 * ep          # 190
    hs = 236.0
    es = hs / H
    ws = W * es
    gap = 92
    o = []
    d1, tl = _texto_legacy(modo, k)
    d2, tp = _texto_pro(modo, k)
    o.append('<defs>%s%s</defs>' % (d1, d2))
    o.append('<g transform="scale(%g)">%s</g>' % (es, _simb(modo, k, trilha)))
    x0 = ws + gap
    y0 = (hs - ht) / 2 + 6
    o.append('<g transform="translate(%g %g)">%s</g>' % (x0, y0, tl))
    yp = y0 + 100 + 44
    xp = x0 + wl - wp
    o.append('<g transform="translate(%g %g) scale(%g)">%s</g>' % (xp, yp, ep, tp))
    o.append(_linha(modo, k + 'a', x0, xp - 34, yp + 50 * ep))
    return ''.join(o), x0 + wl, hs


def assinatura_linha(modo='premium'):
    """só o letreiro: LEGACY | PRO numa linha (rodapés, assinaturas de e-mail)."""
    k = uid()
    wl = largura('LEGACY')
    d1, tl = _texto_legacy(modo, k)
    d2, tp = _texto_pro(modo, k)
    wp = largura('PRO', 70)
    x = wl + 110
    o = '<defs>%s%s</defs>%s<g transform="translate(%g 0)">%s</g>' % (d1, d2, tl, x, tp)
    return o, x + wp, 100


# ---------- monograma LP ----------
def monograma_pts():
    """L de ouro que abraça o P de chumbo. caixa 0 0 100 100; cortes a 60°."""
    t = 17.0          # espessura
    d = 6.5           # respiro
    k = 1 / S3        # deslocamento horizontal por unidade de altura num corte a 60°
    Wm = 100.0
    # L: haste à esquerda, pé por baixo do P
    L = [(0, 100), (0, t * k * 0 + 9), (t, 9 - t * S3 * 0 - 0), ]
    topo = 4.0
    L = [(0, topo + t / S3 * 1.0), (t, topo), (t, 100 - t - d), (t + d * 0 + 0, 100 - t - d)]
    # desenho final, ponto a ponto
    L = [
        (0, 100 - 7),                 # chanfro do canto de baixo
        (0, t / S3 + 0),              # topo da haste (lado alto do corte)
        (t, 0),                       # topo da haste, corte a 60°
        (t, 100 - t - d),             # desce por dentro
        (t + d / S3 * 1.0 + 0.0, 100 - t),   # filete paralelo ao corte
        (Wm, 100 - t),                # topo do pé
        (Wm - t / S3, 100),           # ponta do pé, corte a 60°
        (7 / S3, 100),
    ]
    x0 = t + d
    x1 = x0 + t
    yb = 100 - t - d                  # o P pousa a um respiro do pé
    ym = 52.0                         # base do bojo
    ch = 13.0                         # chanfro do bojo
    Pp = [
        (x0, 0), (Wm - ch / S3 * 1.0 - 0, 0), (Wm, ch), (Wm, ym - ch), (Wm - ch / S3, ym),
        (x1, ym), (x1, yb - 0), (x0, yb),
    ]
    ci = ch * 0.45
    furo = [(x1, t), (Wm - t - ci / S3, t), (Wm - t, t + ci), (Wm - t, ym - t - ci), (Wm - t - ci / S3, ym - t), (x1, ym - t)]
    return L, Pp, furo


def monograma(modo='premium'):
    k = uid('m')
    L, Pp, furo = monograma_pts()
    t = tema(modo)
    dP = 'M' + ' L'.join('%g %g' % p for p in Pp) + ' Z M' + ' L'.join('%g %g' % p for p in furo[::-1]) + ' Z'
    if t.get('premium'):
        defs = ('<defs><linearGradient id="%so" gradientUnits="userSpaceOnUse" x1="0" y1="100" x2="60" y2="0">'
                '<stop offset="0" stop-color="#7A5A1E"/><stop offset=".3" stop-color="#C9A24A"/><stop offset=".62" stop-color="#F7E6A8"/><stop offset="1" stop-color="#A47C2E"/></linearGradient>'
                '<linearGradient id="%sc" gradientUnits="userSpaceOnUse" x1="30" y1="0" x2="100" y2="90">'
                '<stop offset="0" stop-color="#5E626A"/><stop offset=".45" stop-color="#34373C"/><stop offset="1" stop-color="#1B1C1F"/></linearGradient>'
                '<linearGradient id="%sf" gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="100" y2="100">'
                '<stop offset="0" stop-color="#E6E8EC" stop-opacity=".9"/><stop offset="1" stop-color="#5A5E66" stop-opacity=".2"/></linearGradient></defs>') % (k, k, k)
        return (defs + '<polygon points="%s" fill="url(#%so)"/>' % (pts(L), k)
                + '<path d="%s" fill="url(#%sc)" fill-rule="evenodd"/>' % (dP, k)
                + '<path d="%s" fill="none" stroke="url(#%sf)" stroke-width=".5" fill-rule="evenodd"/>' % (dP, k))
    return '<polygon points="%s" fill="%s"/><path d="%s" fill="%s" fill-rule="evenodd"/>' % (pts(L), t['ouro'], dP, t['chumbo'])


def svg(miolo, w, h, pad=0, extra=''):
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%g %g %g %g" %s>%s</svg>' % (-pad, -pad, w + 2 * pad, h + 2 * pad, extra, miolo)


def svg_simbolo(modo='premium', trilha=True, extra=''):
    return svg(_simb(modo, uid(), trilha), W, H, 0, extra)


def svg_vertical(modo='premium', extra='', trilha=True):
    m, w, h = assinatura_vertical(modo, trilha)
    return svg(m, w, h, 0, extra)


def svg_horizontal(modo='premium', extra='', trilha=True):
    m, w, h = assinatura_horizontal(modo, trilha)
    return svg(m, w, h, 0, extra)


def svg_linha(modo='premium', extra=''):
    m, w, h = assinatura_linha(modo)
    return svg(m, w, h, 0, extra)


def svg_monograma(modo='premium', extra=''):
    return svg(monograma(modo), 100, 100, 0, extra)
