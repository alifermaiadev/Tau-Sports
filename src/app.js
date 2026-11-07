// Objetivo: Configura o Express e define as rotas da loja e dos cadastros.
'use strict';

const path = require('node:path');
const express = require('express');
const criarUsuarios = require('./modelos/usuarios');
const criarProdutos = require('./modelos/produtos');
const criarCategorias = require('./modelos/categorias');
const criarCadastros = require('./servicos/cadastros');
const criarRelatorios = require('./servicos/relatorios');
const criarEnderecos = require('./servicos/enderecos');
const criarPedidos = require('./servicos/pedidos');
const uploadProduto = require('./servicos/upload-produto');
const criarOauth = require('./servicos/oauth');
const criarSessao = require('./seguranca/sessao');
const { gerarHash, verificarSenha } = require('./seguranca/senhas');
const { texto, emailValido, validarDadosUsuario, validarProduto, validarCategoria, GENEROS } = require('./validacao');
const PAGINAS = [
  'index', 'produto', 'login', 'cadastro', 'finalizarcompra',
  'pedidos', 'trocas', 'seusdados', 'endereco', 'cartoessalvos',
  'cadastrarproduto', 'cadastrarcategoria', 'cadastraradmin', 'relatorios'
];

const PAGINAS_CONTA = [
  'pedidos', 'trocas', 'seusdados', 'endereco', 'cartoessalvos',
  'cadastrarproduto', 'cadastrarcategoria', 'cadastraradmin', 'relatorios'
];

