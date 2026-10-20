'use strict';

const GOOGLE = {
  authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  profile: 'https://openidconnect.googleapis.com/v1/userinfo'
};

function configuracao(provedor, oauth) {
  const dados = oauth[provedor];
  if (!dados) return null;
  if (provedor === 'google' && dados.clientId && dados.clientSecret) return dados;
  if (provedor === 'facebook' && dados.appId && dados.appSecret && /^v\d+\.\d+$/.test(dados.graphVersion || '')) return dados;
  return null;
}

function uriRetorno(provedor, baseUrl) {
  return new URL(`/auth/${provedor}/callback`, baseUrl).toString();
}

function urlAutorizacao(provedor, oauth, baseUrl, state) {
  const dados = configuracao(provedor, oauth);
  if (!dados) return null;
  const destino = provedor === 'google'
    ? new URL(GOOGLE.authorization)
    : new URL(`https://www.facebook.com/${dados.graphVersion}/dialog/oauth`);
  destino.search = new URLSearchParams({
    client_id: provedor === 'google' ? dados.clientId : dados.appId,
    redirect_uri: uriRetorno(provedor, baseUrl),
    response_type: 'code',
    scope: provedor === 'google' ? 'openid email profile' : 'email,public_profile',
    state
  }).toString();
  if (provedor === 'google') destino.searchParams.set('prompt', 'select_account');
  return destino.toString();
}

async function jsonDaResposta(url, opcoes, codigo) {
  let resposta;
  try {
    resposta = await fetch(url, { ...opcoes, signal: AbortSignal.timeout(10000) });
  } catch {
    throw new Error(codigo);
  }
  let dados;
  try {
    dados = await resposta.json();
  } catch {
    throw new Error(codigo);
  }
  if (!resposta.ok || !dados || typeof dados !== 'object') {
    throw new Error(codigo);
  }
  return dados;
}

async function obterPerfil(provedor, codigo, oauth, baseUrl) {
  const dados = configuracao(provedor, oauth);
  if (!dados || typeof codigo !== 'string' || codigo.length > 4096) {
    throw new Error('oauth_indisponivel');
  }
  const retorno = uriRetorno(provedor, baseUrl);

  if (provedor === 'google') {
    const tokens = await jsonDaResposta(GOOGLE.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: codigo,
        client_id: dados.clientId,
        client_secret: dados.clientSecret,
        redirect_uri: retorno,
        grant_type: 'authorization_code'
      })
    }, 'oauth_google_falhou');
    if (typeof tokens.access_token !== 'string' || tokens.access_token.length > 8192) {
      throw new Error('oauth_google_falhou');
    }
    const perfil = await jsonDaResposta(GOOGLE.profile, {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    }, 'oauth_google_falhou');
    if (typeof perfil.sub !== 'string' || !perfil.sub || perfil.email_verified !== true) {
      throw new Error('oauth_google_email_nao_verificado');
    }
    return {
      id: perfil.sub,
      email: typeof perfil.email === 'string' ? perfil.email.trim().toLowerCase() : '',
      nome: typeof perfil.name === 'string' ? perfil.name.trim() : ''
    };
  }

  const versao = dados.graphVersion;
  const tokenUrl = new URL(`https://graph.facebook.com/${versao}/oauth/access_token`);
  tokenUrl.search = new URLSearchParams({
    client_id: dados.appId,
    client_secret: dados.appSecret,
    code: codigo,
    redirect_uri: retorno
  }).toString();
  const tokens = await jsonDaResposta(tokenUrl, {}, 'oauth_facebook_falhou');
  if (typeof tokens.access_token !== 'string' || tokens.access_token.length > 8192) {
    throw new Error('oauth_facebook_falhou');
  }
  const perfilUrl = new URL(`https://graph.facebook.com/${versao}/me`);
  perfilUrl.searchParams.set('fields', 'id,name,email');
  const perfil = await jsonDaResposta(perfilUrl, {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  }, 'oauth_facebook_falhou');
  if ((typeof perfil.id !== 'string' && typeof perfil.id !== 'number') || !String(perfil.id)) {
    throw new Error('oauth_facebook_falhou');
  }
  return {
    id: String(perfil.id),
    email: typeof perfil.email === 'string' ? perfil.email.trim().toLowerCase() : '',
    nome: typeof perfil.name === 'string' ? perfil.name.trim() : ''
  };
}

module.exports = { configuracao, urlAutorizacao, obterPerfil };
