# Taú Sports — E-commerce Node.js, Express, EJS e MySQL

Esta versão foi **modificada a partir do projeto Taú Sports original**, mantendo as páginas, imagens, menu da conta, catálogo, estilização e autenticação tradicional. Inclui cadastros administrativos, relatórios, tamanhos por tipo, pedidos e endereços persistidos no MySQL e login social via OAuth 2.0.

## 1. Requisitos e instalação (Windows / VS Code)

- Node.js **18 ou superior** (recomendado Node.js 22 LTS); npm; MySQL **8+** com uma base `tau_sports` e um usuário com acesso de criação/alteração de tabelas.
- Extraia o ZIP e abra a pasta `Tau-Sports-main` no VS Code.
- Abra um terminal na raiz do projeto e execute:

```powershell
npm install
Copy-Item .env.example .env
```

Edite o `.env` com `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` e um `SESSION_SECRET` próprio, de pelo menos 32 caracteres. Crie uma chave aleatória com:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Crie a base MySQL, se ainda não existir:

```sql
CREATE DATABASE IF NOT EXISTS tau_sports CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

**Faça backup da base existente antes da migração.** Em seguida, execute:

```powershell
npm run banco:preparar
npm start
```

Abra `http://localhost:3000`. Em desenvolvimento, `npm run dev` reinicia o servidor ao alterar os arquivos.

**Importante:** utilize `npm install` para gerar o `package-lock.json` desta versão. O lockfile original foi omitido porque a nova biblioteca OAuth entrou no `package.json` e o ambiente de entrega não tinha acesso ao registry npm para regenerá-lo. Depois de gerar o novo lockfile, o grupo poderá usar `npm ci` normalmente.

## 2. Migração e preservação de dados

`npm run banco:preparar` usa `database/schema.sql` e `database/migracao-2026.sql`:

- Preserva `USUARIO`, `PRODUTO`, `PRODUTO_DETALHE`, `SESSOES`, `ESTOQUE`, `PEDIDO` e `ITEM_PEDIDO`.
- Mantém as categorias originais da loja (tênis, camiseta, chuteira, etc.), sem confundi-las com **tipo** (`roupa`, `calcado`, `outro`).
- Cria `CATEGORIA`, `MARCA` e `GENERO` como tabelas de cadastro, importando valores já presentes nas tabelas existentes.
- Acrescenta `PRODUTO_DETALHE.tipo_produto` **somente se a coluna ainda não existir** e faz uma inferência inicial para os produtos antigos a partir das categorias conhecidas.
- Reaproveita `PRODUTO_DETALHE.tamanhos` (JSON) para armazenar vários tamanhos, sem apagar os produtos ou modificar a tabela original `PRODUTO`.
- Cria `ENDERECO_USUARIO`, `CONTA_SOCIAL`, `ITEM_PEDIDO_VARIANTE`, `PEDIDO_ENDERECO` e `SOLICITACAO_TROCA`, apenas se estiverem ausentes.
- Não usa `DROP TABLE`, `TRUNCATE` nem apaga cadastros. Os comandos `CREATE TABLE IF NOT EXISTS` não substituem tabelas existentes.
- O catálogo original é importado somente quando cada ID de catálogo está ausente, como já ocorria no projeto-base.

A instalação manual de uma base nova também pode ser feita com `database/instalacao-mysql.sql` e, depois, `database/migracao-2026.sql`, ambos na base correta. **Não execute a migração apontando para outro banco de produção por engano.**

## 3. Login e permissões

O login tradicional usa `USUARIO`, hashes `scrypt`, sessões no MySQL (cookie HttpOnly) e CSRF no formulário. O cadastro de clientes não permite definir privilégios. Para promover um usuário autorizado, execute:

```powershell
npm run admin:criar
```

Administradores enxergam os itens **Cadastrar** e **Relatórios** no menu da conta. Os `POST /produtos`, `/produtos/:id/editar`, `/cadastros/:tipo`, a página `/relatorios.html` e as APIs `/api/relatorios/*` exigem sessão de administrador. Os endpoints `/api/enderecos` e `/api/pedidos` exigem sessão, operam somente com o ID do usuário autenticado e bloqueiam requisições sem token CSRF no método POST.

### Google OAuth

1. Abra o **Google Cloud Console**, configure a tela de consentimento OAuth e crie um cliente **OAuth 2.0 – Aplicativo Web**.
2. Adicione como redirect URI autorizado: `http://localhost:3000/auth/google/callback` (para desenvolvimento).
3. Preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env`.
4. Configure `APP_ORIGIN=http://localhost:3000`. Em produção use o domínio HTTPS real, e cadastre `https://SEU_DOMINIO/auth/google/callback` no Google.
5. Escopos usados: `openid email profile`. O sistema consulta a identidade diretamente do Google e só aceita e-mail marcado como verificado.

### Facebook OAuth

1. Abra o **Meta for Developers**, crie um aplicativo e configure o produto **Facebook Login** com as permissões necessárias (`public_profile` e `email`, quando disponível).
2. Cadastre como redirect URI válido `http://localhost:3000/auth/facebook/callback`. Para produção, use `https://SEU_DOMINIO/auth/facebook/callback` e ajuste as políticas do aplicativo conforme os requisitos da Meta.
3. Preencha `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` e `APP_ORIGIN` no `.env`.
4. Se o Facebook não confirmar o e-mail, o sistema usa um identificador interno exclusivo, não associa automaticamente uma conta por coincidência de endereço de e-mail e permite vincular a identidade em **Seus Dados**, após login tradicional.

