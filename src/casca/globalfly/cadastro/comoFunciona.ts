/**
 * As seções da antiga globalflytrade.com/cadastro reaproveitadas no cadastro com planos (11/11/2026, Tiago:
 * "aproveitar tudo da antiga, as animações das I.A. operando e a explicação de como funciona a plataforma,
 * exceto a live do dia 09, o iMac e a viagem"). O texto e o desenho são os da página antiga
 * (captura-globalfly/index.html); o CSS está em styles/cadastro-como-funciona.css, com o escopo .cpl-lp.
 *
 * Mora na casca para escapar da troca de paleta do build: as cores do gráfico da cabine ficam as originais.
 * Sem import: é texto e um script que liga a cabine (reprise de sessões reais, operação por operação).
 */

/** A faixa dourada que corre (sem as chamadas da live). */
export const FAIXA = `<div class="lp-faixa" aria-hidden="true"><div class="lp-faixa-rolo"><span>5 I.A. operando em dólar</span><span>Gold, Black e Prestige</span><span>Acompanhe pelo celular</span><span>Aulas do zero</span><span>Salas ao vivo todos os dias</span><span>US$ 10.000 virtuais para treinar</span><span>5 I.A. operando em dólar</span><span>Gold, Black e Prestige</span><span>Acompanhe pelo celular</span><span>Aulas do zero</span><span>Salas ao vivo todos os dias</span><span>US$ 10.000 virtuais para treinar</span></div></div>`

