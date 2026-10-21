'use strict';

const path = require('node:path');
const express = require('express');
const criarUsuarios = require('./modelos/usuarios');
const criarProdutos = require('./modelos/produtos');
const criarSessao = require('./seguranca/sessao');
const criarCadastros = require('./servicos/cadastros');
const criarRelatorios = require('./servicos/relatorios');
const criarEnderecos = require('./servicos/enderecos');
const criarPedidos = require('./servicos/pedidos');
const criarOauth = require('./servicos/oauth');
const { gerarHash, verificarSenha } = require('./seguranca/senhas');
const { texto, emailValido, senhaValida, validarProduto, CATEGORIAS, GENEROS } = require('./validacao');
const PAGINAS = ['index', 'produto', 'login', 'cadastro', 'finalizarcompra', 'pedidos', 'trocas', 'seusdados', 'endereco', 'cartoessalvos', 'cadastrarproduto', 'relatorios'];
const CONTA = ['pedidos', 'trocas', 'seusdados', 'endereco', 'cartoessalvos', 'cadastrarproduto', 'relatorios'];
const rotaAsync = funcao => (req, res, next) => Promise.resolve(funcao(req, res, next)).catch(next);
const proximoSeguro = valor => /^\/?[a-z]+\.html$/.test(valor || '') && PAGINAS.includes(valor.replace(/^\//, '').replace('.html', '')) && !['login', 'cadastro'].includes(valor.replace(/^\//, '').replace('.html', ''))
  ? '/' + valor.replace(/^\//, '') : '/seusdados.html';
const jsonSeguro = objeto => JSON.stringify(objeto).replace(/[<>&\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

module.exports = function criarApp({ banco, segredo }) {
  const app = express();
  const usuarios = criarUsuarios(banco), produtos = criarProdutos(banco), sessao = criarSessao(banco, segredo);
  const cadastros = criarCadastros(banco), relatorios = criarRelatorios(banco), enderecos = criarEnderecos(banco), pedidos = criarPedidos(banco);
  const oauth = criarOauth({ banco, sessao, segredo, producao: process.env.NODE_ENV === 'production' });
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
  app.use(express.json({ limit: '64kb' }));
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
      return res.redirect(303, '/login.html?next=' + encodeURIComponent('/cadastrarproduto.ejs'));
    }
    next();
  }
  function exigirAdmin(req, res, next) {
    if (!req.usuario || req.usuario.ies_admin !== 'S') {
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
  function apiLogin(req, res, next) { if (!req.usuario) return res.status(401).json({ erro: 'Faça login para continuar.' }); next(); }
  function apiAdmin(req, res, next) { if (req.usuario?.ies_admin !== 'S') return res.status(403).json({ erro: 'Acesso administrativo necessário.' }); next(); }
  function apiCsrf(req, res, next) {
    if (req.get('X-CSRF-Token') !== req.csrfToken) return res.status(403).json({ erro: 'Validação CSRF inválida.' });
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
    const nome = texto(req.body.nome), email = texto(req.body.email).toLowerCase();
    const cpf = texto(req.body.cpf).replace(/\D/g, '');
    const telefone = texto(req.body.telefone).replace(/\D/g, '');
    const valores = { nome, email, cpf: texto(req.body.cpf), telefone: texto(req.body.telefone) };
    if (nome.length < 3 || nome.length > 100 || email.length > 100 || !emailValido(email) || !/^\d{11}$/.test(cpf) || !/^\d{10,11}$/.test(telefone) || !senhaValida(req.body.senha) || req.body.senha !== req.body.confirmarSenha) {
      return res.status(400).render('pages/cadastro', { erro: 'Informe nome, e-mail, CPF (11 dígitos), telefone (10 ou 11 dígitos) e senha de 8 a 128 caracteres. Confirme a mesma senha.', valores });
    }
    try {
      // O formulário público nunca pode definir privilégios de administrador.
      const id = await usuarios.cadastrar({ nome, email, senhaHash: await gerarHash(req.body.senha), cpf, telefone });
      await sessao.entrar(req, res, id);
      res.redirect(303, '/seusdados.html');
    } catch (erro) {
      if (erro.code === 'ER_DUP_ENTRY') {
        return res.status(409).render('pages/cadastro', { erro: 'E-mail ou CPF já cadastrado.', valores });
      }
      throw erro;
    }
  }));
  app.post('/logout', sessao.verificarCsrf, rotaAsync(async (req, res) => {
    await sessao.sair(req, res);
    res.redirect(303, '/index.html');
  }));
  // Cadastro de categorias, marcas e gêneros; valores vêm do banco, nunca do navegador.
  app.post('/cadastros/:tipo', exigirLogin, exigirAdmin, sessao.verificarCsrf, rotaAsync(async (req, res) => {
    const tipo = req.params.tipo;
    try {
      await cadastros.cadastrar(tipo, req.body.nome);
      return res.redirect(303, '/cadastrarproduto.html?registro=' + encodeURIComponent(tipo));
    } catch (erro) {
      if (erro.code !== 'ER_DUP_ENTRY' && !erro.status) throw erro;
      res.status(erro.code === 'ER_DUP_ENTRY' ? 409 : erro.status || 400);
      const opcoes = await cadastros.opcoes();
      return renderizar(req,res,'cadastrarproduto',{ erros: [erro.code === 'ER_DUP_ENTRY' ? 'Esse registro já existe.' : erro.message],
        valores: { registro: tipo }, sucesso:false, produtoCadastrado:null, editando:null, listaProdutos:await produtos.listar(), ...opcoes });
    }
  }));
  const salvarProduto = editar => rotaAsync(async (req,res) => {
    const opcoes = await cadastros.opcoes();
    const { erros, produto } = validarProduto(req.body, opcoes);
    const editando = editar ? await produtos.buscarPorId(req.params.id) : null;
    if (editar && !editando) return res.status(404).render('pages/erro',{titulo:'Produto não encontrado',mensagem:'Verifique o endereço.'});
    if (erros.length) {
      res.status(400);
      return renderizar(req,res,'cadastrarproduto',{ erros, valores: req.body, sucesso:false,
        produtoCadastrado:null, editando, listaProdutos:await produtos.listar(), ...opcoes });
    }
    if (editar) {
      await produtos.atualizar(req.params.id,produto);
      return res.redirect(303,'/cadastrarproduto.html?editar='+encodeURIComponent(req.params.id)+'&atualizado=1');
    }
    await produtos.cadastrar(produto,req.usuario.id);
    return res.redirect(303,'/cadastrarproduto.html?criado='+encodeURIComponent(produto.id));
  });
  app.post('/produtos', exigirLogin, exigirAdmin, sessao.verificarCsrf, salvarProduto(false));
  app.post('/produtos/:id/editar', exigirLogin, exigirAdmin, sessao.verificarCsrf, salvarProduto(true));

  // Endereços sempre associados ao usuário autenticado (sem ID fornecido pelo cliente).
  app.get('/api/enderecos', apiLogin, rotaAsync(async (req,res) => res.json(await enderecos.listar(req.usuario.id))));
  app.post('/api/enderecos', apiLogin, apiCsrf, rotaAsync(async (req,res) => res.status(200).json(await enderecos.salvar(req.usuario.id,req.body))));
  app.get('/api/pedidos', apiLogin, rotaAsync(async (req,res) => res.json(await pedidos.listar(req.usuario.id))));
  app.post('/api/pedidos', apiLogin, apiCsrf, rotaAsync(async (req,res) => res.status(201).json(await pedidos.criar(req.usuario.id,req.body))));
  app.post('/api/pedidos/:id/troca',apiLogin,apiCsrf,rotaAsync(async (req,res)=>res.json(await pedidos.solicitarTroca(req.usuario.id,req.params.id))));

  // API de relatórios com lista fechada de nomes SQL, sem interpolação de entrada arbitrária.
  app.get('/api/relatorios/:tipo', apiLogin, apiAdmin, rotaAsync(async (req,res) =>
    res.json(await relatorios.consultar(req.params.tipo))));

  app.get('/auth/:provedor', rotaAsync(async (req,res) => oauth.iniciar(req,res)));
  app.get('/auth/:provedor/callback', rotaAsync(async (req,res) => oauth.callback(req,res)));

  app.get('/', rotaAsync((req, res) => renderizar(req, res, 'index')));
  app.get('/:pagina.html', rotaAsync(async (req, res, next) => {
    const pagina = req.params.pagina;
    if (!PAGINAS.includes(pagina)) {
      return next();
    }
    if (CONTA.includes(pagina) && !req.usuario) {
      return res.redirect(303, '/login.html?next=' + encodeURIComponent('/' + pagina + '.html'));
    }
    if (['cadastrarproduto','relatorios'].includes(pagina) && req.usuario.ies_admin !== 'S') {
      return exigirAdmin(req, res, next);
    }
    if (['login', 'cadastro'].includes(pagina) && req.usuario) {
      return res.redirect(303, proximoSeguro(texto(req.query.next)));
    }
    if (pagina === 'cadastrarproduto') {
      const catalogo = await produtos.listar();
      const cadastrado = catalogo.find(p => p.id === texto(req.query.criado));
      const editando = catalogo.find(p => p.id === texto(req.query.editar)) || null;
      const opcoes = await cadastros.opcoes();
      const valores = editando ? { ...editando, imagens:editando.imagens.join('\n'),
        cores:editando.cores.map(c=>c.nome).join(', '), detalhes:editando.detalhes.join('\n') } : {};
      return renderizar(req,res,pagina,{ erros:[], valores, sucesso:!!cadastrado || !!req.query.registro || !!req.query.atualizado,
        mensagemSucesso: req.query.registro ? 'Cadastro realizado.' : req.query.atualizado ? 'Produto atualizado.' : '',
        produtoCadastrado:cadastrado || null, editando, listaProdutos:catalogo, ...opcoes },catalogo);
    }
    if (pagina === 'relatorios') return renderizar(req,res,pagina);
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
    if (req.path.startsWith('/api/')) return res.status(erro.status || (erro.code === 'ER_DUP_ENTRY' ? 409 : 500)).json({ erro: erro.status && erro.status < 500 ? erro.message : 'Não foi possível concluir. Tente novamente.' });
    if (req.path.startsWith('/auth/')) return res.status(erro.status || 500).render('pages/erro', { titulo:'Falha na autenticação', mensagem: erro.status ? erro.message : 'Não foi possível autenticar com o provedor.' });
    if (erro.status) return res.status(erro.status).render('pages/erro', {titulo:'Não foi possível concluir', mensagem:erro.message});
    res.status(500).render('pages/erro', { titulo: 'Não foi possível concluir', mensagem: 'Ocorreu uma falha ao acessar o banco de dados. Tente novamente em instantes.' });
  });
  return app;
};
