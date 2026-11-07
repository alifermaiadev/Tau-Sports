# Taú Sports — Guia do código (versão simplificada)

Este arquivo acompanha as mudanças feitas para tornar o projeto mais fácil de estudar. **O funcionamento dos produtos, da loja, da sessão, do banco e dos perfis foi preservado.** Não é necessário criar tabelas novas para a validação de senhas.

## 1. Onde começa a aplicação

1. `server.js`: inicia a aplicação e verifica se o MySQL está acessível.
2. `src/app.js`: define endereços GET (abrir páginas) e POST (salvar dados).
3. `src/modelos/`: comandos SQL responsáveis por consultar e gravar usuários, produtos e categorias.
4. `src/validacao.js`: valida nome, CPF, telefone, e-mail, senha, produto e categoria.
5. `src/seguranca/senhas.js`: gera hash com `scrypt` e verifica a senha no login.
6. `src/seguranca/sessao.js`: autenticação por cookie e proteção CSRF.
7. `views/pages/*.ejs`: código HTML das telas com conteúdo dinâmico.

## 2. JavaScripts de cada página

| Arquivo | Função |
|---|---|
| `public/js/core.js` | Funções compartilhadas: produtos, preços, armazenamento local, carrinho, cabeçalho |
| `public/js/home.js` | Lista produtos e aplica os filtros de pesquisa |
| `public/js/produto.js` | Detalhes do produto, cores, tamanhos e botões de compra |
| `public/js/carrossel.js` | Botões dos carrosséis e rolagem dos cards |
| `public/js/checkout.js` | Resumo da compra, frete, cupom e pagamento de demonstração |
| `public/js/conta.js` | Área da conta: pedidos, trocas, perfil, endereços, cartões |
| `public/js/cadastrarproduto.js` | Mostra erros de preenchimento no cadastro de produtos |
| `public/js/regras-senha.js` | **Regra única de senha usada pelo Node.js e pelo navegador** |
| `public/js/validacao-senha-formulario.js` | Força da senha, checklist dos requisitos e confirmação nas telas |

## 3. Como acontece o cadastro de um cliente

1. A pessoa abre `/cadastro.html` e preenche o formulário.
2. Os dois scripts de senha mostram a força e os requisitos enquanto digita.
3. O navegador envia o formulário para `POST /cadastro`.
4. O backend usa `validarDadosUsuario()` para validar **novamente** os dados.
5. O sistema gera o hash em `gerarHash()` e salva o usuário comum no MySQL.
6. A aplicação cria uma sessão e direciona para a área da conta.

Para cadastrar um administrador, o caminho é parecido: a rota `POST /administradores` exige uma sessão ADMIN e chama `usuarios.cadastrarAdmin()`, que salva `ies_admin = 'S'`. O comando `npm run admin:criar` continua funcionando e usa a mesma regra de senha.

**Importante:** uma senha antiga, já registrada no banco, continua servindo para login. A nova exigência se aplica somente a novas senhas de cadastro. Nenhuma senha é salva em texto puro.

## 4. Como entender as sintaxes JavaScript

- `const`: cria uma variável que não será reatribuída. É parecido com uma variável local que não pode apontar para outro valor.
- `let`: cria uma variável que pode receber outro valor.
- `function nome() { ... }`: declara uma função.
- `(valor) => valor * 2`: função curta (*arrow function*), equivalente a `function (valor) { return valor * 2; }`.
- `array.find(...)`: encontra o primeiro item da lista que atende à condição.
- `array.filter(...)`: cria uma lista só com os itens que atendem à condição.
- `array.map(...)`: transforma os itens e monta uma nova lista.
- `array.reduce(...)`: acumula valores, por exemplo, uma soma de preços.
- `{ ...cadastro.dados, senhaHash }`: pega as propriedades de `cadastro.dados` e acrescenta `senhaHash`. Isso se chama *spread*.
- `async/await`: espera a conclusão de uma operação, como uma consulta ao banco.
- `(function () { ... })();`: executa um bloco sem criar variáveis globais na página.
- `T` ou `window.Tau`: objeto com funções comuns às páginas; o código usa `T` para não repetir `window.Tau`.
- `$()` e `$$()`: atalhos para procurar elementos HTML, respectivamente um elemento e uma lista.
- `e.preventDefault()`: cancela a ação padrão de um clique ou envio de formulário, quando necessário.

## 5. Como testar

```bash
npm install
npm test
npm start
```

No navegador, teste `/cadastro.html` e, depois de entrar como ADMIN, `/cadastraradmin.html`. Uma senha como `abc123` deve mostrar **Fraca** e ser rejeitada. `Senha123!` é **Média**; `MinhaSenhaSegura2026!` é **Forte**.

O teste automatizado de segurança pode rodar separadamente sem MySQL:

```bash
node --test tests/politica-senha.test.js
```

Os testes HTTP exigem que as dependências do projeto estejam instaladas.