/** As seções, com o caminho base do site (BASE_URL) nas imagens. */
export const secoesComoFunciona = (b: string) => `
  <section class="lp-oque" aria-labelledby="oque-titulo">
    <div class="lp-cab">
      <span class="lp-rotulo">Para quem está chegando agora</span>
      <h2 id="oque-titulo">O que é a GlobalFly?</h2>
      <p>É uma plataforma em que <b>as I.A. analisam o mercado e operam automaticamente por você</b>, direto na sua conta da corretora e seguindo as regras que você escolhe. Você não precisa entender de gráfico nem ficar na frente da tela.</p>
    </div>
    <div class="lp-oque-fluxo" aria-label="Como as partes se ligam">
      <div class="lp-oque-no">
        <i aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg></i>
        <b>Você</b><span>Escolhe a I.A., a meta e o limite, pelo celular</span>
      </div>
      <div class="lp-oque-linha" aria-hidden="true"><u></u></div>
      <div class="lp-oque-no lp-oque-ia">
        <i aria-hidden="true"><img src="${b}globalfly-gf-escuro.png" alt="" width="546" height="315" /></i>
        <b>A I.A. da GlobalFly</b><span>Opera sozinha, em segundos, e para na meta ou no limite</span>
      </div>
      <div class="lp-oque-linha" aria-hidden="true"><u></u></div>
      <div class="lp-oque-no">
        <i aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/></svg></i>
        <b>Sua conta na corretora</b><span>Corretora internacional: o dinheiro fica sempre no seu nome</span>
      </div>
    </div>
    <ol class="lp-oque-passos">
      <li><span>1</span><b>Abra a sua conta</b><p>Na GlobalFly e na corretora. Leva poucos minutos e o seu dinheiro fica na sua conta.</p></li>
      <li><span>2</span><b>Escolha a I.A. e as regras</b><p>Quanto entra em cada operação, a meta do dia e o limite de perda. Quem decide é você.</p></li>
      <li><span>3</span><b>A I.A. opera por você</b><p>Ela entra e sai do mercado em dólar e para sozinha quando bate a meta ou o limite.</p></li>
      <li><span>4</span><b>Acompanhe pelo celular</b><p>Cada operação, o resultado e o aviso quando a sessão termina.</p></li>
    </ol>
    <p class="lp-oque-calma"><b>Nunca operou?</b> As aulas ensinam do zero, e você treina com US$ 10.000 virtuais antes de usar o seu dinheiro.</p>
  </section>
  <section class="lp-real" aria-labelledby="real-titulo">
    <div class="lp-cab">
      <span class="lp-rotulo">A plataforma por dentro</span>
      <h2 id="real-titulo">Isso é a GlobalFly funcionando. Números tirados da própria plataforma.</h2>
      <p>Você escolhe a I.A., define entrada, meta e limite de perda, e ela opera sozinha. Quando a sessão termina, o aviso chega no seu celular.</p>
    </div>
    <div class="lp-real-grade">
      <div class="lp-iphone" aria-label="Avisos de sessões encerradas na meta, na tela bloqueada do celular">
        <span class="lp-iphone-botao acao" aria-hidden="true"></span>
        <span class="lp-iphone-botao vol1" aria-hidden="true"></span>
        <span class="lp-iphone-botao vol2" aria-hidden="true"></span>
        <span class="lp-iphone-botao lado" aria-hidden="true"></span>
        <div class="lp-iphone-tela">
          <div class="lp-iphone-fundo" aria-hidden="true"></div>
          <div class="lp-iphone-status" aria-hidden="true">
            <span>GlobalFly</span>
            <i class="lp-iphone-ilha"></i>
            <span class="lp-iphone-icones">
              <svg class="lp-ic-sinal" viewBox="0 0 17 11"><rect x="0" y="7" width="3" height="4" rx=".9"/><rect x="4.6" y="4.8" width="3" height="6.2" rx=".9"/><rect x="9.2" y="2.4" width="3" height="8.6" rx=".9"/><rect x="13.8" y="0" width="3" height="11" rx=".9"/></svg>
              <svg class="lp-ic-wifi" viewBox="0 0 16 11.5"><path d="M8 11.5 5.7 9a3.3 3.3 0 0 1 4.6 0z"/><path d="M3.2 6.3a6.8 6.8 0 0 1 9.6 0l-1.5 1.6a4.6 4.6 0 0 0-6.6 0z"/><path d="M.4 3.4a10.8 10.8 0 0 1 15.2 0l-1.5 1.6a8.6 8.6 0 0 0-12.2 0z"/></svg>
              <svg class="lp-ic-bateria" viewBox="0 0 26 12"><rect x=".6" y=".6" width="22.4" height="10.8" rx="3.3" fill="none" stroke="currentColor" stroke-width="1.1" opacity=".42"/><rect x="2.3" y="2.3" width="17.6" height="7.4" rx="1.9"/><path d="M24.4 4.1v3.8a2 2 0 0 0 0-3.8z" opacity=".42"/></svg>
            </span>
          </div>
          <div class="lp-iphone-hora">
            <svg class="lp-iphone-cadeado" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0110 0v3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><rect x="5" y="11" width="14" height="10" rx="2.6"/></svg>
            <span>Sexta-feira, 30 de outubro</span>
            <b>12:10</b>
          </div>
          <div class="lp-notifs" data-notifs>
            <div class="lp-notif"><img src="${b}pwa-globalfly/icon-180.png" alt="" width="38" height="38" /><div><p class="lp-notif-l1"><b>✅ GF Falcon · Meta atingida</b><em>12:08</em></p><span>+US$ 62,55 em 46 operações<br />30 positivas</span></div></div>
            <div class="lp-notif"><img src="${b}pwa-globalfly/icon-180.png" alt="" width="38" height="38" /><div><p class="lp-notif-l1"><b>✅ GF Legacy · Meta atingida</b><em>11:42</em></p><span>+US$ 10,27 em 74 operações<br />45 positivas</span></div></div>
            <div class="lp-notif"><img src="${b}pwa-globalfly/icon-180.png" alt="" width="38" height="38" /><div><p class="lp-notif-l1"><b>✅ GF Raptor · Meta atingida</b><em>08:58</em></p><span>+US$ 100,45 em 628 operações<br />473 positivas</span></div></div>
          </div>
          <div class="lp-iphone-rodape" aria-hidden="true">
            <i><svg viewBox="0 0 24 24"><path d="M8 2h8v4l-2 3v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V9L8 6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="1.3"/></svg></i>
            <i><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13.5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></i>
          </div>
          <i class="lp-iphone-barra" aria-hidden="true"></i>
          <i class="lp-iphone-reflexo" aria-hidden="true"></i>
        </div>
      </div>

      <div class="lp-prints">
        <article class="lp-print">
          <header><div><b>GF Raptor</b><span>Volatility 75 · sessão encerrada</span></div><span class="lp-selo-meta">Meta atingida</span></header>
          <div class="lp-print-res"><b>+US$ 125,21</b><span>em 10 minutos</span></div>
          <svg class="lp-curva" data-curva viewBox="0 0 600 150" preserveAspectRatio="none" aria-label="Resultado da sessão, operação a operação"></svg>
          <dl class="lp-print-dados">
            <div><dt>Operações</dt><dd>286</dd></div><div><dt>Positivas</dt><dd class="pos">227</dd></div><div><dt>Negativas</dt><dd class="neg">59</dd></div>
            <div><dt>Entrada</dt><dd>US$ 2,50</dd></div><div><dt>Meta</dt><dd>US$ 120</dd></div><div><dt>Limite</dt><dd>US$ 300</dd></div>
          </dl>
        </article>

        <article class="lp-print lp-print-manual">
          <header><div><b>Operação manual</b><span>Volatility 75 · Sobe · 1 minuto</span></div><span class="lp-selo-meta">Ganhou</span></header>
          <div class="lp-manual">
            <div><dt>Entrada</dt><dd>US$ 100,00</dd></div>
            <svg viewBox="0 0 40 12" aria-hidden="true"><path d="M2 6h30" stroke="#D4A64A" stroke-width="1.6"/><path d="M30 2l7 4-7 4z" fill="#D4A64A"/></svg>
            <div><dt>Recebeu</dt><dd>US$ 178,32</dd></div>
            <div class="lp-manual-lucro"><dt>Lucro</dt><dd>+US$ 78,32</dd></div>
          </div>
        </article>
      </div>
    </div>
  </section>
    <section class="lp-cabine-sec">
      <div class="lp-cab">
        <span class="lp-rotulo">A cabine</span>
        <h2>Uma I.A. operando por você, em dólar.</h2>
        <p>Você escolhe a I.A., a entrada, a meta e o limite de perda. Ela entra, sai, recupera e para sozinha quando bate a meta ou o limite.</p>
      </div>

      <div class="lp-cabine" data-cabine>
        <div class="lp-cab-ias" role="tablist" aria-label="Escolha a I.A." data-cab-ias></div>
        <div class="lp-cab-tela">
          <div class="lp-cab-topo">
            <img data-cab-capa src="${b}aulas-globalfly/robo-falcon-mobile.webp" alt="" width="640" height="960" />
            <div class="lp-cab-quem">
              <b data-cab-nome>GF Falcon</b>
              <span class="lp-cab-status" data-cab-status><i aria-hidden="true"></i><em data-cab-fase>Operando</em></span>
            </div>
            <div class="lp-cab-res"><span>Resultado</span><b data-cab-res>+US$ 0,00</b></div>
          </div>
          <div class="lp-cab-meta">
            <span>Meta <b data-cab-meta>US$ 60</b></span>
            <div class="lp-cab-trilho"><i data-cab-barra></i></div>
            <span class="lp-cab-pct" data-cab-pct>0%</span>
          </div>
          <div class="lp-cab-grafico">
            <canvas data-cab-grafico width="900" height="300" aria-hidden="true"></canvas>
            <span class="lp-cab-ativo"><i aria-hidden="true"></i>Volatility 75 <b data-cab-preco>—</b></span>
          </div>
          <dl class="lp-cab-nums">
            <div><dt>Operações</dt><dd data-cab-n>0</dd></div>
            <div><dt>Positivas</dt><dd class="pos" data-cab-pos>0</dd></div>
            <div><dt>Entrada</dt><dd data-cab-ent>—</dd></div>
          </dl>
          <ol class="lp-cab-ops" data-cab-ops aria-live="off"></ol>
          <div class="lp-cab-alerta" data-cab-alerta hidden>
            <img src="${b}pwa-globalfly/icon-180.png" alt="" width="36" height="36" />
            <div><span>GlobalFly · agora</span><b data-cab-alerta-titulo>✅ GF Falcon · Meta atingida</b><em data-cab-alerta-txt></em></div>
          </div>
        </div>
        <p class="lp-cab-nota" data-cab-nota>Reprise de sessões gravadas na plataforma, operação por operação.</p>
      </div>

      <div class="lp-hangar" aria-label="As I.A. da GlobalFly">
        <figure><img src="${b}aulas-globalfly/robo-phenom-mobile.webp" alt="GF Phenom" width="640" height="960" loading="lazy" /></figure>
        <figure><img src="${b}aulas-globalfly/robo-gulf-mobile.webp" alt="GF Gulf" width="640" height="960" loading="lazy" /></figure>
        <figure><img src="${b}aulas-globalfly/robo-raptor-mobile.webp" alt="GF Raptor" width="640" height="960" loading="lazy" /></figure>
        <figure><img src="${b}aulas-globalfly/robo-falcon-mobile.webp" alt="GF Falcon" width="640" height="960" loading="lazy" /></figure>
        <figure><img src="${b}aulas-globalfly/robo-legacy-mobile.webp" alt="GF Legacy" width="640" height="960" loading="lazy" /></figure>
      </div>
    </section>
    <section class="lp-libera-sec">
      <div class="lp-cab">
        <span class="lp-rotulo">O que vem com o GF Member</span>
        <h2>A plataforma completa</h2>
      </div>
      <ul class="lp-libera">
        <li><b>As I.A. de operação</b><p>Phenom, Gulf, Raptor, Falcon e Legacy. Cada uma com a sua estratégia.</p></li>
        <li><b>Operação manual</b><p>Gráfico ao vivo para quem gosta de operar com as próprias mãos.</p></li>
        <li><b>Salas ao vivo</b><p>Operações acompanhadas pela equipe, em tempo real, todos os dias.</p></li>
        <li><b>Aulas e apostila</b><p>Do primeiro passo ao gerenciamento, no seu ritmo.</p></li>
        <li><b>Relatórios</b><p>Tudo o que você operou, dia a dia, num lugar só.</p></li>
        <li><b>US$ 10.000 virtuais</b><p>Para treinar no simulador antes de usar o seu dinheiro.</p></li>
      </ul>
    </section>
`

