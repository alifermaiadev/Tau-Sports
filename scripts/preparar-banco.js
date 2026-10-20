'use strict';

const fs = require('node:fs');
const path = require('node:path');
const banco = require('../src/config/banco');
const produtos = require('../src/modelos/produtos')(banco);
const catalogo = require('../src/dados/catalogo-inicial.json');

async function preparar() {
  // CREATE TABLE IF NOT EXISTS: não apaga nem substitui registros já cadastrados.
  const schema = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
  const comandos = schema.split(';').map(valor => valor.trim()).filter(Boolean)
    // A conexão já usa DB_NAME; não troque para tau_sports se foi configurado outro banco.
    .filter(comando => !/^(?:CREATE\s+DATABASE|USE\s+)/i.test(comando));
  for (const comando of comandos) {
    await banco.query(comando);
  }
  const [colunas] = await banco.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'USUARIO' AND COLUMN_NAME = 'ies_admin'`
  );
  if (!colunas.length) {
    await banco.query("ALTER TABLE USUARIO ADD COLUMN ies_admin CHAR(1) NOT NULL DEFAULT 'N'");
  }
  await banco.execute("UPDATE USUARIO SET ies_admin = 'N' WHERE ies_admin IS NULL");
  await banco.query("ALTER TABLE USUARIO MODIFY COLUMN ies_admin CHAR(1) NOT NULL DEFAULT 'N'");
  const existentes = new Set((await produtos.listar()).map(produto => produto.id));
  let importados = 0;
  for (const produto of catalogo) {
    if (!existentes.has(produto.id)) {
      await produtos.cadastrar(produto, null);
      importados++;
    }
  }
  console.log('Banco preparado. Produtos de demonstração inseridos: ' + importados + '. Dados existentes preservados.');
}

preparar().catch(erro => {
  console.error('Falha ao preparar banco:', erro.code || erro.message);
  console.error('Verifique DB_NAME, credenciais do .env e privilégios CREATE/ALTER do MySQL.');
  process.exitCode = 1;
}).finally(() => banco.end());
