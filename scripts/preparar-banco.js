'use strict';

const fs = require('node:fs');
const path = require('node:path');
const banco = require('../src/config/banco');
const produtos = require('../src/modelos/produtos')(banco);
const catalogo = require('../src/dados/catalogo-inicial.json');

async function preparar() {
  const schema = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
  for (const comando of schema.split(';').map(valor => valor.trim()).filter(Boolean)) {
    await banco.query(comando);
  }
  const existentes = new Set((await produtos.listar()).map(produto => produto.id));
  for (const produto of catalogo) {
    if (!existentes.has(produto.id)) {
      await produtos.cadastrar(produto, null);
    }
  }
  console.log('Tabelas preparadas e catálogo inicial importado. Dados existentes preservados.');
}

preparar().catch(erro => {
  console.error('Falha ao preparar banco:', erro.message);
  process.exitCode = 1;
}).finally(() => banco.end());