/* ------------------------------------------------------------------ a cabine
   (31/10/2026) Uma sessão de cada I.A., gravada na plataforma e terminada na meta: [entrada, 1 = dígito acima
   / 0 = abaixo, resultado, preço do Volatility 75 na entrada]. Nada aqui é sorteado: é a sessão como foi. */
export type Sessao = { n: string; f: string; meta: number; dia: string; ops: number[][] }
export const SESSOES: Sessao[] = [
        { n: 'GF Falcon', f: 'falcon', meta: 60, dia: '30/10', ops: [[5,0,-5,39062.78],[10.17,0,-10.17,39065.83],[28.98,0,16.16,39074.80],[5,0,2.79,39075.09],[5,0,-5,39079.68],[10.17,0,5.67,39079.48],[5,0,2.79,39100.83],[5,0,2.79,39105.93],[5,0,2.79,39100.68],[5,0,2.79,39096.24],[5,0,-5,39093.58],[10.17,0,-10.17,39093.39],[28.98,0,16.16,39091.78],[5,0,2.79,39096.32],[5,0,2.79,39099.13],[5,0,2.79,39102.99],[5,0,-5,39113.52],[10.17,0,5.67,39117.58],[5,0,-5,39122.70],[10.17,0,5.67,39117.22],[5,0,-5,39114.78],[10.17,0,5.67,39101.40],[5,0,2.79,39091.85],[5,0,2.79,39106.89],[5,0,-5,39114.57],[10.17,0,5.67,39125.32],[5,0,2.79,39131.90],[5,0,-5,39131.67],[10.17,0,5.67,39138.17],[5,0,2.79,39125.32],[5,0,2.79,39130.92],[5,0,-5,39130.47],[10.17,0,5.67,39120.04],[5,0,2.79,39120.55],[5,0,2.79,39120.50],[5,0,2.79,39116.69],[5,0,-5,39104.73],[10.17,0,-10.17,39106.28],[28.98,0,16.16,39109.18],[5,0,-5,39097.39],[10.17,0,-10.17,39108.95],[28.98,0,-28.98,39109.20],[82.55,0,46.03,39109.91],[5,0,2.79,39111.34],[5,0,2.79,39113.44],[5,0,2.79,39108.36]] },
        { n: 'GF Phenom', f: 'phenom', meta: 20, dia: '23/10', ops: [[0.8,0,-0.8,39125.88],[0.86,0,1.65,39117.93],[0.8,0,-0.8,39156.40],[0.86,0,1.65,39144.04],[0.8,0,1.54,39135.24],[0.8,0,-0.8,39138.01],[0.86,0,1.65,39145.34],[0.8,0,-0.8,39122.19],[0.86,0,-0.86,39112.78],[1.33,0,-1.33,39117.56],[2.03,0,3.91,39108.53],[0.8,0,-0.8,39057.80],[0.86,0,-0.86,39066.10],[1.33,0,2.56,39063.20],[0.8,0,-0.8,39064.61],[0.86,0,-0.86,39062.73],[1.33,0,2.56,39065.05],[0.8,0,1.54,39047.00],[0.8,0,1.54,39061.22],[0.8,0,1.54,39044.95],[0.8,0,1.54,39005.16],[0.8,0,1.54,39015.19],[0.8,0,-0.8,38951.39],[0.86,0,-0.86,38938.97],[1.33,0,-1.33,38950.89],[2.03,0,-2.03,38943.46],[3.23,0,-3.23,38931.41],[5.31,0,-5.31,38913.06],[8.72,0,16.78,38908.35],[0.8,0,-0.8,38928.10],[0.86,0,-0.86,38932.64],[1.33,0,2.56,38937.13],[0.8,0,-0.8,38955.28],[0.86,0,-0.86,38966.67],[1.33,0,-1.33,38973.13],[2.03,0,-2.03,38981.47],[3.23,0,6.21,38976.82],[0.8,0,-0.8,38996.85],[0.86,0,-0.86,38995.87],[1.33,0,2.56,38988.68]] },
        { n: 'GF Legacy', f: 'legacy', meta: 10, dia: '31/10', ops: [[0.35,1,0.2,38363.75],[0.35,1,0.2,38366.30],[0.35,1,0.2,38372.17],[0.35,1,-0.35,38357.20],[0.7,1,0.39,38352.34],[0.35,1,0.2,38347.22],[0.35,1,-0.35,38353.79],[0.7,1,0.39,38361.38],[0.35,1,0.2,38360.19],[0.35,1,0.2,38371.63],[0.35,1,0.2,38370.03],[0.35,1,0.2,38371.18],[0.35,1,-0.35,38379.62],[0.7,1,0.39,38379.42],[0.35,1,0.2,38370.46],[0.35,1,0.2,38357.07],[0.35,1,0.2,38360.49],[0.35,1,0.2,38353.40],[0.35,1,-0.35,38354.21],[0.7,1,-0.7,38357.37],[2.01,1,1.12,38370.57],[0.35,1,0.2,38362.84],[0.35,1,0.2,38349.79],[0.35,1,0.2,38340.59],[0.35,1,-0.35,38339.33],[0.7,1,0.39,38349.29],[0.35,1,-0.35,38368.03],[0.7,1,-0.7,38372.07],[2.01,1,1.12,38365.44],[0.35,1,0.2,38359.06],[0.35,1,-0.35,38363.61],[0.7,1,-0.7,38362.57],[2.01,1,-2.01,38350.96],[5.73,1,3.2,38352.86],[0.35,1,0.2,38349.96],[0.35,1,0.2,38341.48],[0.35,1,0.2,38330.24],[0.35,1,0.2,38327.53],[0.35,1,0.2,38330.43],[0.35,1,0.2,38329.22],[0.35,1,0.2,38330.68],[0.35,1,-0.35,38321.18],[0.7,1,0.39,38317.96],[0.35,1,0.2,38329.23],[0.35,1,-0.35,38329.97],[0.7,1,0.39,38330.83],[0.35,1,0.2,38324.76],[0.35,1,-0.35,38334.46],[0.7,1,0.39,38334.64],[0.35,1,0.2,38339.92],[0.35,1,-0.35,38348.38],[0.7,1,-0.7,38346.35],[2.01,1,1.12,38363.02],[0.35,1,-0.35,38375.29],[0.7,1,-0.7,38377.23],[2.01,1,-2.01,38373.63],[5.73,1,-5.73,38361.94],[16.3,1,9.09,38377.87],[0.35,1,-0.35,38369.08],[0.7,1,-0.7,38367.05],[2.01,1,-2.01,38377.89],[5.73,1,3.2,38374.09],[0.35,1,0.2,38368.62],[0.35,1,0.2,38367.60],[0.35,1,0.2,38349.95],[0.35,1,0.2,38348.84],[0.35,1,-0.35,38355.61],[0.7,1,-0.7,38365.66],[2.01,1,1.12,38358.35],[0.35,1,0.2,38357.69],[0.35,1,-0.35,38376.29],[0.7,1,-0.7,38384.46],[2.01,1,1.12,38396.95],[0.35,1,0.2,38396.86],[0.35,1,-0.35,38381.53],[0.7,1,-0.7,38385.00],[2.01,1,1.12,38389.45],[0.35,1,-0.35,38385.35],[0.7,1,-0.7,38396.02],[2.01,1,1.12,38400.21],[0.35,1,-0.35,38419.16],[0.7,1,-0.7,38423.97],[2.01,1,-2.01,38420.80],[5.73,1,-5.73,38416.72],[16.3,1,9.09,38414.54],[0.35,1,0.2,38410.25],[0.35,1,-0.35,38404.41],[0.7,1,0.39,38420.09],[0.35,1,0.2,38411.25],[0.35,1,-0.35,38418.74],[0.7,1,0.39,38425.75],[0.35,1,0.2,38426.94],[0.35,1,0.2,38432.75],[0.35,1,0.2,38432.60],[0.35,1,-0.35,38429.06],[0.7,1,0.39,38426.40],[0.35,1,-0.35,38412.58],[0.7,1,0.39,38414.17],[0.35,1,0.2,38411.45],[0.35,1,-0.35,38406.22],[0.7,1,0.39,38398.86],[0.35,1,0.2,38401.05],[0.35,1,0.2,38401.46],[0.35,1,0.2,38400.17]] },
]
/** A curva real da sessão do print (GF Raptor, 29/10, 286 operações), operação a operação. */
const CURVA: number[] = [-2.5,-5.22,-5.07,-4.92,-4.77,-4.62,-4.47,-4.32,-4.17,-4.02,-6.52,-1.29,-1.14,-0.99,-0.84,-0.69,-3.19,2.04,2.19,2.34,2.49,2.64,2.79,2.94,3.09,3.24,3.39,3.54,3.69,3.84,3.99,4.14,4.29,4.44,4.59,4.74,2.24,-0.48,7.49,7.64,7.79,7.94,8.09,8.24,8.39,8.54,8.69,8.84,8.99,9.14,9.29,9.44,9.59,9.74,9.89,10.04,10.19,10.34,10.49,10.64,10.79,8.29,5.57,13.54,13.69,13.84,13.99,14.14,14.29,14.44,14.59,14.74,14.89,15.04,15.19,12.69,9.97,5.83,-0.53,-10.64,-27.25,-54.54,31.73,31.88,32.03,32.18,32.33,32.48,32.63,32.78,32.93,33.08,33.23,30.73,35.96,36.11,36.26,36.41,36.56,36.71,36.86,37.01,34.51,31.79,39.76,39.91,40.06,40.21,40.36,40.51,40.66,40.81,40.96,41.11,41.26,41.41,41.56,41.71,41.86,42.01,42.16,42.31,42.46,42.61,42.76,42.91,43.06,43.21,43.36,43.51,43.66,43.81,43.96,44.11,44.26,44.41,44.56,44.71,44.86,45.01,45.16,45.31,45.46,45.61,45.76,45.91,46.06,46.21,46.36,46.51,46.66,46.81,46.96,47.11,47.26,47.41,47.56,45.06,50.29,47.79,45.07,40.93,34.57,24.46,7.85,60.36,57.86,55.14,63.11,63.26,63.41,63.56,63.71,63.86,64.01,64.16,61.66,58.94,66.91,67.06,67.21,67.36,67.51,65.01,62.29,58.15,70.39,70.54,70.69,70.84,70.99,71.14,68.64,65.92,61.78,55.42,45.31,77.27,77.42,77.57,77.72,77.87,78.02,78.17,78.32,78.47,78.62,78.77,76.27,73.55,81.52,81.67,81.82,81.97,82.12,82.27,82.42,82.57,82.72,82.87,83.02,80.52,85.75,85.9,86.05,86.2,83.7,80.98,76.84,70.48,60.37,92.33,92.48,92.63,92.78,90.28,87.56,83.42,95.66,95.81,95.96,96.11,96.26,96.41,96.56,96.71,96.86,97.01,97.16,97.31,97.46,94.96,100.19,100.34,100.49,100.64,100.79,98.29,95.57,103.54,103.69,103.84,103.99,104.14,104.29,104.44,101.94,107.17,107.32,107.47,107.62,107.77,107.92,108.07,108.22,108.37,108.52,108.67,106.17,103.45,99.31,92.95,82.84,66.23,38.94,125.21]

