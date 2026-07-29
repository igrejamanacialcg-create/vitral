# Vitral — Sistema de Gestão Ministerial

Sistema de gestão para igreja local (Manancial): cadastro de membros, escala mensal
automática por ministério, agenda de pastoreio e acervo de mídia. Acessível de qualquer
lugar, com login por usuário e senha e dois níveis de acesso.

## ⏳ PENDÊNCIA DESTA SESSÃO — leia antes de continuar

O frontend (`index.html`) e o `apps_script/Codigo.gs` locais já têm as mudanças abaixo
implementadas, mas **o usuário ainda não aplicou no ambiente real** (planilha + Apps Script
publicado). Antes de assumir que algo funciona, confirme que ele já fez isso:

1. Adicionar a coluna **`conjuge`** na aba **Membros** da planilha (na próxima coluna livre
   depois de "obs" — o campo foi colocado no fim de propósito para não deslocar colunas
   existentes).
2. Colar o `apps_script/Codigo.gs` atualizado no editor do Apps Script (Ctrl+A → colar → 💾).
3. Reimplantar: **Implantar → Gerenciar implantações → editar (lápis) → Nova versão →
   Implantar**.

Depois disso, falta **testar de ponta a ponta**: cadastrar um membro com cônjuge, abrir
"Gerar escala" (modal novo, ver seção Roadmap), gerar, e imprimir (relatório novo com logo
Manancial + tons azul/verde/preto + assinatura "Bispa Claudia").

Também pendente do pedido do usuário, ainda não iniciado:
- Mudar layout geral do sistema (o pedido foi feito, mas o que já existe — mosaico de
  ministérios clicável, modal com abas — foi validado e elogiado; não redesenhar do zero
  sem perguntar o que exatamente trocar)
- Inserir fotos da igreja na interface
- Bloco de gestão financeira (dízimos e ofertas) — ainda não começado
- Bloco do retiro **Toca dos Leões** — usuário disse que vai detalhar como funciona antes de
  implementar, não adivinhar a estrutura
- PWA (app de celular) — decidido o caminho (manifest.json + service worker), não implementado

## Estado atual

**Versão 2 — online, com backend.** O frontend (`index.html`) continua um arquivo único
(HTML+CSS+JS, sem build, sem framework), mas agora fala com um backend em **Google Apps
Script** (`apps_script/Codigo.gs`) que grava numa **planilha do Google Sheets** e guarda
imagens numa **pasta do Google Drive**. Veja [DEPLOY.md](DEPLOY.md) para o passo a passo de
publicação.

A v1 (tudo local, `localStorage`, sem login) foi descontinuada — não existe mais modo
"só abrir o arquivo e usar offline". Se um dia isso for pedido de volta, é reintrodução de
recurso, não bug.

Não quebre a separação frontend/backend sem combinar antes. Se uma tarefa exigir migrar o
frontend para framework (Next.js, React) ou trocar o backend (Supabase, Firebase), **pergunte
primeiro** — isso já está mapeado como reescrita futura no roadmap, não é para começar por
conta própria.

## Como rodar

**Frontend (localmente, para desenvolver a interface):**
```bash
python3 -m http.server 8000
# depois: http://localhost:8000 — mas sem um API_URL válido, só a tela de login aparece
```

**Backend:** vive dentro do editor do Apps Script (script.google.com), vinculado à planilha.
Não tem "rodar localmente" — edite `apps_script/Codigo.gs`, cole no editor, reimplante.
Veja [DEPLOY.md](DEPLOY.md).

## Papéis e permissões

Dois níveis, aplicados **no servidor** (`PERMISSOES` em `Codigo.gs`) — nunca só escondidos na
tela, porque esconder botão no navegador não impede ninguém de chamar a API na mão.

