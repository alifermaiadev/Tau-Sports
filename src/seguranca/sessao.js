'use strict';

const { randomBytes, createHash, createHmac, timingSafeEqual } = require('node:crypto');
const ambiente = require('../config/ambiente');
const hashToken = token => createHash('sha256').update(token).digest('hex');

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(parte => {
    const posicao = parte.indexOf('=');
    return [parte.slice(0, posicao).trim(), parte.slice(posicao + 1).trim()];
  }));
}

module.exports = function criarSessao(banco, segredo) {
  if (!segredo || segredo.length < 32) {
    throw new Error('Configure SESSION_SECRET no .env com pelo menos 32 caracteres.');
  }
  const opcoesCookie = { httpOnly: true, sameSite: 'lax', secure: ambiente.producao, path: '/' };
  const assinar = valor => createHmac('sha256', segredo).update(valor).digest('hex');
  const comparar = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string') {
      return false;
    }
    const primeiro = Buffer.from(a), segundo = Buffer.from(b);
    return primeiro.length === segundo.length && timingSafeEqual(primeiro, segundo);
  };

  return {
    async carregar(req, res, next) {
      try {
        const valores = cookies(req);
        req.tokenSessao = /^[a-f0-9]{64}$/.test(valores.tau_sessao || '') ? valores.tau_sessao : null;
        req.usuario = null;
        if (req.tokenSessao) {
          const [linhas] = await banco.execute(
            `SELECT u.id, u.nome, u.email, u.ies_admin FROM sessoes s
             INNER JOIN usuarios u ON u.id = s.usuario_id
             WHERE s.token_hash = ? AND s.expira_em > UTC_TIMESTAMP()`, [hashToken(req.tokenSessao)]
          );
          req.usuario = linhas[0] || null;
          if (!req.usuario) {
            res.clearCookie('tau_sessao', opcoesCookie);
          }
        }
        let tokenCsrf = valores.tau_csrf || '';
        const [valor, assinatura] = tokenCsrf.split('.');
        if (!/^[a-f0-9]{64}$/.test(valor || '') || !comparar(assinar(valor || ''), assinatura)) {
          const novo = randomBytes(32).toString('hex');
          tokenCsrf = novo + '.' + assinar(novo);
          res.cookie('tau_csrf', tokenCsrf, opcoesCookie);
        }
        req.csrfToken = tokenCsrf;
        res.locals.usuario = req.usuario;
        res.locals.csrfToken = tokenCsrf;
        res.locals.erro = null;
        res.locals.valores = {};
        res.locals.proximo = '/seusdados.html';
        res.locals.contextoJson = JSON.stringify({ usuario: req.usuario, csrfToken: tokenCsrf, produtos: [] })
          .replace(/[<>&\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
        next();
      } catch (erro) {
        next(erro);
      }
    },
    verificarCsrf(req, res, next) {
      if (!comparar(req.body && req.body._csrf, req.csrfToken)) {
        return res.status(403).send('Formulário expirado ou inválido. Recarregue a página e tente novamente.');
      }
      next();
    },
    async entrar(req, res, usuarioId) {
      if (req.tokenSessao) {
        await banco.execute('DELETE FROM sessoes WHERE token_hash = ?', [hashToken(req.tokenSessao)]);
      }
      await banco.execute('DELETE FROM sessoes WHERE expira_em <= UTC_TIMESTAMP()');
      const token = randomBytes(32).toString('hex');
      await banco.execute('INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, ?)',
        [hashToken(token), usuarioId, new Date(Date.now() + ambiente.duracaoSessao)]);
      res.cookie('tau_sessao', token, { ...opcoesCookie, maxAge: ambiente.duracaoSessao });
    },
    async sair(req, res) {
      if (req.tokenSessao) {
        await banco.execute('DELETE FROM sessoes WHERE token_hash = ?', [hashToken(req.tokenSessao)]);
      }
      res.clearCookie('tau_sessao', opcoesCookie);
    }
  };
};
