# A casca de cada marca

A plataforma tem duas camadas:

- **O motor** — conexão com a Deriv, robôs, servidor, banco, chat, e-mails.
  É um só para todas as marcas. Conserto feito uma vez vale para todas.
- **A casca** — as telas: layout, textos, ordem das coisas, o que aparece.
  Pode ser diferente em cada marca. É disto que esta pasta trata.

## Como funciona

Todo arquivo de tela mora em `src/` (por exemplo `src/components/AulasPanel.tsx`).

Se existir uma cópia dele **no mesmo caminho** dentro da pasta de uma marca —
`src/casca/omni/components/AulasPanel.tsx` — o site **daquela marca** usa a
cópia. O site das outras marcas nem fica sabendo que a cópia existe.

Ou seja: "muda a tela de aulas da OMNI" é

1. copiar `src/components/AulasPanel.tsx` para `src/casca/omni/components/AulasPanel.tsx`
2. alterar **só a cópia**

A Teeds continua com a original, byte a byte.

Isso vale para telas (`.tsx`) e para estilos (`.css`). Vale inclusive para o
`src/styles/app.css` inteiro, se um dia a OMNI quiser outra folha de estilo.

## "É a tela padrão, mais um detalhe"

Às vezes a cópia quer ser a tela original com um acréscimo, não uma reescrita.
Dentro da cópia, importe o original por `@padrao/`:

```tsx
import Padrao from '@padrao/components/AulasPanel'
```

`@padrao/` sempre aponta para o arquivo compartilhado, ignorando a própria cópia.

## O que NÃO copiar

Nada de `src/core/` (o motor), nada do `servidor/`, nada do banco. Se a tela
precisa de uma informação nova do motor, o motor ganha essa informação para
todas as marcas — e cada casca decide se mostra.

Copiar motor para dentro de uma casca é criar dois motores. Em seis meses são
dois motores com defeitos diferentes, e dinheiro de cliente passa pelos dois.

## A trava

```bash
npm run separacao
```

Monta os dois sites e confere: se a única coisa que mudou foi a casca da OMNI,
o site da Teeds tem que sair **idêntico** ao anterior — e vice-versa. Se não
sair, o comando falha e diz o que mudou. A publicação da OMNI roda essa trava
antes de publicar.

Não é promessa de cuidado. É verificação.
