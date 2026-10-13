'use strict';

const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const derivarChave = promisify(scrypt);
const opcoes = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

async function gerarHash(senha) {
  const salt = randomBytes(16).toString('hex');
  const chave = await derivarChave(senha, salt, 64, opcoes);
  return `scrypt$${salt}$${chave.toString('hex')}`;
}

async function verificarSenha(senha, hash) {
  const partes = String(hash || '').split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt' || !/^[a-f0-9]{32}$/.test(partes[1]) || !/^[a-f0-9]{128}$/.test(partes[2])) {
    return false;
  }
  const chave = await derivarChave(senha, partes[1], 64, opcoes);
  return timingSafeEqual(chave, Buffer.from(partes[2], 'hex'));
}

module.exports = { gerarHash, verificarSenha };