| Ação | Cadastro | Gestor |
|---|---|---|
| Cadastrar/editar membro, pastoreio, mídia | ✅ | ✅ |
| Enviar imagem (foto de membro, mídia) | ✅ | ✅ |
| Exportar relatório (CSV de membros) | ✅ | ✅ |
| Ver escala, ministérios, mídia | ✅ | ✅ |
| Apagar qualquer coisa (membro, mídia, pastoreio, ministério) | ❌ | ✅ |
| Gerar escala do mês / editar slot da escala | ❌ | ✅ |
| Ajustar ministérios (criar/editar/remover) | ❌ | ✅ |
| Configurar dias de culto | ❌ | ✅ |
| Identidade da igreja (nome, logo, capa) | ❌ | ✅ |
| Criar/apagar usuários | ❌ | ✅ |

Vídeo entra só por link (YouTube/Drive) — nunca upload de arquivo binário de vídeo, por causa
do limite de tamanho/tempo do Apps Script. Imagem tem upload real, até 8MB por arquivo.

No frontend, o gate visual usa a classe CSS `.somente-gestor` + `body[data-papel]`
(`aplicarPapel()` em `index.html`). No backend, cada ação em `doPost` é checada contra o mapa
`PERMISSOES` antes de executar — essa é a barreira que vale de verdade.

## Convenções obrigatórias

- **Toda a interface é em português do Brasil.** Rótulos, mensagens de erro, botões, avisos.
- **Nomes de funções e variáveis também em português**, no frontend e no backend
  (`gerarEscala`, `membros`, `folgaDo`, `apagarLinhaPorId`). Mantenha a consistência.
- **JavaScript puro dos dois lados.** Sem React, sem jQuery, sem bundler no frontend; sem
  bibliotecas externas no Apps Script (só os serviços nativos do Google: `SpreadsheetApp`,
  `DriveApp`, `Utilities`, `PropertiesService`).
- **Dado de negócio nunca fica só no navegador.** `window.storage`/`localStorage` guardam
  apenas a sessão (token de login) — tudo o mais (membros, escalas, pastoreio, mídia) vem e
  volta pela API a cada ação.
- Escapar toda entrada do usuário com `esc()` antes de inserir em `innerHTML`.
- Textos de interface no imperativo e diretos: "Salvar membro", não "Submeter".
- Estados vazios são convite à ação, não desculpa: "Agenda livre — marque a primeira visita
  do mês."

## Arquitetura

```
index.html (estático, hospedado em GitHub Pages/Netlify)
   │  fetch POST { acao, token, dados }  — Content-Type text/plain (evita preflight CORS)
   ▼
apps_script/Codigo.gs (Web App do Apps Script)
   │  verifica token (HMAC) → verifica papel (PERMISSOES) → executa
   ▼
Planilha Google Sheets (banco de dados)      Pasta Google Drive (imagens)
```

**Sessão:** login retorna um token assinado (HMAC-SHA256, `TOKEN_SECRET` nas Propriedades do
Script), válido por 30 dias, guardado no `localStorage` do dispositivo via `window.storage`.
Nunca guarda senha, só o token.

**Toda mutação recarrega o estado inteiro.** Cada ação que grava (`salvarMembro`,
`gerarEscala`, etc.) devolve o objeto `S` completo já atualizado — o frontend substitui `S`
pela resposta em vez de fazer merge manual. Simples e correto para o volume de dados de uma
igreja (dezenas a centenas de registros); não otimizar prematuramente.

## Ponte de armazenamento

No topo do `<script>` existe um shim: se `window.storage` não existir (arquivo rodando local),
ele é criado por cima do `localStorage` com a mesma assinatura assíncrona. Hoje ele só guarda
a sessão (`vitral-sessao-v1`), não mais o estado do sistema inteiro.

```js
await window.storage.get(chave)      // -> {key, value} | null
await window.storage.set(chave, str) // valor sempre string (JSON.stringify)
```

## Modelo de dados

O objeto `S` no frontend tem o mesmo formato de sempre — só que agora é montado pelo backend
a partir da planilha (`carregarTudo()` em `Codigo.gs`) a cada login/mutação, em vez de vir do
`localStorage`.

