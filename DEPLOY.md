# Vitral — Colocar no ar (Google Sheets + Drive + Apps Script)

Passo a passo para publicar o sistema online, com planilha como banco de dados,
pasta do Drive para as imagens, e login com dois níveis de acesso.

Você vai precisar de uma conta Google (Gmail normal serve). Tudo é gratuito.

---

## 1. Criar a planilha

1. Acesse [sheets.google.com](https://sheets.google.com) e crie uma planilha em branco.
2. Dê o nome **"Vitral — Banco de Dados"** (ou o que preferir).
3. Guarde essa aba aberta — o próximo passo é feito de dentro dela.

## 2. Criar o projeto Apps Script vinculado

1. Na planilha, vá em **Extensões → Apps Script**. Abre um editor de código numa aba nova.
2. Apague todo o conteúdo do arquivo `Código.gs` que abrir por padrão.
3. Abra o arquivo [`apps_script/Codigo.gs`](apps_script/Codigo.gs) deste projeto, copie tudo e cole no editor do Apps Script.
4. Clique no ícone de disquete (Salvar projeto). Dê um nome ao projeto, ex. "Vitral API".

## 3. Criar a pasta de imagens no Drive

1. Acesse [drive.google.com](https://drive.google.com) e crie uma pasta nova, ex. **"Vitral — Fotos"**.
2. Abra a pasta e copie o ID dela na URL — é o trecho depois de `/folders/`:
   `https://drive.google.com/drive/folders/`**`1AbCdEfGhIjKlMnOpQrStUvWxYz`**

## 4. Configurar as Propriedades do Script

1. De volta no editor do Apps Script, clique no ícone de engrenagem **⚙️ Configurações do projeto** na barra lateral esquerda.
2. Em **Propriedades do script**, clique em **Adicionar propriedade do script** e crie duas:
   - `TOKEN_SECRET` → uma senha longa e aleatória só sua (ex. gere uma em [1password.com/password-generator](https://1password.com/password-generator) ou digite 40 caracteres aleatórios). Isso assina o login — guarde em local seguro, mas não precisa decorar.
   - `PASTA_IMAGENS_ID` → cole o ID da pasta do Drive do passo 3.

## 5. Rodar a instalação (cria as abas da planilha e o primeiro usuário)

1. Volte para a aba **Editor** (ícone `<>`) no Apps Script.
2. No topo, no seletor de função (ao lado do botão ▷ Executar), escolha **`configurarPlanilha`**.
3. Clique em **Executar**. Na primeira vez o Google vai pedir autorização — clique em
   **Revisar permissões**, escolha sua conta, clique em **Avançado** → **Acessar Vitral API (não seguro)**
   (esse aviso aparece porque é um script seu, ainda não publicado — é normal) e **Permitir**.
4. Volte na planilha do Google Sheets: devem aparecer as abas **Usuarios, Config, Ministerios,
   Cultos, Membros, Escalas, Slots, Pastoreio, Midia**, já com cabeçalho e dados padrão.
5. Confira a aba **Usuarios** — deve ter uma linha com `usuario: gestor`. A senha inicial é
   **`trocar123`** — troque assim que entrar no sistema pela primeira vez (tela Dados → Minha senha).

## 6. Publicar como Web App

1. No editor do Apps Script, clique em **Implantar → Nova implantação**.
2. Clique no ícone de engrenagem ao lado de "Selecionar tipo" e escolha **App da Web**.
3. Configure:
   - **Executar como:** Eu (seu e-mail)
   - **Quem pode acessar:** **Qualquer pessoa**
4. Clique em **Implantar**. Autorize de novo se pedir.
5. Copie a **URL do app da Web** que aparece — algo como
   `https://script.google.com/macros/s/AKfycb.../exec`. É essa URL que o sistema usa para conversar
   com a planilha.

> Sempre que você editar o `Codigo.gs`, precisa criar uma **nova implantação** (ou editar a
> implantação existente e trocar a versão) para as mudanças valerem — só salvar não é suficiente.

## 7. Ligar o frontend à API

1. Abra [`index.html`](index.html) deste projeto num editor de texto.
2. Procure a linha:
   ```js
   const API_URL = 'COLE_AQUI_A_URL_DO_APPS_SCRIPT';
   ```
3. Troque pelo link copiado no passo 6, entre aspas, por exemplo:
   ```js
   const API_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
   ```
4. Salve o arquivo.

## 8. Publicar o index.html para acesso de qualquer lugar

Escolha uma opção (ambas gratuitas):

**GitHub Pages** (recomendado, já está no roadmap do projeto):
```bash
git init
git add index.html apps_script CLAUDE.md DEPLOY.md
git commit -m "Vitral v2: login, papéis e banco de dados no Google Sheets"
```
Depois crie um repositório no GitHub, suba o código (`git push`) e ative **Settings → Pages**
apontando para a branch principal. O endereço final fica algo como
`https://seu-usuario.github.io/vitral/`.

**Netlify Drop** (mais rápido, sem git):
Acesse [app.netlify.com/drop](https://app.netlify.com/drop) e arraste a pasta do projeto
(com o `index.html` já com a URL da API preenchida). Você ganha um link público na hora.

## 9. Testar

1. Abra o link publicado no passo 8 em qualquer navegador (inclusive celular).
2. Entre com `gestor` / `trocar123`.
3. Vá em **Dados → Minha senha** e troque a senha imediatamente.
4. Vá em **Usuários → + Novo usuário** e crie os logins da equipe (papel **Cadastro** para quem
   só vai registrar e enviar arquivos, **Gestor** para quem administra tudo).

---

## Limites que valem saber

- **Upload de imagem:** até 8MB por arquivo (limite definido no próprio sistema, com folga
  para o limite real do Apps Script). Vídeo continua só por link (YouTube/Drive) — arquivo de
  vídeo não passa pelo Apps Script.
- **Tempo de execução:** cada ação do Apps Script tem até 6 minutos para responder (conta
  Gmail pessoal) — mais que suficiente para qualquer operação deste sistema.
- **Sem servidor pago:** tudo roda dentro da cota gratuita do Google para uso normal de uma
  igreja. Se um dia isso crescer muito (milhares de acessos simultâneos), aí sim vale reavaliar.
- **A planilha é o banco de dados de verdade.** Não edite as linhas nela manualmente enquanto
  o sistema estiver em uso — abrir e editar é seguro, mas mexer na estrutura das colunas quebra
  o sistema. Se precisar mexer, faça pelo próprio Vitral.
