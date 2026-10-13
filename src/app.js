'use strict';

const path = require('node:path');
const express = require('express');
const criarUsuarios = require('./modelos/usuarios');
const criarProdutos = require('./modelos/produtos');
const criarSessao = require('./seguranca/sessao');
const { gerarHash, verificarSenha } = require('./seguranca/senhas');
const { texto, emailValido, senhaValida, validarProduto, CATEGORIAS, GENEROS } = require('./validacao');
const PAGINAS = ['index', 'produto', 'login', 'cadastro', 'finalizarcompra', 'pedidos', 'trocas', 'seusdados', 'endereco', 'cartoessalvos', 'cadastrarproduto'];
const CONTA = ['pedidos', 'trocas', 'seusdados', 'endereco', 'cartoessalvos', 'cadastrarproduto'];
const rotaAsync = funcao => (req, res, next) => Promise.resolve(funcao(req, res, next)).catch(next);
const proximoSeguro = valor => /^\/?[a-z]+\.html$/.test(valor || '') && PAGINAS.includes(valor.replace(/^\//, '').replace('.html', '')) && !['login', 'cadastro'].includes(valor.replace(/^\//, '').replace('.html', ''))
  ? '/' + valor.replace(/^\//, '') : '/seusdados.html';
const jsonSeguro = objeto => JSON.stringify(objeto).replace(/[<>&\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

module.exports = function criarApp({ banco, segredo }) {
  const app = express();
  const usuarios = criarUsuarios(banco), produtos = criarProdutos(banco), sessao = criarSessao(banco, segredo);
  const tentativas = new Map();
  const hashInexistente = gerarHash('credencial-inexistente-' + segredo);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../views'));
  app.disable('x-powered-by');
  app.use(express.static(path.join(__dirname, '../public'), {
    setHeaders(res, arquivo) {
      if (arquivo.endsWith('.avif')) {
        res.type('image/avif');
      }
    }
  }));
  app.use(express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 100 }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    next();
  });
  app.use(sessao.carregar);
  function exigirLogin(req, res, next) {
    if (!req.usuario) {
      return res.redirect(303, '/login.html?next=' + encodeURIComponent('/cadastrarproduto.html'));
    }
    next();
  }
  function exigirAdmin(req, res, next) {
    if (req.usuario.ies_admin !== 'S') {
      return res.status(403).render('pages/erro', { titulo: 'Acesso restrito', mensagem: 'O cadastro de produtos é permitido somente para administradores.' });
    }
    next();
  }
  function limitarTentativas(req, res, next) {
    const agora = Date.now();
    for (const [chave, valor] of tentativas) {
      if (valor.expira <= agora) {
        tentativas.delete(chave);
      }
    }
    const atual = tentativas.get(req.ip) || { quantidade: 0, expira: agora + 15 * 60 * 1000 };
    atual.quantidade++;
    tentativas.set(req.ip, atual);
    if (atual.quantidade > 20) {
      res.set('Retry-After', String(Math.ceil((atual.expira - agora) / 1000)));
      return res.status(429).render('pages/erro', { titulo: 'Muitas tentativas', mensagem: 'Aguarde alguns minutos antes de tentar novamente.' });
    }
    next();
  }
  async function renderizar(req, res, pagina, extras = {}, catalogoExistente) {
    const catalogo = catalogoExistente || await produtos.listar();
    res.locals.contextoJson = jsonSeguro({ usuario: req.usuario, csrfToken: req.csrfToken, produtos: catalogo });
    res.render('pages/' + pagina, extras);
  }
  app.post('/login', sessao.verificarCsrf, limitarTentativas, rotaAsync(async (req, res) => {
    const email = texto(req.body.email).toLowerCase(), senha = typeof req.body.senha === 'string' ? req.body.senha : '';
    const proximo = proximoSeguro(texto(req.body.next));
    if (!emailValido(email) || senha.length === 0 || senha.length > 128) {
      return res.status(400).render('pages/login', { erro: 'Informe um e-mail e uma senha válidos.', valores: { email }, proximo });
    }
    const usuario = await usuarios.porEmail(email);
    const correta = await verificarSenha(senha, usuario ? usuario.senha_hash : await hashInexistente);
    if (!usuario || !correta) {
      return res.status(401).render('pages/login', { erro: 'E-mail ou senha incorretos.', valores: { email }, proximo });
    }
    await sessao.entrar(req, res, usuario.id);
    tentativas.delete(req.ip);
    res.redirect(303, proximo);
  }));
  app.post('/cadastro', sessao.verificarCsrf, limitarTentativas, rotaAsync(async (req, res) => {
    const nome = texto(req.body.nome), email = texto(req.body.email).toLowerCase(), valores = { nome, email };
    if (nome.length < 3 || nome.length > 120 || !emailValido(email) || !senhaValida(req.body.senha) || req.body.senha !== req.body.confirmarSenha) {
      return res.status(400).render('pages/cadastro', { erro: 'Informe nome, e-mail e senha de 8 a 128 caracteres. A confirmação deve ser igual à senha.', valores });
    }
    try {
      // O formulário público nunca pode definir o perfil do usuário.
      const id = await usuarios.cadastrar({ nome, email, senhaHash: await gerarHash(req.body.senha), ies_admin: 'N' });
      await sessao.entrar(req, res, id);
      res.redirect(303, '/seusdados.html');
    } catch (erro) {
      if (erro.code === 'ER_DUP_ENTRY') {
        return res.status(409).render('pages/cadastro', { erro: 'Este e-mail já está cadastrado.', valores });
      }
      throw erro;
    }
  }));
  app.post('/logout', sessao.verificarCsrf, rotaAsync(async (req, res) => {
    await sessao.sair(req, res);
    res.redirect(303, '/index.html');
  }));
  app.post('/produtos', exigirLogin, exigirAdmin, sessao.verificarCsrf, rotaAsync(async (req, res) => {
    const { erros, produto } = validarProduto(req.body);
    if (erros.length) {
      res.status(400);
      return renderizar(req, res, 'cadastrarproduto', { erros, valores: req.body, sucesso: false, produtoCadastrado: null, categorias: CATEGORIAS, generos: GENEROS });
    }
    await produtos.cadastrar(produto, req.usuario.id);
    res.redirect(303, '/cadastrarproduto.html?criado=' + encodeURIComponent(produto.id));
  }));
  app.get('/', rotaAsync((req, res) => renderizar(req, res, 'index')));
  app.get('/:pagina.html', rotaAsync(async (req, res, next) => {
    const pagina = req.params.pagina;
    if (!PAGINAS.includes(pagina)) {
      return next();
    }
    if (CONTA.includes(pagina) && !req.usuario) {
      return res.redirect(303, '/login.html?next=' + encodeURIComponent('/' + pagina + '.html'));
    }
    if (pagina === 'cadastrarproduto' && req.usuario.ies_admin !== 'S') {
      return exigirAdmin(req, res, next);
    }
    if (['login', 'cadastro'].includes(pagina) && req.usuario) {
      return res.redirect(303, proximoSeguro(texto(req.query.next)));
    }
    if (pagina === 'cadastrarproduto') {
      const catalogo = await produtos.listar();
      const cadastrado = catalogo.find(produto => produto.id === texto(req.query.criado));
      return renderizar(req, res, pagina, { erros: [], valores: {}, sucesso: !!cadastrado, produtoCadastrado: cadastrado || null, categorias: CATEGORIAS, generos: GENEROS }, catalogo);
    }
    return renderizar(req, res, pagina, { proximo: proximoSeguro(texto(req.query.next)) });
  }));
  app.get('/:pagina', (req, res, next) => {
    if (!PAGINAS.includes(req.params.pagina)) {
      return next();
    }
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(301, '/' + req.params.pagina + '.html' + qs);
  });
  app.use((req, res) => res.status(404).render('pages/erro', { titulo: 'Página não encontrada', mensagem: 'O endereço solicitado não existe.' }));
  app.use((erro, req, res, next) => {
    console.error('Falha no TauSports:', erro.code || erro.name);
    if (res.headersSent) {
      return next(erro);
    }
    if (erro.status === 413 || erro.type === 'entity.too.large') {
      return res.status(413).send('Formulário muito grande. Reduza os dados e tente novamente.');
    }
    res.status(500).render('pages/erro', { titulo: 'Não foi possível concluir', mensagem: 'Ocorreu uma falha ao acessar o banco de dados. Tente novamente em instantes.' });
  });
  return app;
};