```js
S = {
  config: { nome, lema, logo, capa },              // logo e capa são URLs
  ministerios: [ { id, nome, qtd, cor } ],
  cultos: [ {
    id, nome, tipo,             // tipo: 'Fixo' | 'Esporádico'
    diaSemanai,                 // só Fixo — 0=domingo..6=sábado
    hora,
    data                        // só Esporádico — 'YYYY-MM-DD' da próxima ocorrência, ou null
  } ],
  membros: [ {
    id, nome, telefone, foto, nascimento,
    conjuge,                    // opcional — nome completo do(a) cônjuge, p/ escalar como casal
    ministerios: [ministerioId],
    disponibilidade: [cultoId], // ids de S.cultos, não mais números de dia da semana
    ativo, obs
  } ],
  escalas: {
    "2026-08": {
      mes, geradaEm, folga,
      apertados: [string],
      slots: [ { id, data, hora, ministerioId, membroId|null, forcado } ]
    }
  },
  pastoreio: [ { id, pessoa, tipo, data, hora, responsavel, status, assunto, notas } ],
  midia: [ { id, titulo, tipo, tema, data, url } ]
}
```

**Cultos não são mais "dias da semana fixos".** Cada culto é um registro nomeado (Domingo
Matutino, Domingo Noturno, Sexta Profética, Culto de Casais, Encontro de Homens, Restauração
são os padrão de `configurarPlanilha()`). Fixos recorrem toda semana no `diaSemanai`;
Esporádicos (exceto Sexta Profética, que é sempre automática = última sexta do mês) guardam a
próxima `data` marcada manualmente, atualizada toda vez que alguém gera uma escala incluindo
aquele evento (ver `iniciarGeracaoEscala()` em `index.html`).

**Cônjuge e escala como casal:** se `membro.conjuge` está preenchido, `nomeExibicao(membro)`
devolve `"Fulano e Beltrana"` (só primeiro nome de cada) em vez de só `"Fulano"`. Usado no
relatório impresso e deve ser usado em qualquer lugar novo que mostre "quem foi escalado" —
não usar `membro.nome` cru para exibição de escala.

Na planilha, cada chave de `S` (exceto `config`) vira uma aba — `escalas` é dividida em duas
(**Escalas**: cabeçalho do mês; **Slots**: uma linha por posto) porque planilha é tabular.
`config` fica na aba **Config** como pares chave/valor. Veja `CAB` em `Codigo.gs` para o
cabeçalho exato de cada aba — não altere colunas direto na planilha, use o sistema. **Exceção
deliberada:** o campo `conjuge` foi colocado no **fim** de `CAB.Membros` (não junto de
`nascimento`, que seria mais lógico) para não deslocar as colunas existentes numa planilha já
em uso — se adicionar mais campos novos no futuro, considere o mesmo truque.

Datas sempre no formato `YYYY-MM-DD` como string. Nunca usar `new Date(iso)` direto — o
parser trata como UTC e erra o dia no fuso do Brasil. Use o helper `dt(iso)`.

`tipo` de pastoreio: Visita, Aconselhamento, Hospital, Ligação, Célula, Reunião.
`status` de pastoreio: Agendado, Concluído, Remarcar.

## O motor da escala (`gerarEscala`)

Roda **inteiro no navegador** (é JavaScript já testado, sem motivo para duplicar em Apps
Script) — só o resultado final é enviado para persistir via API. A ação `gerarEscala` no
backend é gestor-only, então mesmo que alguém adultere o payload no navegador, o servidor
recusa se a sessão não for de gestor.

**Fluxo de geração (`abrirGerarEscalaModal()` → `iniciarGeracaoEscala()` → `gerarEscala(opcoes)`):**
o botão "Gerar escala" (painel ou aba Escalas) abre um modal onde o usuário escolhe o mês,
marca quais cultos/eventos entram (checkboxes, com campo de data para os Esporádicos que não
são Sexta Profética), marca quais ministérios entram, e define folga/regra de "um por dia".
`iniciarGeracaoEscala()` primeiro persiste qualquer data de evento esporádico alterada (via
`salvarCulto`) e só depois chama `gerarEscala({mes, cultosSelecionados, ministeriosSelecionados,
folga, umPorDia})` — a função **não lê mais nada do DOM diretamente**, recebe tudo por
parâmetro. Ao terminar com sucesso, chama `imprimirRelatorio()` automaticamente.

