#!/usr/bin/env python3
"""
Ponte da Meta (02/11/2026). Tiago: "faça o site e servidor da global puxarem daqui, através de um mcp".

A integração Meta Ads mora no Claude, com o login do Tiago. A tarefa agendada "Ponte da Meta (GF)"
roda o Claude a cada 30 minutos: ele lê a conta do Naor pela integração, guarda as respostas brutas
numa pasta e chama este script, que monta os números no formato do painel e manda para a função
meta-ponte do Supabase. O segredo da ponte fica em ~/.config/globalfly/ponte-meta.segredo (gerado
neste Mac; no banco só existe a impressão digital dele).

  python3 enviar.py plano [n|v]   -> limpa a pasta do parceiro e diz o período e o horário do pixel a pedir
  python3 enviar.py enviar [n|v]  -> lê a pasta do parceiro, monta e envia; imprime o resumo
  (03/11/2026: n = conta do Naor, v = conta do Victor Cordeiro; sem o código, vale o Naor)

Arquivos esperados na pasta (a resposta da ferramenta, sem mexer):
  campanhas.json   ads_get_ad_entities, level=campaign, só as "GF |"
  conjuntos.json   level=adset
  anuncios.json    level=ad, time_increment=1 (mais páginas: anuncios-2.json, anuncios-3.json...)
  criativos.json   ads_get_creatives
  q-idadeGenero.json, q-posicionamento.json, q-aparelho.json, q-regiao.json   level=campaign com breakdowns, time_increment=1
  pixel.json       ads_get_dataset_stats, aggregation=event
Arquivo que faltar é pulado (sem campanhas "GF |", só vão a conta e o pixel).
"""
import json, os, sys, shutil, urllib.request
from datetime import datetime, timedelta, timezone

MARCA = 'globalfly'
CONTAS = {
    'n': {'id': '977357031377237', 'nome': 'CA - NAOR BEZERRA', 'moeda': 'BRL', 'status': 1, 'fuso': 'America/Sao_Paulo'},
    'v': {'id': '1431777775778359', 'nome': 'GF Victor', 'moeda': 'BRL', 'status': 1, 'fuso': 'America/Sao_Paulo'},
}
PARCEIRO = sys.argv[2] if len(sys.argv) > 2 else 'n'
if PARCEIRO not in CONTAS:
    sys.exit(f'Parceiro desconhecido: {PARCEIRO} (use n ou v)')
CONTA = CONTAS[PARCEIRO]
INICIO = '2026-11-02'  # o lançamento: antes disso não há campanha da GlobalFly
FUNCAO = 'https://wonxykovfvfnuhzpqsle.supabase.co/functions/v1/meta-ponte'
SEGREDO = os.path.expanduser('~/.config/globalfly/ponte-meta.segredo')
PASTA = os.path.expanduser(f'~/Library/Caches/globalfly-ponte/{PARCEIRO}')
BRT = timezone(timedelta(hours=-3))

# nome do campo da integração -> nome no painel (Metricas, em src/core/teeds/anuncios.ts)
METRICAS = {
    'amount_spent': 'gasto', 'impressions': 'impressoes', 'reach': 'alcance', 'clicks': 'cliques', 'link_click': 'cliquesLink',
    'landing_page_view': 'lpv', 'omni_view_content': 'viewContent', 'lead': 'leads', 'omni_complete_registration': 'cadastros',
    'post_engagement': 'engajamento', 'post_reaction': 'reacoes', 'comment': 'comentarios', 'post_save': 'salvos',
    'video_continuous_2_sec_watched_actions': 'video3s', 'video_play_actions': 'videoPlay', 'video_thruplay_watched_actions': 'thruplay',
    'video_p25_watched_actions': 'p25', 'video_p50_watched_actions': 'p50', 'video_p75_watched_actions': 'p75',
    'video_p95_watched_actions': 'p95', 'video_p100_watched_actions': 'p100',
}
QUEBRAS = {'idadeGenero': ['age', 'gender'], 'posicionamento': ['publisher_platform', 'platform_position'], 'aparelho': ['device_platform'], 'regiao': ['region']}


