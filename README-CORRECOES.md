> **DOCUMENTAÇÃO HISTÓRICA:** esta descrição reflete a versão anterior. Consulte `README.md` para a versão atual, com pedidos no MySQL e OAuth.

# Tau Sports — MySQL, login e administração

Esta versão usa as tabelas originais `USUARIO`, `PRODUTO`, `ESTOQUE`, `PEDIDO` e `ITEM_PEDIDO` e cria duas tabelas auxiliares: `SESSOES` (login) e `PRODUTO_DETALHE` (informações extras exibidas pela vitrine).

## Configuração

1. Instale Node.js 18+ e inicialize o MySQL. No Workbench execute `CREATE DATABASE IF NOT EXISTS tau_sports;` caso ainda não exista; opcionalmente use `database/instalacao-mysql.sql` para criar as tabelas.
2. Copie `.env.example` para `.env`, preencha `DB_USER`, `DB_PASSWORD` e confira `DB_NAME=tau_sports`. Gere um `SESSION_SECRET` novo conforme o comentário no arquivo.
3. No terminal na pasta do projeto, execute `npm install` (ou `npm ci`).
4. Execute `npm run banco:preparar` **antes** de iniciar o servidor. O comando cria somente as tabelas que faltarem, adiciona `ies_admin` à `USUARIO` caso não exista e carrega o catálogo inicial sem apagar os registros existentes. Para bancos com dados reais, faça backup antes de alterações estruturais.
5. Execute `npm start` e acesse `http://localhost:3000/`.

## Criar cliente e administrador

- **Cliente:** acesse `/cadastro.html`, informe nome, e-mail, CPF, telefone e senha. A senha é armazenada como hash `scrypt`; a flag `ies_admin` fica `'N'` e o cliente não pode cadastrar produtos.
- **Admin existente:** cadastre-se pelo formulário como cliente e execute `npm run admin:criar` no terminal. Informe o e-mail cadastrado e confirme com `SIM` para promover o usuário a `'S'`.
- **Novo admin pelo terminal:** execute `npm run admin:criar`, digite um e-mail ainda não cadastrado, nome, CPF, telefone e senha. O script cria o usuário e promove a `'S'`.
- Alternativa controlada pelo responsável do banco: `UPDATE USUARIO SET ies_admin = 'S' WHERE email_usuario = 'SEU_EMAIL';`.
- **Login:** `/login.html` com e-mail e senha reais. Após autenticar, o administrador acessa **Minha Conta > Cadastrar Produto**. O acesso é validado no back-end, inclusive para tentativas diretas por URL ou POST.

## Estrutura do produto

`PRODUTO` preserva os campos originais (nome, descrição, preço, categoria, marca e tamanho principal). Os campos adicionais do site (galeria de imagens, tamanhos, cores, público, tags, desconto PIX e parcelas) ficam na tabela `PRODUTO_DETALHE`. O cadastro salva ambos em uma transação. Produtos antigos em `PRODUTO`, sem detalhes, também aparecem na listagem, com imagens e opções padrão. O projeto NÃO persiste pedidos reais no MySQL (checkout é demonstrativo e usa dados locais).

## Resolução de problemas

- `ER_NO_SUCH_TABLE`: confirme `DB_NAME=tau_sports` e execute `npm run banco:preparar`.
- `ER_ACCESS_DENIED_ERROR`: verifique usuário/senha MySQL no `.env`.
- `ER_BAD_DB_ERROR`: crie a base `tau_sports`.
- Erro de `SESSION_SECRET`: gere uma chave aleatória com 32 bytes ou mais e salve no `.env`.
- Usuários previamente gravados com senha em texto puro não autenticam com esta versão; é necessário cadastrar novamente ou migrar a senha para `scrypt`. Não compare senhas em texto puro no banco.

## Testes

- `npm test`: testes de rotas/autenticação com banco em memória.
- `npm run test:mysql`: testes de integração em uma base MySQL temporária (requer permissão de CREATE/DROP DATABASE); não usa nem apaga a base real `tau_sports`.