**Objetivo:** distribuir as pessoas sem repetir na sequência, mantendo a folga equilibrada
entre todos do mesmo ministério, com continuidade entre meses.

**Como funciona:**

1. Monta as datas do mês via `datasDoMes(mes, cultosSelecionados)` — cultos Fixos geram uma
   data por semana no `diaSemanai`; Sexta Profética é sempre a última sexta do mês; os demais
   Esporádicos usam a `data` gravada no próprio registro do culto (ver seção Modelo de dados).
2. Lê o histórico de todos os meses anteriores já gerados (vindo de `S.escalas`, que por sua
   vez veio da planilha) para saber `total` e `ultima` data de cada pessoa.
3. Calcula a **folga efetiva por ministério**. A folga só é exigível se houver gente
   suficiente para revezar:
   `precisa = qtd * (round(folga/7 * cultosPorSemana) + 1)`.
   Se o time é menor que isso, a folga daquele ministério vira 0 e o nome entra na lista
   `apertados`, que vira aviso na tela. O sistema nunca finge que deu certo.
4. Para cada data, preenche **o ministério mais apertado primeiro** — escolhe sempre o que
   tem a menor razão `candidatos livres / vagas restantes`.
5. Para cada vaga, pontua os candidatos e escolhe a **menor nota**:

```
nota  = vezesNoMes * 1000        // quem serviu menos entra primeiro (dominante)
      - min(diasDesdeUltima, 60) * 4   // quem está parado há mais tempo desempata
      + totalHistorico * 0.6           // desempate de longo prazo
      + random() * 0.9                 // quebra empates exatos
      + 100000  se violar a folga mínima do ministério
      + 450     se serviu neste mesmo ministério nos últimos 7 dias
```

A folga é **regra branda**: o peso de 100000 garante que só é violada quando não há mais
ninguém. Quando isso acontece, o slot recebe `forcado: true` e ganha marcador dourado na
interface.

**Invariantes que os testes devem manter:**

- Ninguém é escalado duas vezes na mesma data quando `umPorDia` está ligado.
- Nenhuma pessoa aparece duas vezes no mesmo ministério na mesma data.
- Com equipe suficiente (`pool >= qtd*3` e 2 cultos por semana), a geração deve produzir
  **zero** violações de folga e **zero** vagas em aberto.
- A diferença entre quem mais serve e quem menos serve, dentro do mesmo ministério, não deve
  passar de 1 escala por mês.

## Relatório impresso (PDF via impressão do navegador)

Não existe geração de PDF no servidor — o "PDF" é o navegador imprimindo uma página HTML
com um `@media print` dedicado (mesma técnica de sempre no projeto, só que com um template
próprio em vez de reaproveitar a tela normal).

- `#relatorioImpressao` é uma `<div>` vazia no `<body>`, `display:none` na tela e
  `display:block!important` só dentro de `@media print` (que também esconde `.app`,
  `.tela-login` e `.modal` nesse momento).
- `montarPrintHtml(mes, ministerioIds)` monta o HTML do relatório: logo (`LOGO_MANANCIAL`,
  uma constante base64 no topo do `<script>`), nome/lema da igreja, um bloco por culto/data
  com tabela de ministério × pessoa (usa `nomeExibicao()`, nunca o nome completo), e uma
  assinatura fixa "Bispa Claudia" no rodapé. Tons de azul/verde/preto (`--ri-*` no CSS,
  independentes da paleta joia do resto do sistema — é impressão, não precisa combinar com a
  tela).
- `imprimirRelatorio(mes, ministerioIds)` popula `#relatorioImpressao` e chama
  `window.print()`. `ministerioIds` vazio/omitido = todos os ministérios.
- Chamado em dois lugares: aba de um ministério no modal (`abrirMinisterioModal` → botão
  Imprimir → só aquele ministério) e ao final de `gerarEscala()` bem-sucedida (todos os
  ministérios selecionados na geração).

Se pedirem para mudar cor/logo/assinatura do relatório, mexa só nesse bloco — não toque no
`@media print` genérico mais acima (esse é o fallback para imprimir outras telas, tipo a
lista de membros).

## Mapa dos arquivos

