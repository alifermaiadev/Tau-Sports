'use strict';

const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

/* Arquivos estáticos: /css, /js e /imagensUCE */
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, arquivo) {
    if (arquivo.endsWith('.avif')) res.type('image/avif');
  }
}));

/* Páginas disponíveis (views/pages/<nome>.ejs) */
const PAGINAS = [
  'index', 'produto', 'login', 'finalizarcompra',
  'pedidos', 'trocas', 'seusdados', 'endereco', 'cartoessalvos'
];

/* "/" é a home */
app.get('/', (req, res) => res.render('pages/index'));

/* "/<pagina>.html" mantém as URLs do projeto original (os scripts usam esses links) */
app.get('/:pagina.html', (req, res, next) => {
  if (!PAGINAS.includes(req.params.pagina)) return next();
  res.render('pages/' + req.params.pagina);
});

/* Atalho sem extensão: "/produto" -> "/produto.html" (mantendo a query string) */
app.get('/:pagina', (req, res, next) => {
  if (!PAGINAS.includes(req.params.pagina)) return next();
  const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  res.redirect(301, '/' + req.params.pagina + '.html' + qs);
});

app.use((req, res) => {
  res.status(404).send('Página não encontrada.');
});

app.listen(PORT, () => {
  console.log('Taú Sports rodando em http://localhost:' + PORT);
});
