/**
 * Os programas da placa de vídeo do recorte (WebGL2 / GLSL ES 3.00).
 *
 * Convenção de coordenadas: imagens enviadas do navegador (quadro da câmera,
 * máscara da IA, foto de fundo) chegam com a primeira linha em cima, então
 * são lidas com `y` invertido. O que é desenhado aqui dentro (máscara
 * suavizada, desfoque) já está na orientação da placa e é lido direto.
 */

export const VERTICE = `#version 300 es
in vec2 p;
out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`

/** Estabilidade no tempo: amortece o tremor, mas segue o movimento de verdade. */
export const TEMPORAL = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 cor;
uniform sampler2D cru;
uniform sampler2D anterior;
uniform float primeiro;
uniform float estabilidade;
void main() {
  // a IA dá a confiança de "fundo"; a pessoa é o resto
  float r = 1.0 - texture(cru, vec2(uv.x, 1.0 - uv.y)).r;
  float a = texture(anterior, uv).r;
  float d = abs(r - a);
  float k = mix(1.0 - 0.75 * estabilidade, 1.0, smoothstep(0.12, 0.5, d));
  float m = primeiro > 0.5 ? r : mix(a, r, k);
  cor = vec4(m, m, m, 1.0);
}`

/**
 * Desfoque do fundo real com a pessoa de fora: cada amostra pesa pelo
 * "quanto é fundo", então a cor da pessoa não escorre para o borrão (sem halo).
 * Separável: passadas horizontais e verticais alternadas.
 */
export const DESFOQUE = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 cor;
uniform sampler2D entrada;
uniform sampler2D mascara;
uniform vec2 passo;
uniform float doQuadro;
vec4 amostra(vec2 u) {
  if (doQuadro > 0.5) {
    vec3 c = textureLod(entrada, vec2(u.x, 1.0 - u.y), 1.0).rgb;
    float pessoa = textureLod(mascara, u, 1.0).r;
    return vec4(c, 1.0 - smoothstep(0.2, 0.6, pessoa));
  }
  return texture(entrada, u);
}
void main() {
  float w[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  vec4 c = amostra(uv);
  vec3 soma = c.rgb * c.a * w[0];
  float pesos = c.a * w[0];
  for (int i = 1; i < 5; i++) {
    vec4 a = amostra(uv + passo * float(i));
    vec4 b = amostra(uv - passo * float(i));
    soma += (a.rgb * a.a + b.rgb * b.a) * w[i];
    pesos += (a.a + b.a) * w[i];
  }
  vec3 rgb = pesos > 1e-4 ? soma / pesos : c.rgb;
  cor = vec4(rgb, clamp(pesos, 0.0, 1.0));
}`

/**
 * Composição final:
 *  - contorno guiado pela imagem (bilateral conjunto, 5×5 na grade da máscara);
 *  - corte suave entre os limiares;
 *  - harmonia de cor (a pessoa puxa um pouco o tom do fundo);
 *  - luz do ambiente na borda (light wrap);
 *  - mistura com o fundo escolhido ("cobrir", sem distorcer).
 */
export const COMPOSICAO = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 cor;
uniform sampler2D quadro;
uniform sampler2D mascara;
uniform sampler2D fundo;
uniform int fundoDoQuadro;
uniform vec4 retFundo;
uniform vec2 texelMascara;
uniform float limiarBaixo;
uniform float limiarAlto;
uniform float sensibilidadeDeCor;
uniform float luzDoAmbiente;
uniform float harmonia;

vec3 cam(vec2 u, float lod) { return textureLod(quadro, vec2(u.x, 1.0 - u.y), lod).rgb; }
vec3 fundoEm(vec2 u, float lod) {
  vec2 b = retFundo.xy + u * retFundo.zw;
  return fundoDoQuadro == 1 ? textureLod(fundo, b, lod).rgb : textureLod(fundo, vec2(b.x, 1.0 - b.y), lod).rgb;
}

void main() {
  vec3 c0 = cam(uv, 1.0);
  float soma = 0.0, pesos = 0.0;
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      vec2 u = uv + vec2(float(i), float(j)) * texelMascara;
      float m = texture(mascara, u).r;
      vec3 dc = cam(u, 1.0) - c0;
      float w = exp(-dot(dc, dc) * sensibilidadeDeCor) * exp(-float(i * i + j * j) / 4.0);
      soma += m * w;
      pesos += w;
    }
  }
  float m = soma / max(pesos, 1e-5);
  float a = smoothstep(limiarBaixo, limiarAlto, m);

  vec3 fg = cam(uv, 0.0);
  vec3 mediaFundo = fundoEm(vec2(0.5), 12.0);
  vec3 mediaCam = cam(vec2(0.5), 12.0);
  vec3 razao = clamp((mediaFundo + 0.03) / (mediaCam + 0.03), vec3(0.8), vec3(1.25));
  fg *= mix(vec3(1.0), razao, harmonia);

  float mLarga = textureLod(mascara, uv, 3.0).r;
  float borda = a * (1.0 - smoothstep(0.35, 0.95, mLarga));
  vec3 luz = fundoEm(uv, 4.0);
  fg = mix(fg, fg * 0.55 + luz * 0.65, clamp(borda * luzDoAmbiente * 2.0, 0.0, 1.0));

  vec3 bg = fundoEm(uv, 0.0);
  cor = vec4(mix(bg, fg, a), 1.0);
}`
