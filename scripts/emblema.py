#!/usr/bin/env python3
"""
Desenha o emblema de uma marca e escreve o PNG.

    python3 scripts/emblema.py omni

Desenhado por construção, não gerado por IA: os 60 graus são exatos, a
abertura é regular, e regerar em outra cor ou outro tamanho é trocar um
número — não torcer para o gerador repetir o desenho.

A proporção foi escolhida pelo teste que importa: o emblema vive a 22 pixels
do lado de cada resposta do assistente, e a 16 no favicon. Abertura estreita
fecha nesse tamanho e vira um borrão; por isso ela é larga.
"""
import math, zlib, struct, sys, pathlib

MARCAS = {
    # nome do arquivo, cor, e a geometria
    'omni': dict(arquivo='omni-marca.png', cor=(0x2F, 0x5C, 0x94),
                 r_ext=112.0, r_int=62.0, folga=11.0),
}

N, S = 256, 4          # lado do arquivo; 4x4 amostras por pixel (borda lisa)

def desenhar(cor, r_ext, r_int, folga):
    C = N / 2
    hexagono = lambda r: [(C + r * math.cos(math.radians(-90 + 60 * k)),
                           C + r * math.sin(math.radians(-90 + 60 * k))) for k in range(6)]
    EXT, INT = hexagono(r_ext), hexagono(r_int)

    def dentro(p, poly):
        x, y = p; d = False; j = len(poly) - 1
        for i in range(len(poly)):
            xi, yi = poly[i]; xj, yj = poly[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                d = not d
            j = i
        return d

    # Cada fenda sai de um vértice da abertura em direção ao vértice seguinte
    # do hexágono de fora. É essa inclinação que dá o giro das lâminas.
    fendas = []
    for k in range(6):
        ax, ay = INT[k]; bx, by = EXT[(k + 1) % 6]
        dx, dy = bx - ax, by - ay
        c = math.hypot(dx, dy); dx, dy = dx / c, dy / c
        nx, ny = -dy, dx; h = folga / 2; L = 300.0
        fendas.append([(ax + nx*h, ay + ny*h), (ax + dx*L + nx*h, ay + dy*L + ny*h),
                       (ax + dx*L - nx*h, ay + dy*L - ny*h), (ax - nx*h, ay - ny*h)])

    linhas = bytearray()
    for py in range(N):
        linhas.append(0)
        for px in range(N):
            n = 0
            for sy in range(S):
                for sx in range(S):
                    p = (px + (sx + .5) / S, py + (sy + .5) / S)
                    if dentro(p, EXT) and not dentro(p, INT) and not any(dentro(p, f) for f in fendas):
                        n += 1
            linhas += bytes((*cor, round(255 * n / (S * S))))

    pedaco = lambda t, d: (struct.pack('>I', len(d)) + t + d
                           + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff))
    return (b'\x89PNG\r\n\x1a\n'
            + pedaco(b'IHDR', struct.pack('>IIBBBBB', N, N, 8, 6, 0, 0, 0))
            + pedaco(b'IDAT', zlib.compress(bytes(linhas), 9))
            + pedaco(b'IEND', b''))

if __name__ == '__main__':
    qual = sys.argv[1] if len(sys.argv) > 1 else 'omni'
    m = MARCAS[qual]
    destino = pathlib.Path('public') / m['arquivo']
    destino.write_bytes(desenhar(m['cor'], m['r_ext'], m['r_int'], m['folga']))
    print(f"{destino}: {destino.stat().st_size // 1024} KB, {N}x{N}, fundo transparente")