def numero(v):
    if isinstance(v, dict):
        v = v.get('value')
    if isinstance(v, list):  # lista de ações: soma os valores
        return sum(numero(x) for x in v)
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def ler(nome):
    """As respostas da ferramenta, como lista de linhas. Junta as páginas: anuncios.json, anuncios-2.json..."""
    base = nome[:-5]
    arquivos = sorted(f for f in os.listdir(PASTA) if f == nome or (f.startswith(base + '-') and f.endswith('.json') and f[len(base) + 1:-5].isdigit())) if os.path.isdir(PASTA) else []
    if not arquivos:
        return None
    linhas = []
    for f in arquivos:
        linhas.extend(ler_um(os.path.join(PASTA, f)))
    return linhas


def ler_um(caminho):
    with open(caminho, encoding='utf-8') as f:
        bruto = f.read().strip()
    if not bruto:
        return []
    d = json.loads(bruto)
    if isinstance(d, dict) and isinstance(d.get('ad_entities'), str):
        d = json.loads(d['ad_entities'])
    if isinstance(d, dict):
        for chave in ('ad_entities', 'stats', 'creatives', 'data', 'results'):
            if isinstance(d.get(chave), list):
                return d[chave]
        listas = [v for v in d.values() if isinstance(v, list)]
        return listas[0] if listas else []
    return d if isinstance(d, list) else []


def metricas(linha):
    return {nosso: numero(linha.get(deles)) for deles, nosso in METRICAS.items()}


def publico(t):
    if isinstance(t, str):
        try:
            t = json.loads(t)
        except ValueError:
            return t[:160]
    if not isinstance(t, dict):
        return ''
    partes = []
    if t.get('age_min') or t.get('age_max'):
        partes.append(f"{t.get('age_min', 18)}–{t.get('age_max', 65)}{'+' if t.get('age_max') == 65 else ''} anos")
    paises = (t.get('geo_locations') or {}).get('countries') or []
    if paises:
        partes.append('Brasil' if paises == ['BR'] else ', '.join(paises))
    if (t.get('targeting_automation') or {}).get('advantage_audience') == 1:
        partes.append('público Advantage+')
    return ' · '.join(partes)


def plano():
    shutil.rmtree(PASTA, ignore_errors=True)
    os.makedirs(PASTA, exist_ok=True)
    hoje = datetime.now(BRT).date()
    desde = max(datetime.strptime(INICIO, '%Y-%m-%d').date(), hoje - timedelta(days=2))
    meia_noite = datetime.combine(desde, datetime.min.time(), BRT)
    print(json.dumps({
        'pasta': PASTA, 'since': desde.isoformat(), 'until': hoje.isoformat(),
        'time_range': json.dumps({'since': desde.isoformat(), 'until': hoje.isoformat()}),
        'pixel_start_time': str(int(meia_noite.timestamp())), 'pixel_end_time': str(int(datetime.now(BRT).timestamp())),
    }, ensure_ascii=False))


