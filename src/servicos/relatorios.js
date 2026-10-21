'use strict';
const fs = require('node:fs');
const path = require('node:path');
const origem = fs.readFileSync(path.join(__dirname, '../../database/consultas-relatorios.sql'), 'utf8');
const partes = origem.split(/-- relatorio: (categoria|marca|cliente|venda|enderecos)\s*\n/g);
const sql = Object.fromEntries(Array.from({ length: (partes.length - 1) / 2 }, (_, i) => [partes[i * 2 + 1], partes[i * 2 + 2].trim()]));
module.exports = banco => ({
  tipos: Object.keys(sql),
  async consultar(tipo) {
    if (!Object.hasOwn(sql, tipo)) throw Object.assign(new Error('Relatório não encontrado.'), { status: 404 });
    return (await banco.execute(sql[tipo]))[0];
  }
});
