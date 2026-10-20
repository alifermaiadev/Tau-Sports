// Objetivo: Cria o hash de uma senha e verifica o hash no login.
// Senhas são armazenadas com scrypt + salt aleatório, nunca em texto puro.
const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const calcularHash = promisify(scrypt);
const configuracao = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

async function gerarHash(senha) {
  const salt = randomBytes(16).toString('hex');
  const hash = await calcularHash(senha, salt, 64, configuracao);

  // Guardamos o tipo, o salt e o hash na mesma coluna VARCHAR(255).
  return 'scrypt$' + salt + '$' + hash.toString('hex');
}

async function verificarSenha(senha, hashSalvo) {
  const [tipo, salt, hash] = String(hashSalvo || '').split('$');

  // Rejeita hashes com formato incorreto sem quebrar o login.
  if (tipo !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(hash || '')) {
    return false;
  }

  const calculado = await calcularHash(senha, salt, 64, configuracao);
  return timingSafeEqual(calculado, Buffer.from(hash, 'hex'));
}

module.exports = { gerarHash, verificarSenha };