```
index.html              frontend (estático)
apps_script/Codigo.gs   backend (Apps Script — colar no editor vinculado à planilha)
DEPLOY.md               passo a passo de publicação (planilha, Drive, Apps Script, hospedagem)
CLAUDE.md               este arquivo
```

**`index.html`**, na ordem:
1. `<style>` — tokens em `:root`, shell, componentes, vitral, escala, mídia, modal, login,
   papéis (`.somente-gestor`), responsivo, `@media print`
2. `<body>` — tela de login + `.app` (sidebar de navegação + `<section id="v-...">`, uma por
   tela, incluindo `v-usuarios`)
3. `<script>` — API/sessão, estado, helpers de data, navegação, e um bloco por tela

Blocos do script, na ordem: **ESTADO · API · LOGIN/SESSÃO · UPLOAD DE IMAGEM · DATAS ·
HELPERS DE DADOS · NAVEGAÇÃO · PAINEL · MEMBROS · MINISTÉRIOS (inclui `abrirMinisterioModal`) ·
CULTOS · RELATÓRIO DE IMPRESSÃO (`montarPrintHtml`/`imprimirRelatorio`) · MODAL GERAR ESCALA
(`abrirGerarEscalaModal`/`iniciarGeracaoEscala`) · MOTOR DA ESCALA · PASTOREIO · MÍDIA · DADOS ·
USUÁRIOS · INÍCIO**

Navegação: `irPara('painel'|'membros'|'escala'|'ministerios'|'pastoreio'|'midia'|'dados'|'usuarios')`
mostra a `<section id="v-NOME">` e chama o `render` correspondente.

Padrão repetido em cada tela: `renderX()` desenha a lista, `abrirX(id?)` monta o modal,
`salvarX(id)` chama `chamarApi()` e reatribui `S`, `apagarX(id)` idem. Toda mutação é
`async function`. Siga esse padrão ao criar telas novas.

**`apps_script/Codigo.gs`**: `doPost` roteia por `acao` → checa `PERMISSOES` → executa o
handler correspondente → devolve `carregarTudo()` (ou o dado específico da ação, como
`uploadImagem` que devolve só `{url}`). Handlers de planilha usam os helpers genéricos
`aba/linhasComoObjetos/gravarLinha/atualizarLinhaPorId/apagarLinhaPorId` — reaproveite-os para
novas entidades em vez de escrever leitura/escrita de planilha do zero.

## Identidade visual — não improvisar

Direção: **vitral de igreja.** Fundo índigo noturno, chumbo dourado separando painéis,
uma cor-joia por ministério. Toda cor nova sai destes tokens, definidos em `:root`:

```
--noite #0B0E24   --noite-2 #111637   --noite-3 #181F4C
--ouro  #E8B44A   --ouro-claro #F6D48B   --chumbo rgba(232,180,74,.20)
--texto #EDEFFA   --texto-2 #A3ABD6   --texto-3 #6E77A8

joias: --cobalto #3B6FE0  --esmeralda #23A06B  --rosa #D2568F  --laranja #E07A3B
       --ambar #E8B44A    --turquesa #1FA8B5   --ametista #8B5CF6
       --rubi #E04E5C     --indigo #6C7BE8
```

Tipografia: **Fraunces** para títulos, **Instrument Sans** para corpo, **IBM Plex Mono** para
datas, contadores e telefone. Não introduzir família nova.

O mosaico de ministérios do painel (`.vitral`) é o elemento assinatura da interface. Não
substitua por cards genéricos. A tela de login segue a mesma paleta (`.tela-login`).

Piso de qualidade: responsivo até 380px (a sidebar vira barra inferior), foco de teclado
visível, `prefers-reduced-motion` respeitado, e a escala imprime limpa em papel via
`@media print`.

## Roadmap — próximas entregas

Nesta ordem. Itens já feitos ficam marcados ✅ para não repetir trabalho.

### ✅ Cultos nomeados + modal de ministério (feito)
Cultos deixaram de ser "dia da semana genérico" e viraram registros nomeados (Fixo/Esporádico,
ver Modelo de dados). Clicar num ministério no mosaico do painel abre um modal com 4 abas:
Relatório, Cadastrar membro, Editar escala, Histórico (`abrirMinisterioModal()`).