/**
 * Liga as animações das seções dentro de `raiz`: a curva do print, a entrada das seções ao rolar e a cabine
 * (reprise operação por operação, uma por segundo; pausa fora da tela). Devolve a função que desliga tudo.
 */
export function ligarComoFunciona(raiz: HTMLElement, b: string): () => void {
  const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches
  const limpezas: Array<() => void> = []

  // ---------- a curva do print
  const svg = raiz.querySelector<SVGSVGElement>('[data-curva]')
  if (svg) {
    const min = -60, max = 130
    const X = (i: number) => (i / (CURVA.length - 1) * 600).toFixed(1)
    const Y = (v: number) => (8 + (max - v) / (max - min) * 134).toFixed(1)
    const pts = CURVA.map((v, i) => X(i) + ',' + Y(v)).join(' ')
    svg.innerHTML = '<defs><linearGradient id="cpl-curva-ouro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5FC48C" stop-opacity=".35"/><stop offset="1" stop-color="#5FC48C" stop-opacity="0"/></linearGradient></defs>' +
      '<line x1="0" x2="600" y1="' + Y(0) + '" y2="' + Y(0) + '" stroke="rgba(156,177,199,.35)" stroke-dasharray="4 4"/>' +
      '<line x1="0" x2="600" y1="' + Y(120) + '" y2="' + Y(120) + '" stroke="rgba(95,196,140,.6)" stroke-dasharray="4 4"/>' +
      '<text x="4" y="' + (Number(Y(120)) - 4) + '" fill="#5FC48C" font-size="11" font-family="ui-monospace, Menlo, monospace">meta</text>' +
      '<polygon points="0,' + Y(0) + ' ' + pts + ' 600,' + Y(0) + '" fill="url(#cpl-curva-ouro)"/>' +
      '<polyline class="lp-curva-linha" points="' + pts + '" fill="none" stroke="#5FC48C" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
      '<circle cx="600" cy="' + Y(125.21) + '" r="4" fill="#5FC48C"/>'
  }

  // ---------- o iPhone: os avisos chegam por cima e empurram os anteriores para baixo, como na tela bloqueada
  const notifs = raiz.querySelector<HTMLElement>('[data-notifs]')
  if (notifs && !reduzir && 'IntersectionObserver' in window) {
    // em repouso ficam os três (a página nunca abre vazia); a fila guarda os três na ordem em que chegaram
    const chegada = Array.from(notifs.children).reverse().map((c) => c.cloneNode(true)) as HTMLElement[] // modelos intactos
    let vivo = false, passo: number | undefined, i = 0
    const travar = () => { notifs.style.height = ''; notifs.style.height = notifs.offsetHeight + 'px' }
    // o relógio anda junto: cada aviso chega dois minutos antes da hora que aparece na tela
    const relogio = raiz.querySelector<HTMLElement>('.lp-iphone-hora b')
    const HORAS = ['09:00', '11:44', '12:10']
    const chegar = () => {
      if (relogio) relogio.textContent = HORAS[i] ?? '12:10'
      const el = chegada[i].cloneNode(true) as HTMLElement
      // onde cada aviso já na tela está agora, para escorregar até o lugar novo (FLIP)
      const antes = new Map(Array.from(notifs.children).map((c) => [c, (c as HTMLElement).getBoundingClientRect().top]))
      el.classList.add('lp-notif-chega')
      notifs.insertBefore(el, notifs.firstChild)
      antes.forEach((topo, c) => {
        const h = c as HTMLElement, dy = topo - h.getBoundingClientRect().top
        h.style.transition = 'none'; h.style.transform = `translateY(${dy}px)`
        void h.offsetWidth
        h.style.transition = 'transform .6s cubic-bezier(.2, .9, .25, 1)'; h.style.transform = ''
      })
      i++
      passo = window.setTimeout(i < chegada.length ? chegar : esvaziar, i < chegada.length ? 1900 : 5200)
    }
    const esvaziar = () => {
      Array.from(notifs.children).forEach((c) => c.classList.add('lp-notif-sai'))
      passo = window.setTimeout(() => { notifs.innerHTML = ''; i = 0; passo = window.setTimeout(chegar, 700) }, 450)
    }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !vivo) { vivo = true; travar(); esvaziar() }
      else if (!e.isIntersecting && vivo) { vivo = false; clearTimeout(passo); if (relogio) relogio.textContent = '12:10'; notifs.innerHTML = ''; chegada.slice().reverse().forEach((c) => notifs.appendChild(c.cloneNode(true))) }
    }, { threshold: 0.35 })
    io.observe(notifs)
    limpezas.push(() => { io.disconnect(); clearTimeout(passo) })
  }

  // ---------- entrada das seções ao rolar (tudo já fica visível sem script)
  if ('IntersectionObserver' in window && !reduzir) {
    const alvos = raiz.querySelectorAll<HTMLElement>('.lp-cab, .lp-oque-no, .lp-oque-passos li, .lp-cabine, .lp-hangar figure, .lp-libera li')
    const obs = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('lp-visto'); obs.unobserve(e.target) } }), { rootMargin: '0px 0px -8% 0px' })
    alvos.forEach((el, i) => { if (el.getBoundingClientRect().top > innerHeight) { el.classList.add('lp-anima'); el.style.transitionDelay = (i % 5) * 70 + 'ms'; obs.observe(el) } })
    limpezas.push(() => obs.disconnect())
  }

  // ---------- a cabine
  const cab = raiz.querySelector<HTMLElement>('[data-cabine]')
  if (!cab) return () => limpezas.forEach((f) => f())
  const q = <T extends Element = HTMLElement>(s: string) => cab.querySelector(s) as T
  const tela = q<HTMLCanvasElement>('[data-cab-grafico]'), ctx = tela.getContext('2d')!
  const ias = q('[data-cab-ias]'), capa = q<HTMLImageElement>('[data-cab-capa]'), nomeEl = q('[data-cab-nome]'), status = q('[data-cab-status]'), faseEl = q('[data-cab-fase]')
  const resEl = q('[data-cab-res]'), metaEl = q('[data-cab-meta]'), barraMeta = q('[data-cab-barra]'), pct = q('[data-cab-pct]'), precoEl = q('[data-cab-preco]')
  const nEl = q('[data-cab-n]'), posEl = q('[data-cab-pos]'), entEl = q('[data-cab-ent]'), lista = q('[data-cab-ops]')
  const alerta = q('[data-cab-alerta]'), alertaTit = q('[data-cab-alerta-titulo]'), alertaTxt = q('[data-cab-alerta-txt]'), nota = q('[data-cab-nota]')
  const moeda = (v: number, sinal?: boolean) => { const t = 'US$ ' + Math.abs(v).toFixed(2).replace('.', ','); return sinal ? (v < 0 ? '−' : '+') + t : t }
  const preco = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  ias.innerHTML = ''
  SESSOES.forEach((s, i) => {
    const bt = document.createElement('button')
    bt.type = 'button'; bt.setAttribute('role', 'tab'); bt.className = 'lp-cab-ia'
    bt.innerHTML = '<img src="' + b + 'aulas-globalfly/robo-' + s.f + '-mobile.webp" alt="" width="64" height="96" loading="lazy" /><span>' + s.n.replace('GF ', '') + '</span><i><u></u></i>'
    bt.addEventListener('click', () => escolher(i, true))
    ias.appendChild(bt)
  })
  const fitas = ias.querySelectorAll<HTMLElement>('.lp-cab-ia')
  const hangar = raiz.querySelectorAll<HTMLElement>('.lp-hangar figure')
  hangar.forEach((fig) => {
    const img = fig.querySelector('img'), i = SESSOES.map((x) => x.n).indexOf(img ? img.alt : '')
    if (i < 0) return
    fig.dataset.ia = String(i); fig.setAttribute('role', 'button'); fig.tabIndex = 0; fig.setAttribute('aria-label', 'Ver a sessão da ' + SESSOES[i].n)
    const ir = () => { escolher(i, true); if (cab.getBoundingClientRect().top < 0) cab.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
    fig.addEventListener('click', ir); fig.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir() } })
  })

  let atual = 0, s = SESSOES[0], k = 0, acum = [0], mostrado = 0, alvo = 0, positivas = 0
  let rodando = false, visivel = false, timer: number | undefined, quadro = 0, pausaFim = false
  let ultimoPonto = 0, acumAntes = 1
  const passoMs = 1000 // uma operação por segundo (31/10/2026, Tiago: "rápida, mas nem tanto")
  const fase = (t: string, c: string) => { faseEl.textContent = t; status.className = 'lp-cab-status ' + c }

  function escolher(i: number, pelaPessoa?: boolean) {
    clearTimeout(timer); atual = i; s = SESSOES[i]; k = 0; acum = [0]; mostrado = 0; alvo = 0; positivas = 0; pausaFim = false
    lista.innerHTML = ''; alerta.hidden = true
    capa.src = b + 'aulas-globalfly/robo-' + s.f + '-mobile.webp'; nomeEl.textContent = s.n
    metaEl.textContent = moeda(s.meta); entEl.textContent = moeda(s.ops[0][0]); precoEl.textContent = preco(s.ops[0][3])
    nota.textContent = 'Reprise da sessão de ' + s.dia + ', gravada na plataforma, operação por operação.'
    nEl.textContent = '0 de ' + s.ops.length; posEl.textContent = '0'
    fase('Operando', 'opera')
    hangar.forEach((fig) => fig.classList.toggle('on', fig.dataset.ia === String(i)))
    fitas.forEach((f, j) => { f.classList.toggle('on', j === i); f.classList.toggle('vista', j < i); f.setAttribute('aria-selected', String(j === i)); (f.querySelector('u') as HTMLElement).style.width = j < i ? '100%' : '0%' })
    if (pelaPessoa) fitas[i].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    if (!reduzir) adiantar(3) // cada sessão já entra com as três primeiras operações (nunca começa vazia)
    if (rodando) timer = window.setTimeout(operar, 500)
  }
  function linha(op: number[], n: number, pronta: boolean) {
    const recup = op[0] > s.ops[0][0] + 0.001, ganhou = op[2] > 0
    const li = document.createElement('li')
    li.innerHTML = '<span class="lp-op-n">#' + n + '</span><span class="lp-op-tipo"><b>' + preco(op[3]) + '</b>' + (recup ? '<em>Recuperação</em>' : '') + '</span><span class="lp-op-ent">' + moeda(op[0]) + '</span>' +
      (pronta ? '<span class="lp-op-res ' + (ganhou ? 'pos' : 'neg') + '">' + moeda(op[2], true) + '</span>' : '<span class="lp-op-res">…</span>')
    if (pronta) { li.className = ganhou ? 'ganhou' : 'perdeu'; li.style.animation = 'none' }
    lista.insertBefore(li, lista.firstChild); while (lista.children.length > 5) lista.removeChild(lista.lastChild!)
    return { li, recup, ganhou }
  }
  function operar() {
    if (!rodando || pausaFim) return
    const op = s.ops[k], n = k + 1
    const { li, recup, ganhou } = linha(op, n, false)
    entEl.textContent = moeda(op[0]); precoEl.textContent = preco(op[3])
    fase(recup ? 'Recuperando' : 'Operando', recup ? 'recupera' : 'opera')
    const meio = passoMs * 0.45
    timer = window.setTimeout(() => {
      if (!rodando) return
      const r = li.querySelector('.lp-op-res')!
      r.textContent = moeda(op[2], true); r.className = 'lp-op-res ' + (ganhou ? 'pos' : 'neg'); li.classList.add(ganhou ? 'ganhou' : 'perdeu')
      if (ganhou) positivas++
      k = n; alvo = +(alvo + op[2]).toFixed(2); acum.push(alvo)
      nEl.textContent = n + ' de ' + s.ops.length; posEl.textContent = String(positivas)
      if (k >= s.ops.length) return terminar()
      timer = window.setTimeout(operar, passoMs - meio)
    }, meio)
  }
  function terminar() {
    pausaFim = true
    fase('Meta atingida', 'meta')
    alertaTit.textContent = '✅ ' + s.n + ' · Meta atingida'
    alertaTxt.textContent = moeda(alvo, true) + ' em ' + s.ops.length + ' operações · ' + positivas + ' positivas'
    alerta.hidden = false
    timer = window.setTimeout(() => escolher((atual + 1) % SESSOES.length), 4200)
  }
  function adiantar(qtd: number) {
    for (let x = 0; x < qtd && k < s.ops.length - 1; x++) {
      const op = s.ops[k], n = k + 1
      const { ganhou } = linha(op, n, true)
      if (ganhou) positivas++
      k = n; alvo = +(alvo + op[2]).toFixed(2); acum.push(alvo)
    }
    mostrado = alvo; entEl.textContent = moeda(s.ops[k][0]); precoEl.textContent = preco(s.ops[k - 1][3])
    nEl.textContent = k + ' de ' + s.ops.length; posEl.textContent = String(positivas)
  }
  function desenhar() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = tela.clientWidth, h = tela.clientHeight
    if (!w || !h) return
    if (tela.width !== Math.round(w * dpr) || tela.height !== Math.round(h * dpr)) { tela.width = Math.round(w * dpr); tela.height = Math.round(h * dpr) }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h)
    const tudo = [0]; for (let i = 0, a = 0; i < s.ops.length; i++) { a += s.ops[i][2]; tudo.push(a) }
    const min = Math.min(0, ...tudo), max = Math.max(s.meta, ...tudo)
    const pad = (max - min) * 0.1, topo = 30, base = h - 14
    const X = (i: number) => 10 + i / s.ops.length * (w - 20), Y = (v: number) => base - (v - min + pad) / (max - min + pad * 2) * (base - topo)
    ctx.setLineDash([5, 5]); ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(95,196,140,.55)'; ctx.beginPath(); ctx.moveTo(0, Y(s.meta)); ctx.lineTo(w, Y(s.meta)); ctx.stroke()
    ctx.strokeStyle = 'rgba(156,177,199,.22)'; ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(w, Y(0)); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = 'rgba(95,196,140,.85)'; ctx.font = '700 10.5px ui-monospace, "SF Mono", Menlo, monospace'; ctx.textAlign = 'right'
    ctx.fillText('META ' + moeda(s.meta), w - 8, Y(s.meta) - 6); ctx.textAlign = 'left'
    const feito = acum.length - 1, frac = Math.min(1, (performance.now() - ultimoPonto) / 260)
    const pts = acum.map((v, i) => [X(i), Y(v)])
    if (feito > 0 && frac < 1) { const a0 = pts[feito - 1], a1 = pts[feito]; pts[feito] = [a0[0] + (a1[0] - a0[0]) * frac, a0[1] + (a1[1] - a0[1]) * frac] }
    const grad = ctx.createLinearGradient(0, topo, 0, base); grad.addColorStop(0, 'rgba(212,166,74,.30)'); grad.addColorStop(1, 'rgba(212,166,74,0)')
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
    ctx.lineTo(pts[pts.length - 1][0], Y(min - pad)); ctx.lineTo(pts[0][0], Y(min - pad)); ctx.closePath(); ctx.fillStyle = grad; ctx.fill()
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
    ctx.strokeStyle = '#E2B95C'; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.shadowColor = 'rgba(226,185,92,.6)'; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0
    if (s.ops.length <= 50) for (let j = 1; j < pts.length; j++) { if (j === feito && frac < 1) continue; ctx.fillStyle = s.ops[j - 1][2] > 0 ? '#5FC48C' : '#F1828A'; ctx.beginPath(); ctx.arc(pts[j][0], pts[j][1], 2.6, 0, 7); ctx.fill() }
    const u = pts[pts.length - 1], pulso = (Math.sin(performance.now() / 180) + 1) / 2
    ctx.fillStyle = 'rgba(243,213,140,' + (0.18 + pulso * 0.2) + ')'; ctx.beginPath(); ctx.arc(u[0], u[1], 8 + pulso * 4, 0, 7); ctx.fill()
    ctx.fillStyle = '#F3D58C'; ctx.beginPath(); ctx.arc(u[0], u[1], 4, 0, 7); ctx.fill()
  }
  function quadroDeTela() {
    if (acum.length !== acumAntes) { acumAntes = acum.length; ultimoPonto = performance.now() }
    mostrado += (alvo - mostrado) * 0.22; if (Math.abs(alvo - mostrado) < 0.005) mostrado = alvo
    resEl.textContent = moeda(mostrado, true); resEl.className = mostrado > 0.004 ? 'pos' : mostrado < -0.004 ? 'neg' : ''
    const p = Math.max(0, Math.min(1, mostrado / s.meta))
    barraMeta.style.width = (p * 100) + '%'; barraMeta.className = mostrado < 0 ? 'neg' : ''; pct.textContent = Math.round(Math.max(0, mostrado) / s.meta * 100) + '%'
    ;(fitas[atual].querySelector('u') as HTMLElement).style.width = pausaFim ? '100%' : Math.min(100, (k / s.ops.length) * 100) + '%'
    desenhar()
    if (rodando) quadro = requestAnimationFrame(quadroDeTela)
  }
  function ligar() {
    if (rodando) return
    rodando = true
    timer = window.setTimeout(pausaFim ? () => escolher((atual + 1) % SESSOES.length) : operar, pausaFim ? 1500 : 400)
    quadro = requestAnimationFrame(quadroDeTela)
  }
  function desligar() { rodando = false; clearTimeout(timer); cancelAnimationFrame(quadro) }
  escolher(0)
  if (reduzir) {
    s.ops.forEach((op) => { alvo = +(alvo + op[2]).toFixed(2); acum.push(alvo); if (op[2] > 0) positivas++ })
    k = s.ops.length; mostrado = alvo; nEl.textContent = k + ' de ' + k; posEl.textContent = String(positivas)
    terminar(); clearTimeout(timer); rodando = false; quadroDeTela()
  } else {
    quadroDeTela()
    const io = new IntersectionObserver((e) => { visivel = e[0].isIntersecting; if (visivel && !document.hidden) ligar(); else desligar() }, { threshold: 0.2 })
    io.observe(cab)
    const aoMudarAba = () => { if (document.hidden) desligar(); else if (visivel) ligar() }
    document.addEventListener('visibilitychange', aoMudarAba)
    limpezas.push(() => { io.disconnect(); document.removeEventListener('visibilitychange', aoMudarAba) })
  }
  const aoRedimensionar = () => { if (!rodando) desenhar() }
  addEventListener('resize', aoRedimensionar)
  limpezas.push(() => { desligar(); removeEventListener('resize', aoRedimensionar) })
  return () => limpezas.forEach((f) => f())
}