Ambos os fluxos usam o módulo OAuth2, `state` aleatório assinado em cookie HttpOnly, expiração de 10 minutos, validação de callback e sessão existente. **Nunca** coloque os segredos no front-end ou em arquivos enviados ao repositório. Credenciais válidas, acesso HTTPS de produção, callbacks autorizados e aprovação de permissões na Meta/Google são necessários para testar o login social ponta a ponta.

## 4. Cadastros e relatórios

Em **Minha Conta → Cadastrar** (ADMIN), selecione Categoria, Marca, Gênero ou Produto. Produto usa registros já cadastrados, com tipo separado das categorias originais e checkboxes de tamanho:

- Roupa: PP, P, M, G, GG, XG;
- Calçado: 35 a 44;
- Outros/acessórios: Único.

Seleções incompatíveis são limpas ao mudar o tipo. Use a listagem da própria página para **editar um produto** e recuperar seus tamanhos previamente salvos. A página de detalhe da loja já usa o array de tamanhos do catálogo.

Em **Minha Conta → Relatórios** (ADMIN), cinco abas exibem dados carregados diretamente do MySQL. As cinco consultas SQL documentadas estão em `database/consultas-relatorios.sql` e são executadas por `src/servicos/relatorios.js` usando uma lista fechada de relatórios.

| Relatório | Endpoint GET (ADMIN) | Dados |
|---|---|---|
| Categoria | `/api/relatorios/categoria` | Categoria, quantidade, preço médio |
| Marca | `/api/relatorios/marca` | Marca, quantidade, preço médio |
| Cliente | `/api/relatorios/cliente` | Código, nome, e-mail, telefone, cadastro |
| Venda | `/api/relatorios/venda` | Pedido, cliente, data, itens, total, status |
| Endereços | `/api/relatorios/enderecos` | Cliente e campos do endereço |

Todas as abas compartilham `views/pages/relatorios.ejs`, `public/css/relatorios.css` e `public/js/relatorios.js`, incluindo navegação, carga, estados vazios, erros, conversão de moedas e criação segura do DOM por `textContent`.

## 5. Endereços, pedidos e checkout

- **Endereços:** `GET/POST /api/enderecos`. Permite salvar, listar e editar endereços do próprio usuário, definir principal e cadastrar outro. CEP, UF, rua, número, bairro e cidade são validados no servidor.
- **Pedidos:** `GET/POST /api/pedidos`. O checkout envia os IDs, variantes e quantidades. O servidor lê **preços e tamanhos do MySQL**, valida cor/tamanho, calcula descontos, cupom e frete e salva `PEDIDO`, `ITEM_PEDIDO`, `ITEM_PEDIDO_VARIANTE` e o retrato do endereço (`PEDIDO_ENDERECO`) numa única transação.
- **Trocas:** `POST /api/pedidos/:id/troca`. O pedido precisa pertencer ao cliente, e não pode estar aguardando pagamento. A solicitação é gravada no banco.
- **Pagamento:** **não existe integração com gateway financeiro no projeto original**. A aplicação registra o pedido com status **Aguardando pagamento**, sem capturar fundos ou marcar uma compra como paga. PIX, boleto e cartão são *escolhas de método solicitadas pelo usuário*, não pagamentos realizados. Para produção é necessário integrar um provedor regulado, fluxos de confirmação e webhooks autenticados. Não armazene número de cartão nem CVV no MySQL.

## 6. Testes e limites de validação

```powershell
npm test
node --test tests/validacao.test.js tests/novas-funcionalidades.test.js
npm run test:mysql
```

O segundo comando roda testes unitários **sem dependências npm** (validação, SQL, endereço, pedido via banco substituto, arquivos EJS/CSS/JS existentes). O `npm test` também inclui o fluxo HTTP original com Express; `npm run test:ejs` verifica a sintaxe básica dos templates sem renderização e `npm run test:mysql` depende de servidor MySQL com permissão de criar/apagar **uma base temporária de testes**, não a base de produção.

**Estado desta entrega:** testes unitários independentes de MySQL passaram. Sintaxe dos arquivos JS verificada. Não foi possível executar renderização EJS real, iniciar o Express, rodar SQL em MySQL, testar OAuth real nem executar testes responsivos em navegador aqui, porque o ambiente não possui MySQL e o registry npm não é acessível para baixar dependências. Essas verificações devem ser efetuadas no Windows após instalar as dependências e configurar as credenciais. Os testes com bancos substitutos **não comprovam operação em produção**.

## 7. Organização de arquivos relevantes

- **Criados:** `README.md`, `database/migracao-2026.sql`, `database/consultas-relatorios.sql`, `src/servicos/{cadastros,relatorios,enderecos,pedidos,oauth}.js`, `views/pages/relatorios.ejs`, `public/{css,js}/relatorios.*`, `tests/novas-funcionalidades.test.js`.
- **Alterados:** `src/app.js`, `src/modelos/produtos.js`, `src/validacao.js`, `server.js`, `scripts/preparar-banco.js`, `database/{schema,instalacao-mysql}.sql`, `package.json`, `.env.example`, `views/pages/{cadastrarproduto,login,seusdados,endereco,pedidos,trocas,finalizarcompra}.ejs`, `views/partials/conta-menu.ejs`, `public/js/{cadastrarproduto,conta,checkout,core}.js`, `public/css/{cadastrarproduto,login,endereco}.css` e testes existentes.
- **Mantidos:** imagens, páginas de vitrine, menus de navegação, header/footer, CSS existentes e demais componentes originais.

Os cinco integrantes podem dividir a continuação em: front-end/visual, produtos/admin, relatórios, persistência/checkout e autenticação/segurança. Para alterações no banco, use sempre uma nova migração aditiva, precedida de backup.