const PAGINAS_ADMIN = ['cadastrarproduto', 'cadastrarcategoria', 'cadastraradmin', 'relatorios'];
// Encaminha erros das rotas assíncronas para o tratador do Express.
function rotaAsync(funcao) {
  return function (req, res, next) {
    Promise.resolve(funcao(req, res, next)).catch(next);
  };
}
function proximoSeguro(valor) {
  const pagina = String(valor || '').replace(/^\//, '');
  if (!/^[a-z]+\.html$/.test(pagina)) {
    return '/seusdados.html';
  }
  const nome = pagina.replace('.html', '');
  if (!PAGINAS.includes(nome) || ['login', 'cadastro'].includes(nome)) {
    return '/seusdados.html';
  }
  return '/' + pagina;
}
function jsonSeguro(objeto) {
  return JSON.stringify(objeto).replace(/[<>&\u2028\u2029]/g, function (caractere) {
    return '\\u' + caractere.charCodeAt(0).toString(16).padStart(4, '0');
  });
}

module.exports = function criarApp({ banco, segredo }) {
  const app = express();
  const usuarios = criarUsuarios(banco);
  const produtos = criarProdutos(banco);
  const categorias = criarCategorias(banco);
  const sessao = criarSessao(banco, segredo);
  const cadastros = criarCadastros(banco);
  const relatorios = criarRelatorios(banco);
  const enderecos = criarEnderecos(banco);
  const pedidos = criarPedidos(banco);
  const oauth = criarOauth({ banco, sessao, segredo, producao:process.env.NODE_ENV === 'production' });
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
      const destino = req.path === '/administradores' ? '/cadastraradmin.html' : '/cadastrarproduto.html';
      return res.redirect(303, '/login.html?next=' + encodeURIComponent(destino));
    }
    next();
  }
  function exigirAdmin(req, res, next) {
    if (req.usuario.ies_admin !== 'S') {
      return res.status(403).render('pages/erro', { titulo: 'Acesso restrito', mensagem: 'Esta funcionalidade é permitida somente para administradores.' });
    }
    next();
  }
  function apiLogin(req, res, next) {
    if (!req.usuario) return res.status(401).json({ erro:'Faça login para continuar.' });
    next();
  }
  function apiAdmin(req, res, next) {
    if (req.usuario?.ies_admin !== 'S') return res.status(403).json({ erro:'Acesso administrativo necessário.' });
    next();
  }
  function apiCsrf(req, res, next) {
    if (req.get('X-CSRF-Token') !== req.csrfToken) return res.status(403).json({ erro:'Validação CSRF inválida.' });
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
    const email = texto(req.body.email).toLowerCase();
    const senha = typeof req.body.senha === 'string' ? req.body.senha : '';
    const proximo = proximoSeguro(texto(req.body.next));
    if (!emailValido(email) || senha.length === 0 || senha.length > 128) {
      return res.status(400).render('pages/login', { erro: 'Informe um e-mail e uma senha válidos.', valores: { email }, proximo });
    }
    const usuario = await usuarios.porEmail(email);
    const hash = usuario ? usuario.senha_hash : await hashInexistente;
    const correta = await verificarSenha(senha, hash);
    if (!usuario || !correta) {
      return res.status(401).render('pages/login', { erro: 'E-mail ou senha incorretos.', valores: { email }, proximo });
    }
    await sessao.entrar(req, res, usuario.id);
    tentativas.delete(req.ip);
    res.redirect(303, proximo);
  }));
  app.post('/cadastro', sessao.verificarCsrf, limitarTentativas, rotaAsync(async (req, res) => {
    const cadastro = validarDadosUsuario(req.body);

    if (cadastro.erros.length > 0) {
      return res.status(400).render('pages/cadastro', {
        erro: cadastro.erros.join(' '),
        valores: cadastro.valores
      });
    }

    try {
      // O formulário público nunca pode definir privilégios de administrador.
      const senhaHash = await gerarHash(req.body.senha);
      const id = await usuarios.cadastrar({ ...cadastro.dados, senhaHash });
      await sessao.entrar(req, res, id);
      res.redirect(303, '/seusdados.html');
    } catch (erro) {
      if (erro.code === 'ER_DUP_ENTRY') {
        return res.status(409).render('pages/cadastro', { erro: 'E-mail ou CPF já cadastrado.', valores: cadastro.valores });
      }
      throw erro;
    }
  }));
  app.post('/logout', sessao.verificarCsrf, rotaAsync(async (req, res) => {
    await sessao.sair(req, res);
    res.redirect(303, '/index.html');
  }));
  // Admin pode cadastrar categorias, marcas e gêneros sem sair da página de produtos.
  app.post('/cadastros/:tipo', exigirLogin, exigirAdmin, sessao.verificarCsrf, rotaAsync(async (req, res) => {
    const tipo = req.params.tipo;
    try {
      await cadastros.cadastrar(tipo, req.body.nome);
      return res.redirect(303, '/cadastrarproduto.html?registro=' + encodeURIComponent(tipo));
    } catch (erro) {
      if (erro.code !== 'ER_DUP_ENTRY' && !erro.status) throw erro;
      res.status(erro.code === 'ER_DUP_ENTRY' ? 409 : erro.status || 400);
      const opcoes = await cadastros.opcoes();
      return renderizar(req, res, 'cadastrarproduto', {
        erros: [erro.code === 'ER_DUP_ENTRY' ? 'Esse registro já existe.' : erro.message],
        valores:{ registro:tipo }, sucesso:false, produtoCadastrado:null,
        editando:null, listaProdutos:await produtos.listar(), ...opcoes
      });
    }
  }));
  const salvarProduto = editar => rotaAsync(async (req, res) => {
    const imagensManuais = typeof req.body.imagens === 'string' ? req.body.imagens : '';
    const imagensGravadas = await uploadProduto.salvarArquivos(req.arquivosImagem);
    req.body.imagens = [imagensManuais.trim(), ...imagensGravadas].filter(Boolean).join('\n');
    try {
      const opcoes = await cadastros.opcoes();
      const { erros, produto } = validarProduto(req.body, opcoes);
      const editando = editar ? await produtos.buscarPorId(req.params.id) : null;
      if (editar && !editando) {
        await uploadProduto.removerArquivos(imagensGravadas);
        return res.status(404).render('pages/erro', {
          titulo:'Produto não encontrado', mensagem:'Verifique o endereço.'
        });
      }
      if (erros.length) {
        await uploadProduto.removerArquivos(imagensGravadas);
        req.body.imagens = imagensManuais;
        res.status(400);
        return renderizar(req, res, 'cadastrarproduto', {
          erros, valores:req.body, sucesso:false, produtoCadastrado:null,
          editando, listaProdutos:await produtos.listar(), ...opcoes
        });
      }
      if (editar) {
        // Mantém o ID e histórico de compras ao atualizar o produto.
        await produtos.atualizar(req.params.id, produto);
        return res.redirect(303, '/cadastrarproduto.html?editar=' + encodeURIComponent(req.params.id) + '&atualizado=1');
      }
      await produtos.cadastrar(produto, req.usuario.id);
      return res.redirect(303, '/cadastrarproduto.html?criado=' + encodeURIComponent(produto.id));
    } catch (erro) {
      await uploadProduto.removerArquivos(imagensGravadas);
      throw erro;
    }
  });
  app.post('/produtos', exigirLogin, exigirAdmin, uploadProduto.lerMultipart, sessao.verificarCsrf, salvarProduto(false));
  app.post('/produtos/:id/editar', exigirLogin, exigirAdmin, uploadProduto.lerMultipart, sessao.verificarCsrf, salvarProduto(true));

  // API de conta: sempre usa o usuário da sessão, nunca um ID informado pelo navegador.
  app.get('/api/enderecos', apiLogin, rotaAsync(async (req, res) => res.json(await enderecos.listar(req.usuario.id))));
  app.post('/api/enderecos', apiLogin, apiCsrf, rotaAsync(async (req, res) => res.json(await enderecos.salvar(req.usuario.id,req.body))));
  app.get('/api/pedidos', apiLogin, rotaAsync(async (req, res) => res.json(await pedidos.listar(req.usuario.id))));
  app.post('/api/pedidos', apiLogin, apiCsrf, rotaAsync(async (req, res) => res.status(201).json(await pedidos.criar(req.usuario.id,req.body))));
  app.post('/api/pedidos/:id/troca', apiLogin, apiCsrf, rotaAsync(async (req, res) => res.json(await pedidos.solicitarTroca(req.usuario.id,req.params.id))));
  // Acesso a dados de clientes, vendas e endereços é restrito ao administrador.
  app.post('/api/pedidos/:id/status', apiLogin, apiAdmin, apiCsrf, rotaAsync(async (req, res) =>
    res.json(await pedidos.atualizarStatus(req.params.id, req.body.status))));
  app.get('/api/relatorios/dashboard', apiLogin, apiAdmin, rotaAsync(async (req, res) =>
    res.json(await relatorios.dashboard(req.query.periodo))));
  app.get('/api/relatorios/:tipo', apiLogin, apiAdmin, rotaAsync(async (req, res) =>
    res.json(await relatorios.consultar(req.params.tipo))));

  app.get('/auth/:provedor', rotaAsync(async (req, res) => oauth.iniciar(req,res)));
  app.get('/auth/:provedor/callback', rotaAsync(async (req, res) => oauth.callback(req,res)));
  // Somente ADMIN pode criar categorias, assim como acontece com produtos.
  app.post('/categorias', exigirLogin, exigirAdmin, sessao.verificarCsrf, rotaAsync(async (req, res) => {
    const { erros, categoria } = validarCategoria(req.body);
    if (erros.length) {
      res.status(400);
      return renderizar(req, res, 'cadastrarcategoria', {
        erros, valores: req.body, sucesso: false, categoriaCadastrada: null
      });
    }

    try {
      await categorias.cadastrar(categoria);
      res.redirect(303, '/cadastrarcategoria.html?criada=' + encodeURIComponent(categoria.chave));
    } catch (erro) {
      if (erro.code === 'ER_DUP_ENTRY') {
        res.status(409);
        return renderizar(req, res, 'cadastrarcategoria', {
          erros: ['Esta categoria já está cadastrada.'], valores: req.body,
          sucesso: false, categoriaCadastrada: null
        });
      }
      throw erro;
    }
  }));

  // Administradores autenticados podem cadastrar outros administradores pela interface.
  app.post('/administradores', exigirLogin, exigirAdmin, sessao.verificarCsrf, rotaAsync(async (req, res) => {
    const cadastro = validarDadosUsuario(req.body);

    if (cadastro.erros.length > 0) {
      res.status(400);
      return renderizar(req, res, 'cadastraradmin', {
        erros: cadastro.erros,
        valores: cadastro.valores,
        sucesso: false
      });
    }

    try {
      const senhaHash = await gerarHash(req.body.senha);
      await usuarios.cadastrarAdmin({ ...cadastro.dados, senhaHash });
      res.redirect(303, '/cadastraradmin.html?criado=1');
    } catch (erro) {
      if (erro.code === 'ER_DUP_ENTRY') {
        res.status(409);
        return renderizar(req, res, 'cadastraradmin', {
          erros: ['E-mail ou CPF já cadastrado.'], valores: cadastro.valores, sucesso: false
        });
      }
      throw erro;
    }
  }));

  app.get('/', rotaAsync((req, res) => renderizar(req, res, 'index')));
  app.get('/:pagina.html', rotaAsync(async (req, res, next) => {
    const pagina = req.params.pagina;
    if (!PAGINAS.includes(pagina)) {
      return next();
    }
    if (PAGINAS_CONTA.includes(pagina) && !req.usuario) {
      return res.redirect(303, '/login.html?next=' + encodeURIComponent('/' + pagina + '.html'));
    }
    if (PAGINAS_ADMIN.includes(pagina) && req.usuario.ies_admin !== 'S') {
      return exigirAdmin(req, res, next);
    }
    if (['login', 'cadastro'].includes(pagina) && req.usuario) {
      return res.redirect(303, proximoSeguro(texto(req.query.next)));
    }
    if (pagina === 'cadastraradmin') {
      return renderizar(req, res, pagina, {
        erros: [], valores: {}, sucesso: texto(req.query.criado) === '1'
      });
    }
    if (pagina === 'cadastrarproduto') {
      const catalogo = await produtos.listar();
      const cadastrado = catalogo.find(item => item.id === texto(req.query.criado));
      const editando = catalogo.find(item => item.id === texto(req.query.editar)) || null;
      const opcoes = await cadastros.opcoes();
      const valores = editando ? { ...editando,
        imagens:editando.imagens.join('\n'),
        cores:editando.cores.map(c => c.nome).join(', '),
        detalhes:editando.detalhes.join('\n') } : {};
      return renderizar(req, res, pagina, {
        erros:[], valores,
        sucesso:!!cadastrado || !!req.query.registro || !!req.query.atualizado,
        mensagemSucesso:req.query.registro ? 'Cadastro realizado.' : req.query.atualizado ? 'Produto atualizado.' : '',
        produtoCadastrado:cadastrado || null, editando, listaProdutos:catalogo, ...opcoes
      }, catalogo);
    }
    if (pagina === 'relatorios') return renderizar(req, res, pagina);
    if (pagina === 'cadastrarcategoria') {
      const cadastradas = await categorias.listar();
      const chave = texto(req.query.criada);
      const categoriaCadastrada = Object.hasOwn(cadastradas, chave) ? cadastradas[chave] : null;
      return renderizar(req, res, pagina, {
        erros: [], valores: {}, sucesso: !!categoriaCadastrada, categoriaCadastrada
      });
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
    if (req.path.startsWith('/api/')) return res.status(erro.status || (erro.code === 'ER_DUP_ENTRY' ? 409 : 500)).json({
      erro:erro.status && erro.status < 500 ? erro.message : 'Não foi possível concluir. Tente novamente.'
    });
    if (req.path.startsWith('/auth/')) return res.status(erro.status || 500).render('pages/erro', {
      titulo:'Falha na autenticação', mensagem:erro.status ? erro.message : 'Não foi possível autenticar com o provedor.'
    });
    if (erro.status) return res.status(erro.status).render('pages/erro', {
      titulo:'Não foi possível concluir', mensagem:erro.message
    });
    res.status(500).render('pages/erro', { titulo: 'Não foi possível concluir', mensagem: 'Ocorreu uma falha ao acessar o banco de dados. Tente novamente em instantes.' });
  });
  return app;
};
