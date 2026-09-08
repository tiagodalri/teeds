# O banco de dados, guardado em arquivo

O banco é onde mora tudo que não é tela: os clientes, as contas da corretora,
cada operação dos robôs, as comissões. Ele fica hospedado no Supabase.

O problema que esta pasta resolve: **a receita de como o banco foi construído
existia num lugar só.** Cada tabela criada, cada permissão ajustada, cada
correção — tudo isso ficava guardado apenas dentro do painel do Supabase. Se
aquela conta se perdesse (cobrança em atraso, acesso perdido, engano de
alguém), o banco poderia até ser recuperado de um backup, mas a *receita* iria
junto. Refazer à mão são semanas.

Agora a receita mora aqui, no GitHub, junto com o resto do código.

## O que tem em cada lugar

**`migracoes/`** — a receita completa, em ordem de data. Um arquivo por
mudança, com o nome começando pela data e hora em que foi feita. Cada arquivo
explica em português, no topo, *por que* aquilo mudou.

Estes arquivos são **cópia fiel**, tirada direto do banco por um programa —
ninguém os digita à mão. Não edite nada aqui: mudança se faz no banco, e
depois se roda o export de novo.

### Arquivos legados — história, não migrações pendentes

Os quatro `.sql` soltos (`teeds_admin_setup`, `teeds_chat`,
`teeds_relatorio_clientes`, `teeds_robot_telemetry`) são anteriores a setembro
de 2026, de quando as mudanças ainda eram feitas colando SQL à mão no painel.

Eles ficam na raiz desta pasta deliberadamente como registro histórico:

| Arquivo | Papel histórico |
| --- | --- |
| `teeds_admin_setup.sql` | Alicerce original do banco, que nenhuma migração versionada repete. |
| `teeds_chat.sql` | Implantação manual original do chat. |
| `teeds_relatorio_clientes.sql` | Implantação manual original dos relatórios de clientes. |
| `teeds_robot_telemetry.sql` | Implantação manual original da telemetria dos robôs. |

**Não aplique, não renomeie e não mova esses arquivos como se fossem migrações
novas.** Eles podem conter estruturas que o banco atual já substituiu. Toda
mudança nova deve nascer no banco e voltar versionada em `migracoes/` pelo
processo de exportação descrito abaixo.

## Como atualizar depois de mexer no banco

```bash
./scripts/exportar-banco.sh
```

O script pede a cópia ao servidor, traz os arquivos e avisa quantos vieram.
Depois é só fazer commit do que mudou.

A chave do banco não passa pelo seu computador em momento nenhum: quem lê a
chave é o próprio servidor, que roda a cópia lá dentro e devolve só os `.sql`.