def enviar():
    campanhas = ler('campanhas.json') or []
    gf = {str(c.get('id')) for c in campanhas if 'GF |' in str(c.get('name', ''))}
    entidades, dias, quebras, pixel = [], [], [], []

    for c in campanhas:
        if str(c.get('id')) not in gf:
            continue
        entidades.append({'tipo': 'campanha', 'id': str(c['id']), 'dados': {
            'nome': c.get('name', ''), 'status': c.get('effective_status', ''), 'objetivo': c.get('objective', ''),
            'orcDia': numero(c.get('daily_budget')), 'orcTotal': numero(c.get('lifetime_budget')), 'inicio': c.get('start_time')}})

    for s in ler('conjuntos.json') or []:
        if str(s.get('campaign_id')) not in gf:
            continue
        entidades.append({'tipo': 'conjunto', 'id': str(s['id']), 'dados': {
            'nome': s.get('name', ''), 'status': s.get('effective_status', ''), 'campanhaId': str(s.get('campaign_id', '')),
            'orcDia': numero(s.get('daily_budget')), 'orcTotal': numero(s.get('lifetime_budget')),
            'otimizacao': s.get('optimization_goal', ''), 'publico': publico(s.get('targeting'))}})

    criativos = {str(c.get('id')): c for c in (ler('criativos.json') or [])}
    vistos = {}
    for a in ler('anuncios.json') or []:
        if str(a.get('campaign_id')) not in gf or not a.get('date_start'):
            continue
        m = metricas(a)
        m.update({'campanhaId': str(a.get('campaign_id', '')), 'conjuntoId': str(a.get('adset_id', ''))})
        dias.append({'dia': a['date_start'], 'id': str(a['id']), 'dados': m})
        vistos[str(a['id'])] = a
    for id_, a in vistos.items():
        cr = criativos.get(str(a.get('creative_id', ''))) or {}
        entidades.append({'tipo': 'anuncio', 'id': id_, 'dados': {
            'nome': a.get('name', ''), 'status': a.get('effective_status', ''), 'campanhaId': str(a.get('campaign_id', '')),
            'conjuntoId': str(a.get('adset_id', '')), 'criadoEm': a.get('created_time', ''),
            'miniatura': cr.get('thumbnail_url'), 'imagem': cr.get('image_url'), 'titulo': cr.get('title', ''), 'texto': cr.get('body', ''),
            'tipo': 'video' if cr.get('video_id') else 'imagem', 'cta': cr.get('call_to_action_type', ''),
            # a integração não devolve as marcações do link: None = "não sei" (o painel não acusa falta)
            'marcacoes': None}})

    for tipo, chaves in QUEBRAS.items():
        for q in ler(f'q-{tipo}.json') or []:
            if gf and q.get('id') and str(q.get('id')) not in gf:
                continue
            if not q.get('date_start'):
                continue
            chave = '|'.join(str(q.get(k, '')) for k in chaves)
            quebras.append({'dia': q['date_start'], 'tipo': tipo, 'chave': chave, 'dados': metricas(q)})
    # a mesma chave no mesmo dia (várias campanhas) vira uma linha só
    juntas = {}
    for q in quebras:
        k = (q['dia'], q['tipo'], q['chave'])
        if k in juntas:
            for campo, v in q['dados'].items():
                juntas[k]['dados'][campo] = juntas[k]['dados'].get(campo, 0) + v
        else:
            juntas[k] = q
    quebras = list(juntas.values())

    soma = {}
    for b in ler('pixel.json') or []:
        quando = b.get('timestamp') or b.get('start_time')
        if not quando:
            continue
        try:
            dia = datetime.strptime(quando[:24], '%Y-%m-%dT%H:%M:%S%z').astimezone(BRT).date().isoformat()
        except ValueError:
            dia = datetime.fromisoformat(quando.replace('Z', '+00:00')).astimezone(BRT).date().isoformat()
        for e in b.get('data') or []:
            k = (dia, str(e.get('value')))
            soma[k] = soma.get(k, 0) + int(numero(e.get('count')))
    pixel = [{'dia': d, 'evento': ev, 'total': t} for (d, ev), t in soma.items()]

    corpo = json.dumps({'marca': MARCA, 'parceiro': PARCEIRO, 'dados': {
        'conta': CONTA, 'dias': dias, 'entidades': entidades, 'quebras': quebras, 'pixel': pixel}}).encode()
    if os.environ.get('PONTE_SECO'):  # teste: mostra o que iria, sem mandar
        print(corpo.decode()); return
    with open(SEGREDO, encoding='utf-8') as f:
        segredo = f.read().strip()
    pedido = urllib.request.Request(FUNCAO, data=corpo, method='POST', headers={'Content-Type': 'application/json', 'x-ponte': segredo})
    with urllib.request.urlopen(pedido, timeout=60) as r:
        resposta = json.loads(r.read().decode())
    print(json.dumps({'campanhas_gf': len(gf), 'linhas_por_dia': len(dias), 'anuncios': len(vistos), 'quebras': len(quebras),
                      'pixel': len(pixel), 'servidor': resposta}, ensure_ascii=False))


if __name__ == '__main__':
    {'plano': plano, 'enviar': enviar}.get(sys.argv[1] if len(sys.argv) > 1 else '', lambda: sys.exit(__doc__))()