### ✅ Modal "Gerar escala" + relatório impresso com identidade Manancial (feito, pendente de
### aplicar no ambiente — ver seção "PENDÊNCIA DESTA SESSÃO" no topo do arquivo)
Modal de geração com seleção de mês/cultos/ministérios (`abrirGerarEscalaModal()`), e
relatório impresso com logo, tons azul/verde/preto e assinatura "Bispa Claudia"
(`imprimirRelatorio()`). Campo `conjuge` no cadastro de membro para ministérios que escalam
casais (ex. Recepção) — exibido como "Fulano e Beltrana" via `nomeExibicao()`.

### 1. Layout, fotos da igreja e textos personalizados
Pedido pelo usuário, ainda não iniciado. Perguntar especificamente o que trocar no layout
antes de redesenhar — o mosaico de ministérios e os modais já foram validados e não devem ser
descartados sem necessidade.

### 2. Bloco de gestão financeira (dízimos e ofertas)
Ainda não desenhado. Vai precisar de: nova aba na planilha (`Financas` ou similar, seguir o
padrão `CAB`), tela nova no frontend, e decidir com o usuário o nível de detalhe (por pessoa?
anônimo? por culto?) antes de implementar — é dado sensível, não assumir estrutura sozinho.

### 3. Bloco do retiro Toca dos Leões
Retiro anual. Usuário disse explicitamente que vai detalhar o funcionamento antes de
implementar — **não começar a codar sem essa conversa acontecer**.

### 4. PWA (app de celular)
Caminho definido: `manifest.json` + service worker, mantendo o mesmo `index.html` (sem
reescrever para app nativo). Ainda não implementado.

### 5. Estatísticas e relatórios agregados
Aba nova `v-relatorios` (diferente do relatório de impressão da escala, que já existe). O que
a liderança precisa enxergar:
- Participação por membro no período (mês, trimestre, ano), com quem está sobrecarregado e
  quem está sumido
- Cobertura por ministério: quantas vagas ficaram em aberto e quantas folgas foram quebradas
- Frequência de pastoreio: agendados x concluídos x remarcados, por responsável
- Aniversariantes do mês (o campo `nascimento` já existe e ainda não é usado em lugar nenhum)
- Exportação em CSV

Sem biblioteca de gráfico. Barras em CSS puro, como já é feito em `renderEquilibrio()`.
Dados vêm de `S` (já carregado do backend), sem necessidade de nova ação na API — a não ser
que o volume de histórico cresça a ponto de precisar de agregação no servidor.

### 6. GitHub + hospedagem pública
`git init`, primeiro commit, repositório e deploy do `index.html` (GitHub Pages ou Netlify
Drop, ver DEPLOY.md). Mensagens de commit em português. **O backend (Apps Script) não vai pro
GitHub como código executável do sistema** — `apps_script/Codigo.gs` fica versionado como
referência, mas quem roda de verdade é a cópia colada no editor do Apps Script. Hoje o sistema
só roda localmente (`python -m http.server`) — sem isso, só quem está no mesmo computador
acessa.

### Depois (só quando pedido)
Migração para Next.js + Supabase com upload real de vídeo e disparo da escala no WhatsApp via
API. É reescrita, não evolução — não comece por conta própria. O Apps Script atual já resolve
login, papéis e planilha como banco; só migrar se o volume de acesso ou a necessidade de
upload de vídeo justificar sair do Google.

## Limitações conhecidas

- **Upload de imagem** até 8MB por arquivo (limite do próprio sistema, com folga do limite
  real do Apps Script). Vídeo é só link — sem upload de arquivo de vídeo.
- **A planilha é o banco de dados de produção.** Não editar colunas/cabeçalhos nela na mão;
  usar sempre o sistema. Editar valores de células isoladas é seguro, mas arriscado sem
  necessidade.
- **Sem versionamento de dados.** Não existe "desfazer" além do histórico de revisões nativo
  do Google Sheets (Arquivo → Histórico de versões na planilha).
- Fotos e mídia de vídeo por link continuam por URL manual quando não passam pelo upload.
