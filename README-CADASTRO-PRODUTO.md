# Correção de feedback no cadastro de produtos

Quando o usuário clica em **Cadastrar Produto** e o navegador parece voltar para o começo da página, provavelmente existe algum campo obrigatório ou número inválido. A validação nativa do navegador bloqueia o envio do formulário **antes** de realizar o POST para o Node.js.

## O que foi alterado

- `views/pages/cadastrarproduto.ejs`: adicionado alerta de validação; carregado `cadastrarproduto.js`.
- `public/js/cadastrarproduto.js`: escuta os eventos nativos `invalid`, `input` e `change`; exibe mensagem junto ao campo inválido e muda o texto do botão durante o envio bem-sucedido.
- `public/css/cadastrarproduto.css`: destaque visual dos erros.

A rota `POST /produtos` em `src/app.js` e as operações MySQL em `src/modelos/produtos.js` continuam as mesmas. O `submit` **não** usa `preventDefault()`.

## Instalação

1. Faça backup do projeto atual.
2. Substitua os 3 arquivos acima, preservando seu `.env`.
3. Reinicie o servidor (`Ctrl+C` e `npm start`).
4. Atualize a página com `Ctrl+F5` e preencha os campos obrigatórios.

## Como descobrir a próxima falha

Abra o DevTools com F12 > Rede (Network) > Fetch/XHR/Todos. Clique em cadastrar e procure uma chamada `POST /produtos`:

- **Nenhuma chamada**: validação HTML do navegador; veja o campo marcado em vermelho.
- **400**: dados rejeitados pelo validador do backend; as mensagens aparecem no topo da página.
- **303**: cadastro concluído e redirecionamento de sucesso.
- **403**: token CSRF, sessão ou permissão do usuário.
- **500**: erro no servidor; verifique o terminal e a instalação das tabelas MySQL.

Este projeto foi testado com banco simulado, **não** com seu MySQL local.
