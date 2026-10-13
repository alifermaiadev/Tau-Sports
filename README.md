# Taú Sports — Express, EJS e MySQL

Projeto de e-commerce da faculdade, com autenticação real e cadastro de produtos restrito a administradores. Todo o código da aplicação usa JavaScript, EJS, HTML e CSS. O arquivo SQL define as tabelas do MySQL.

## O que foi implementado

- Login por e-mail e senha consultando a tabela `usuarios`.
- Senhas protegidas com hash scrypt e salt individual; nenhuma senha é gravada em texto aberto.
- Perfil `ADMIN` ou `CLIENTE`, obtido do banco em cada requisição autenticada.
- Sessão de oito horas persistida no MySQL; o navegador recebe somente um cookie HttpOnly com token aleatório.
- A opção **Cadastrar Produto** aparece no menu da conta, imediatamente acima de **Sair**, somente para `ADMIN`.
- Proteção da página e do POST de produtos no servidor, inclusive contra acesso direto por clientes.
- Formulário EJS com validação no servidor, mensagens de erro, preservação dos campos e confirmação após gravar.
- Produtos gravados em `produtos`, identificados pelo usuário que os cadastrou, e exibidos na loja, nas buscas e na página de detalhes.
- Seção **Novidades** para exibir os produtos novos mesmo quando não forem marcados como ofertas.
- Cadastro público cria apenas `CLIENTE`. A primeira conta `ADMIN` é criada pelo terminal.
- Logout invalida a sessão no banco. Formulários usam proteção CSRF e login tem limite de tentativas.

## Requisitos

- Node.js 18 ou superior; recomenda-se usar uma versão LTS suportada.
- MySQL 8 ou superior em execução.
- Credenciais locais para criar tabelas e consultar/gravar o banco.

## Configurar e executar — passo a passo

1. Extraia o ZIP e abra o terminal dentro da pasta `TauSportsUCE`.
2. Instale as dependências:

   ```bash
   npm install
   ```

3. Crie o banco pelo MySQL Workbench ou outro cliente SQL:

   ```sql
   CREATE DATABASE IF NOT EXISTS tau_sports
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

4. Copie `.env.example` para `.env`. No PowerShell do Windows:

   ```powershell
   Copy-Item .env.example .env
   ```

   Preencha `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME` conforme seu MySQL. As variáveis de ambiente do sistema têm prioridade sobre o arquivo `.env`.

5. Gere a chave da aplicação:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Copie o resultado para `SESSION_SECRET` no `.env`. A chave é obrigatória e deve ter pelo menos 32 caracteres. Não publique o `.env`.

6. Prepare as tabelas e importe os seis produtos que já estavam no projeto:

   ```bash
   npm run banco:preparar
   ```

   Esse comando não apaga registros existentes. O schema está em `database/schema.sql` e usa as tabelas `usuarios`, `sessoes` e `produtos`. O banco precisa existir antes de executar o comando.

7. Crie a conta de administrador:

   ```bash
   npm run admin:criar
   ```

   Informe nome, e-mail, senha e confirmação quando o terminal solicitar. O comando não altera usuários existentes e não possui senha padrão. Para demonstrar o perfil cliente, use **Criar conta Tau Sports** na página de login.

8. Inicie:

   ```bash
   npm start
   ```

   Acesse **http://localhost:3000**. Para desenvolvimento com recarga do servidor, use `npm run dev`. Abra o projeto pelo Express; Live Server não executa o backend nem renderiza EJS.

## Como conferir a regra de negócio

1. Faça login com a conta criada por `npm run admin:criar`.
2. A página **Seus Dados** mostrará **Cadastrar Produto** acima de **Sair**.
3. Abra a opção, preencha os dados e envie o formulário.
4. Confira a mensagem de sucesso e clique em **Ver produto na loja**.
5. O produto aparece em **Novidades** e nas buscas. Marcar **Ofertas do dia**, **Esportes** ou **Streetwear** também o inclui nessas seleções.
6. Clique em **Sair** e crie/acesse uma conta cliente. A opção de cadastro não aparece. Acessar `/cadastrarproduto.html` diretamente retorna HTTP 403.

Para confirmar a gravação pelo banco:

```sql
SELECT id, nome, email, perfil FROM usuarios;
SELECT id, nome, preco, criado_por, criado_em FROM produtos ORDER BY criado_em DESC;
```

## Campos do produto

São obrigatórios: nome, marca, categoria, público, preço de venda, imagem, tamanho, cor e descrição. O formulário também aceita preço anterior, desconto PIX, parcelas, detalhes técnicos e seleções de exibição.

- Preço: maior que zero, com até duas casas decimais.
- Preço anterior: opcional, maior que o preço de venda.
- Desconto PIX: de 0 a 99%; parcelas: de 1 a 10.
- Tamanhos e cores: separados por vírgula.
- Imagens: uma URL HTTP/HTTPS ou caminho de arquivo existente em `public/imagensUCE` por linha, até 10 imagens. Exemplo: `/imagensUCE/camisaAlemanha.png`. A primeira imagem é usada como principal e nas miniaturas das cores.
- Detalhes técnicos: um por linha, até 20.
- Não existe upload de imagens neste escopo. Para uma imagem local nova, adicione o arquivo a `public/imagensUCE` e informe seu caminho no formulário.

## Estrutura

```text
server.js                   inicialização e verificação do banco
src/
  app.js                    rotas HTTP, login e autorização
  config/                   configuração .env e pool MySQL
  modelos/                  consultas parametrizadas de usuários e produtos
  seguranca/                hash de senhas, sessões e CSRF
  dados/catalogo-inicial.json catálogo original para a carga inicial
  validacao.js              validação do cadastro de produtos
