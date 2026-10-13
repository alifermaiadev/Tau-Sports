# Taú Sports (Express + EJS)

## Como rodar

```bash
npm install
npm start        # http://localhost:3000
```

## Estrutura

```
server.js              rotas e servidor estático
public/                arquivos servidos como estão
  css/  js/  imagensUCE/
views/
  pages/               uma página por arquivo (.ejs)
  partials/
    head.ejs           <head> (título + lista de CSS por página)
    header.ejs         header principal
    header-login.ejs   header da tela de login
    footer.ejs         footer da loja (legalCompleto: false = texto curto)
    footer-checkout.ejs
    conta-menu.ejs     menu lateral da área da conta (param: ativo)
    carrossel.ejs      carrossel de produtos (params: id, rotulo, classe)
    scripts.ejs        <script> por página
```

## URLs

`/` e `/<pagina>.html` (ex.: `/produto.html?id=adidas-campus-00s`). `/<pagina>` redireciona para `.html`.

## Carrossel

Em qualquer página: `<%- include('../partials/carrossel', { id: 'meuCarrossel', rotulo: 'Texto acessível' }) %>`
e carregue `carrossel.js`. Os cards são inseridos por JS dentro de `#meuCarrossel .cardsCarrossel`.

## Frete grátis nos cards

O card mostra "Frete grátis" automaticamente quando `preco >= T.CONFIG.FRETE_GRATIS_A_PARTIR_DE` (core.js).
