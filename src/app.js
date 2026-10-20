'use strict';

const path = require('node:path');
const { randomBytes, createHmac, timingSafeEqual } = require('node:crypto');
const express = require('express');
const ambiente = require('./config/ambiente');
const criarUsuarios = require('./modelos/usuarios');
const criarProdutos = require('./modelos/produtos');
const criarPedidos = require('./modelos/pedidos');
const criarSessao = require('./seguranca/sessao');
const { gerarHash, verificarSenha } = require('./seguranca/senhas');
const { texto, emailValido, senhaValida, validarProduto, CATEGORIAS, GENEROS } = require('./validacao');
const loginSocial = require('./seguranca/login-social');
const PAGINAS = ['index', 'produto', 'login', 'cadastro', 'finalizarcompra', 'pedidos', 'trocas', 'seusdados', 'endereco', 'cartoessalvos', 'cadastrarproduto'];
const CONTA = ['pedidos', 'trocas', 'seusdados', 'endereco', 'cartoessalvos', 'cadastrarproduto'];
const rotaAsync = funcao => (req, res, next) => Promise.resolve(funcao(req, res, next)).catch(next);
const proximoSeguro = valor => /^\/?[a-z]+\.html$/.test(valor || '') && PAGINAS.includes(valor.replace(/^\//, '').replace('.html', '')) && !['login', 'cadastro'].includes(valor.replace(/^\//, '').replace('.html', ''))
  ? '/' + valor.replace(/^\//, '') : '/seusdados.html';
const jsonSeguro = objeto => JSON.stringify(objeto).replace(/[<>&\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const nomeCookieOAuth = provedor => `tau_oauth_${provedor}`;
const nomeCookieCadastroSocial = 'tau_social_cadastro';

function valorCookie(req, nome) {
  for (const parte of (req.headers.cookie || '').split(';')) {
    const posicao = parte.indexOf('=');
    if (posicao > 0 && parte.slice(0, posicao).trim() === nome) {
      return parte.slice(posicao + 1).trim();
    }
  }
  return '';
}

function compararSeguro(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const primeiro = Buffer.from(a), segundo = Buffer.from(b);
  return primeiro.length === segundo.length && timingSafeEqual(primeiro, segundo);
}

function assinarPayload(payload, segredo) {
  const corpo = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const assinatura = createHmac('sha256', segredo).update(corpo).digest('hex');
  return `${corpo}.${assinatura}`;
}

function lerPayloadAssinado(valor, segredo) {
  if (typeof valor !== 'string') return null;
  const posicao = valor.lastIndexOf('.');
  if (posicao < 1) return null;
  const corpo = valor.slice(0, posicao), assinatura = valor.slice(posicao + 1);
  const esperada = createHmac('sha256', segredo).update(corpo).digest('hex');
  if (!compararSeguro(esperada, assinatura)) return null;
  try {
    const payload = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' && payload.expiraEm > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

const ERROS_SOCIAIS = {
  google_nao_configurado: 'O login com Google ainda não está configurado neste servidor.',
  facebook_nao_configurado: 'O login com Facebook ainda não está configurado neste servidor.',
  oauth_cancelado: 'O login social foi cancelado. Você pode tentar novamente ou usar e-mail e senha.',
  oauth_estado_invalido: 'Não foi possível validar o retorno do login. Tente novamente.',
  oauth_falhou: 'Não foi possível concluir o login social. Tente novamente.',
  oauth_google_email_nao_verificado: 'O Google não confirmou o e-mail desta conta. Use outra conta ou cadastre-se com e-mail e senha.',
  conta_existente: 'Esse e-mail já tem uma conta. Entre nela e vincule Google ou Facebook em Minha Conta.',
  conta_inativa: 'Esta conta está desativada. Entre em contato com o suporte da loja.',
  perfil_expirado: 'O cadastro social expirou. Inicie o login novamente.',
  dados_invalidos: 'Informe nome, e-mail, CPF e telefone válidos para concluir seu cadastro.',
  email_ou_cpf_existente: 'Esse e-mail ou CPF já está cadastrado. Entre na conta existente e vincule o provedor em Minha Conta.',
  login_expirado: 'Sua sessão expirou. Entre novamente antes de vincular uma conta social.',
  identidade_em_uso: 'Essa conta do provedor já está vinculada a outro usuário Tau Sports.',
  vinculado: 'Conta social vinculada com sucesso.'
};

const mensagemSocial = codigo => ERROS_SOCIAIS[codigo] || '';

module.exports = function criarApp({ banco, segredo, oauth = ambiente.oauth, appBaseUrl = ambiente.appBaseUrl }) {
  const app = express();
  const usuarios = criarUsuarios(banco), produtos = criarProdutos(banco), pedidos = criarPedidos(banco), sessao = criarSessao(banco, segredo);
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
      return res.redirect(303, '/login.html?next=' + encodeURIComponent('/cadastrarproduto.ejs'));
    }
    next();
  }
  function exigirLoginApi(req, res, next) {
    if (!req.usuario) return res.status(401).json({ erro: 'Entre na sua conta para acessar os pedidos.' });
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
  const opcoesCookieSocial = (path, maxAge) => ({
    httpOnly: true, sameSite: 'lax', secure: ambiente.producao, path, maxAge
  });
  const urlBaseSocial = () => {
    const base = new URL(appBaseUrl);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password ||
        base.search || base.hash || !['', '/'].includes(base.pathname)) {
      throw new Error('app_base_url_invalida');
    }
    if (ambiente.producao && base.protocol !== 'https:') {
      throw new Error('app_base_url_precisa_https');
    }
    return base.origin;
  };
  function redirecionarErroSocial(req, res, codigo, transacao) {
    const destino = transacao && transacao.modo === 'vincular' && req.usuario
      ? '/seusdados.html' : '/login.html';
    res.redirect(303, destino + '?social=' + encodeURIComponent(codigo));
  }
  async function iniciarOAuth(req, res, provedor, modo) {
    let destino;
    try {
      const estado = randomBytes(32).toString('hex');
      destino = loginSocial.urlAutorizacao(provedor, oauth, urlBaseSocial(), estado);
      if (!destino) {
        return res.redirect(303, modo === 'vincular'
          ? `/seusdados.html?social=${provedor}_nao_configurado`
          : `/login.html?social=${provedor}_nao_configurado`);
      }
      const payload = {
        provedor, estado, modo,
        usuarioId: modo === 'vincular' ? req.usuario.id : null,
        next: proximoSeguro(texto(req.query.next)),
        expiraEm: Date.now() + 10 * 60 * 1000
      };
      res.cookie(nomeCookieOAuth(provedor), assinarPayload(payload, segredo), opcoesCookieSocial('/auth', 10 * 60 * 1000));
      res.redirect(302, destino);
    } catch (erro) {
      console.error('Falha ao iniciar login social:', erro.message === 'app_base_url_precisa_https' ? erro.message : 'configuração inválida');
      res.redirect(303, modo === 'vincular'
        ? `/seusdados.html?social=${provedor}_nao_configurado`
        : `/login.html?social=${provedor}_nao_configurado`);
    }
  }
  async function callbackOAuth(req, res, provedor) {
    const nomeCookie = nomeCookieOAuth(provedor);
    const transacao = lerPayloadAssinado(valorCookie(req, nomeCookie), segredo);
    res.clearCookie(nomeCookie, opcoesCookieSocial('/auth'));
    const estadoRecebido = typeof req.query.state === 'string' ? req.query.state : '';
    if (!transacao || transacao.provedor !== provedor || !compararSeguro(transacao.estado, estadoRecebido)) {
      return redirecionarErroSocial(req, res, 'oauth_estado_invalido', transacao);
    }
    if (req.query.error) {
      return redirecionarErroSocial(req, res, 'oauth_cancelado', transacao);
    }
    const codigo = typeof req.query.code === 'string' ? req.query.code : '';
    let perfil;
    try {
      perfil = await loginSocial.obterPerfil(provedor, codigo, oauth, urlBaseSocial());
    } catch (erro) {
      const falha = erro.message === 'oauth_google_email_nao_verificado' ? erro.message : 'oauth_falhou';
      return redirecionarErroSocial(req, res, falha, transacao);
    }
    if (!perfil.id || perfil.id.length > 191) {
      return redirecionarErroSocial(req, res, 'oauth_falhou', transacao);
    }

    if (transacao.modo === 'vincular') {
      if (!req.usuario || String(req.usuario.id) !== String(transacao.usuarioId)) {
        return redirecionarErroSocial(req, res, 'login_expirado', transacao);
      }
      const vinculada = await usuarios.porIdentidadeSocial(provedor, perfil.id);
      if (vinculada && String(vinculada.id) !== String(req.usuario.id)) {
        return redirecionarErroSocial(req, res, 'identidade_em_uso', transacao);
      }
      if (!vinculada) {
        try {
          await usuarios.vincularIdentidadeSocial({
            usuarioId: req.usuario.id, provedor, idProvedor: perfil.id, email: perfil.email
          });
        } catch (erro) {
          if (erro.code === 'ER_DUP_ENTRY') {
            return redirecionarErroSocial(req, res, 'identidade_em_uso', transacao);
          }
          throw erro;
        }
      }
      return res.redirect(303, '/seusdados.html?social=vinculado');
    }

    const identidade = await usuarios.porIdentidadeSocial(provedor, perfil.id);
    if (identidade) {
      if (!identidade.ativo) return redirecionarErroSocial(req, res, 'conta_inativa', transacao);
      await sessao.entrar(req, res, identidade.id);
      return res.redirect(303, proximoSeguro(transacao.next));
    }

    const emailPerfil = typeof perfil.email === 'string' && perfil.email.length <= 100 && emailValido(perfil.email)
      ? perfil.email.toLowerCase() : '';
    if (emailPerfil && await usuarios.porEmail(emailPerfil)) {
      return redirecionarErroSocial(req, res, 'conta_existente', transacao);
    }
    const cadastroPendente = {
      provedor, idProvedor: perfil.id, email: emailPerfil,
      nome: typeof perfil.nome === 'string' ? perfil.nome.slice(0, 100) : '',
      next: proximoSeguro(transacao.next), expiraEm: Date.now() + 10 * 60 * 1000
    };
    res.cookie(nomeCookieCadastroSocial, assinarPayload(cadastroPendente, segredo),
      opcoesCookieSocial('/auth/social', 10 * 60 * 1000));
    res.render('pages/cadastro-social', {
      erro: '', valores: { nome: cadastroPendente.nome, email: cadastroPendente.email, cpf: '', telefone: '' },
      csrfToken: req.csrfToken, provedor, emailDoProvedor: !!cadastroPendente.email
    });
  }

  for (const provedor of ['google', 'facebook']) {
    app.get(`/auth/${provedor}`, rotaAsync((req, res) => iniciarOAuth(req, res, provedor, 'login')));
    app.get(`/auth/${provedor}/vincular`, exigirLogin,
      rotaAsync((req, res) => iniciarOAuth(req, res, provedor, 'vincular')));
    app.get(`/auth/${provedor}/callback`, rotaAsync((req, res) => callbackOAuth(req, res, provedor)));
  }

  app.post('/auth/social/completar', sessao.verificarCsrf, rotaAsync(async (req, res) => {
    const pendente = lerPayloadAssinado(valorCookie(req, nomeCookieCadastroSocial), segredo);
    if (!pendente || !['google', 'facebook'].includes(pendente.provedor) || !pendente.idProvedor) {
      res.clearCookie(nomeCookieCadastroSocial, opcoesCookieSocial('/auth/social'));
      return res.redirect(303, '/login.html?social=perfil_expirado');
    }
    const nome = texto(req.body.nome), email = (pendente.email || texto(req.body.email).toLowerCase()).trim();
    const cpf = texto(req.body.cpf).replace(/\D/g, ''), telefone = texto(req.body.telefone).replace(/\D/g, '');
    const valores = { nome, email, cpf: texto(req.body.cpf), telefone: texto(req.body.telefone) };
    const erro = nome.length < 3 || nome.length > 100 || email.length > 100 || !emailValido(email) ||
      !/^\d{11}$/.test(cpf) || !/^\d{10,11}$/.test(telefone);
    const renderizarCadastroSocial = mensagem => res.status(mensagem ? 400 : 200).render('pages/cadastro-social', {
      erro: mensagem, valores, csrfToken: req.csrfToken, provedor: pendente.provedor,
      emailDoProvedor: !!pendente.email
    });
    if (erro) return renderizarCadastroSocial(mensagemSocial('dados_invalidos'));
    if (await usuarios.porEmail(email)) return renderizarCadastroSocial(mensagemSocial('email_ou_cpf_existente'));
    try {
      const senhaHash = await gerarHash(randomBytes(48).toString('base64url'));
      const usuarioId = await usuarios.cadastrarSocial({
        nome, email, senhaHash, cpf, telefone,
        provedor: pendente.provedor, idProvedor: pendente.idProvedor
      });
      res.clearCookie(nomeCookieCadastroSocial, opcoesCookieSocial('/auth/social'));
      await sessao.entrar(req, res, usuarioId);
      return res.redirect(303, proximoSeguro(pendente.next));
    } catch (erroCadastro) {
      if (erroCadastro.code === 'ER_DUP_ENTRY') {
        return renderizarCadastroSocial(mensagemSocial('email_ou_cpf_existente'));
      }
      throw erroCadastro;
    }
  }));

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
    res.redirect(303, req.body.trocar === '1' ? '/login.html' : '/index.html');
  }));
  app.get('/api/pedidos', exigirLoginApi, rotaAsync(async (req, res) => {
    res.json({ pedidos: await pedidos.listarDoUsuario(req.usuario.id) });
  }));
  app.post('/api/pedidos', exigirLoginApi, sessao.verificarCsrf, rotaAsync(async (req, res) => {
    let itens, endereco;
    try {
      itens = JSON.parse(req.body.itens || 'null');
      endereco = JSON.parse(req.body.endereco || 'null');
    } catch {
      return res.status(400).json({ erro: 'Os dados do pedido estão inválidos. Atualize a página e tente novamente.' });
    }
    try {
      const pedido = await pedidos.criar(req.usuario.id, {
        itens, endereco, metodo: req.body.metodo, cupom: req.body.cupom
      });
      res.status(201).json({ pedido });
    } catch (erro) {
      if (erro.status === 400) return res.status(400).json({ erro: erro.message });
      throw erro;
    }
  }));
  app.post('/api/pedidos/:id/troca', exigirLoginApi, sessao.verificarCsrf, rotaAsync(async (req, res) => {
    if (!/^\d{1,10}$/.test(req.params.id)) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    const registrada = await pedidos.solicitarTroca(req.usuario.id, Number(req.params.id));
    if (!registrada) return res.status(404).json({ erro: 'Pedido não encontrado ou indisponível para troca.' });
    res.json({ sucesso: true });
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
    const extras = {
      proximo: proximoSeguro(texto(req.query.next)),
      socialErro: mensagemSocial(texto(req.query.social)),
      socialSucesso: texto(req.query.social) === 'vinculado' ? mensagemSocial('vinculado') : ''
    };
    if (pagina === 'seusdados') {
      extras.provedoresVinculados = await usuarios.provedoresVinculados(req.usuario.id);
    }
    return renderizar(req, res, pagina, extras);
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
    if (req.path.startsWith('/api/')) {
      if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(erro.code)) {
        return res.status(503).json({
          erro: 'O banco ainda não está atualizado para pedidos. Pare o servidor, execute npm run banco:preparar e inicie-o novamente.'
        });
      }
      return res.status(500).json({ erro: 'Não foi possível salvar o pedido. Confira o log do servidor e tente novamente.' });
    }
    res.status(500).render('pages/erro', { titulo: 'Não foi possível concluir', mensagem: 'Ocorreu uma falha ao acessar o banco de dados. Tente novamente em instantes.' });
  });
  return app;
};