scripts/
  preparar-banco.js          criação de tabelas e carga inicial
  criar-admin.js             criação local de administrador
  testar-mysql.js            testes com banco MySQL isolado
views/
  pages/                    telas EJS, incluindo cadastro e cadastro de produtos
  partials/                 cabeçalhos, menu da conta e scripts compartilhados
public/                     CSS, JavaScript do navegador e imagens existentes
database/schema.sql         estrutura do banco
tests/                      testes de autenticação, autorização e produtos
```

## Testes

```bash
npm test
```

O comando padrão testa os fluxos HTTP, os templates EJS, autenticação, perfil ADMIN, gravação pelo modelo, validação e proteções usando um substituto de banco em memória. Ele não comprova a conexão com um servidor MySQL.

Para executar a mesma suíte usando MySQL real:

```bash
npm run test:mysql
```

Esse comando usa as credenciais do `.env`, cria um banco temporário `tau_sports_teste_<timestamp>`, aplica o schema e remove apenas esse banco de testes ao terminar. O usuário configurado precisa de permissões `CREATE DATABASE` e `DROP DATABASE`. O banco da loja não é alterado.

### Validação realizada na entrega

Foram executados 24 testes com o substituto de banco e os mesmos 24 testes com MariaDB 10.11.14, usando o driver MySQL2 e Node.js 24.19.0. Todos passaram. Também foi confirmada a carga inicial sem duplicação após duas execuções. O ambiente de validação utilizou MariaDB; a execução em MySQL 8 pode ser conferida com `npm run test:mysql` no seu ambiente. A criação interativa de ADMIN e a inicialização pelo `server.js` também foram verificadas com banco real.

Os templates foram validados por requisições HTTP. A inspeção visual automatizada não pôde ser concluída porque o ambiente bloqueou a inicialização do navegador.

## Escopo mantido do projeto original

Login, usuários, sessões e produtos têm persistência no MySQL. Pedidos, carrinho, endereços, cartões e dados pessoais/preferências continuam com o comportamento de demonstração do front original. Dados de conta no navegador foram separados por ID do usuário para não misturar contas; o carrinho mantém a navegação de visitante.

Alteração do e-mail de acesso, troca/recuperação de senha, login Google/Facebook, pagamentos reais e controle de estoque não foram implementados. O botão de alterar e-mail informa que a função ainda não está disponível, para evitar uma confirmação falsa. Sessões antigas da demonstração em localStorage não autenticam mais usuários.

Para publicar em HTTPS, use `NODE_ENV=production`: os cookies passam a exigir conexão segura. A limitação de tentativas é local ao processo do servidor.

## Referências técnicas

- [Node.js — crypto (scrypt, randomBytes e timingSafeEqual)](https://nodejs.org/api/crypto.html)
- [MySQL2 — prepared statements](https://sidorares.github.io/node-mysql2/docs/documentation/prepared-statements)
