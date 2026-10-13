'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Lê o .env sem adicionar dependências; variáveis do sistema têm prioridade.
const arquivo = path.join(__dirname, '../../.env');
if (fs.existsSync(arquivo)) {
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const resultado = linha.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!resultado || process.env[resultado[1]] !== undefined) {
      continue;
    }
    let valor = resultado[2].trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    process.env[resultado[1]] = valor;
  }
}

module.exports = {
  banco: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'tau_sports',
    charset: 'utf8mb4',
    timezone: 'Z',
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true
  },
  porta: Number(process.env.PORT || 3000),
  producao: process.env.NODE_ENV === 'production',
  segredo: process.env.SESSION_SECRET,
  duracaoSessao: 8 * 60 * 60 * 1000
};
