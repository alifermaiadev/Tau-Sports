'use strict';
// Fluxo OAuth2 via simple-oauth2; state assinado em cookie HttpOnly, uso único.
const { randomBytes, createHmac, timingSafeEqual } = require('node:crypto');
const { AuthorizationCode } = require('simple-oauth2');
const { texto } = require('../validacao');
const { gerarHash } = require('../seguranca/senhas');
const PREFIX = 'tau_oauth_';
const MAX_AGE = 10 * 60 * 1000;
const configs = {
  google: { id: 'GOOGLE_CLIENT_ID', secret: 'GOOGLE_CLIENT_SECRET',
    tokenHost: 'https://oauth2.googleapis.com', authorizeHost: 'https://accounts.google.com',
    authorizePath: '/o/oauth2/v2/auth', tokenPath: '/token', scope: 'openid email profile',
    perfil: 'https://openidconnect.googleapis.com/v1/userinfo' },
  facebook: { id: 'FACEBOOK_CLIENT_ID', secret: 'FACEBOOK_CLIENT_SECRET',
    tokenHost: 'https://graph.facebook.com', authorizeHost: 'https://www.facebook.com',
    authorizePath: '/v23.0/dialog/oauth', tokenPath: '/v23.0/oauth/access_token', scope: 'public_profile,email',
    perfil: 'https://graph.facebook.com/me?fields=id,name,email' }
};
const comparar = (a,b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x,y);
};
const cookie = (req,nome) => (req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(nome+'='))?.slice(nome.length+1) || '';
module.exports = ({ banco, sessao, segredo, producao }) => {
  const hmac = valor => createHmac('sha256', segredo).update(valor).digest('hex');
  const opcoes = { httpOnly: true, secure: producao, sameSite: 'lax', path: '/auth', maxAge: MAX_AGE };
  const configurar = (provedor, req) => {
    const c = configs[provedor];
    if (!Object.hasOwn(configs,provedor)) throw Object.assign(new Error('Provedor inválido'), { status: 404 });
    const id = process.env[c.id], secret = process.env[c.secret];
    if (!id || !secret || !process.env.APP_ORIGIN) throw Object.assign(new Error('Login social indisponível: configure as credenciais e APP_ORIGIN.'), { status: 503 });
    const origem = new URL(process.env.APP_ORIGIN);
    if (origem.pathname !== '/' || origem.search || origem.hash || (origem.protocol !== 'https:' && origem.hostname !== 'localhost' && origem.hostname !== '127.0.0.1'))
      throw Object.assign(new Error('APP_ORIGIN inválida.'), { status: 503 });
    const callback = origem.origin + '/auth/' + provedor + '/callback';
    const client = new AuthorizationCode({ client: { id, secret }, auth: { tokenHost: c.tokenHost,
      authorizeHost: c.authorizeHost, authorizePath: c.authorizePath, tokenPath: c.tokenPath }, options: { authorizationMethod: 'body' } });
    return { c, client, callback };
  };
  async function associar(provedor, identificador, perfil, usuarioAtual) {
    const [social] = await banco.execute('SELECT id_usuario FROM CONTA_SOCIAL WHERE provedor=? AND id_provedor=? LIMIT 1', [provedor, identificador]);
    if (social.length) {
      if (usuarioAtual && social[0].id_usuario !== usuarioAtual) throw Object.assign(new Error('Essa conta social já pertence a outro usuário.'), { status: 409 });
      return social[0].id_usuario;
    }
    if (usuarioAtual) {
      await banco.execute('INSERT INTO CONTA_SOCIAL (id_usuario,provedor,id_provedor) VALUES (?,?,?)', [usuarioAtual, provedor, identificador]);
      return usuarioAtual;
    }
    // Sem auto-vinculação por e-mail: usuário existente entra por senha primeiro e vincula manualmente.
    const emailConfiavel = provedor === 'google' && perfil.email_verified === true && typeof perfil.email === 'string' && perfil.email.length <= 100;
    const email = emailConfiavel ? perfil.email.toLowerCase() : `${provedor}-${identificador.replace(/[^a-zA-Z0-9]/g,'').slice(0,50)}@oauth.local`;
    const [existente] = await banco.execute('SELECT id_usuario FROM USUARIO WHERE email_usuario=? LIMIT 1', [email]);
    if (existente.length) throw Object.assign(new Error('Esse e-mail já está cadastrado. Entre com sua senha e vincule a conta social em Seus Dados.'), { status: 409 });
    const nome = texto(perfil.name).slice(0,100) || 'Cliente Taú Sports';
    const conexao = await banco.getConnection();
    try {
      await conexao.beginTransaction();
      const cpfInterno = 'O' + randomBytes(6).toString('hex');
      const [res] = await conexao.execute(`INSERT INTO USUARIO (nome_usuario,email_usuario,senha_usuario,cpf_usuario,telefone_usuario,ativo,ies_admin)
        VALUES (?,?,?,?,?,1,'N')`, [nome,email,await gerarHash(randomBytes(32).toString('hex')),cpfInterno,'']);
      await conexao.execute('INSERT INTO CONTA_SOCIAL (id_usuario,provedor,id_provedor) VALUES (?,?,?)', [res.insertId, provedor, identificador]);
      await conexao.commit(); return res.insertId;
    } catch (e) { await conexao.rollback(); throw e; } finally { conexao.release(); }
  }
  return {
    iniciar(req,res) {
      const provedor = req.params.provedor, { c, client, callback } = configurar(provedor,req);
      const state = randomBytes(32).toString('hex');
      const proximo = /^\/(?:[a-z]+)\.html$/.test(req.query.next || '') ? req.query.next : '/seusdados.html';
      const dados = [state,Date.now(),req.usuario?.id || '',proximo].join('|');
      res.cookie(PREFIX+provedor, Buffer.from(dados).toString('base64url')+'.'+hmac(dados), opcoes);
      res.redirect(client.authorizeURL({redirect_uri: callback,scope:c.scope,state}));
    },
    async callback(req,res) {
      const provedor = req.params.provedor;
      const { c, client, callback } = configurar(provedor,req);
      const raw = cookie(req,PREFIX+provedor);
      const { maxAge, ...opcoesLimpar } = opcoes;
      res.clearCookie(PREFIX+provedor,opcoesLimpar);
      const pos = raw.lastIndexOf('.');
      const dados = pos>0 ? Buffer.from(raw.slice(0,pos),'base64url').toString() : '';
      const [state,quando,usuarioId,proximo] = dados.split('|');
      if (!dados || !comparar(raw.slice(pos+1),hmac(dados)) || !comparar(state,req.query.state) || Date.now()-Number(quando)>MAX_AGE ||
        Date.now()<Number(quando) || !/^[a-f0-9]{64}$/.test(state || '') || (usuarioId && Number(usuarioId)!==req.usuario?.id))
        throw Object.assign(new Error('Validação de segurança do login social falhou. Tente novamente.'), {status:403});
      if (req.query.error) throw Object.assign(new Error('Autenticação cancelada ou recusada pelo provedor.'),{status:400});
      if (typeof req.query.code !== 'string' || req.query.code.length > 2048) throw Object.assign(new Error('Código OAuth inválido.'),{status:400});
      const token = await client.getToken({code:req.query.code,redirect_uri:callback});
      const resposta = await fetch(c.perfil,{headers:{Authorization: `Bearer ${token.token.access_token}`,Accept:'application/json'},signal:AbortSignal.timeout(10000)});
      if (!resposta.ok) throw new Error('Falha ao verificar o perfil social.');
      const perfil = await resposta.json();
      const identificador = String(perfil.sub || perfil.id || '');
      if (!identificador || identificador.length > 190 || (provedor==='google' && perfil.email_verified !== true))
        throw Object.assign(new Error('O provedor não retornou uma conta verificada.'),{status:400});
      const id = await associar(provedor,identificador,perfil,req.usuario?.id);
      await sessao.entrar(req,res,id);
      res.redirect(303,/^\/[a-z]+\.html$/.test(proximo) ? proximo : '/seusdados.html');
    }
  };
};
