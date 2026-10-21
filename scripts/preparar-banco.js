'use strict';

const fs = require('node:fs');
const path = require('node:path');
const banco = require('../src/config/banco');
const produtos = require('../src/modelos/produtos')(banco);
const catalogo = require('../src/dados/catalogo-inicial.json');

async function preparar() {
  // CREATE TABLE IF NOT EXISTS: não apaga nem substitui registros já cadastrados.
  const schema = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
  for (const comando of schema.split(';').map(valor => valor.trim()).filter(Boolean)) {
    await banco.query(comando);
  }
  // Migração aditiva; executada também em bancos já povoados.
  const migracao = fs.readFileSync(path.join(__dirname, '../database/migracao-2026.sql'), 'utf8');
  for (const comando of migracao.split(';').map(valor => valor.trim()).filter(Boolean)) await banco.query(comando);
  const [colunasTipo] = await banco.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='PRODUTO_DETALHE' AND COLUMN_NAME='tipo_produto'");
  if (!colunasTipo.length) {
    await banco.query("ALTER TABLE PRODUTO_DETALHE ADD COLUMN tipo_produto VARCHAR(10) NOT NULL DEFAULT 'outro'");
    // Somente no upgrade de bancos antigos, inferir tipo inicial sem sobrescrever escolhas futuras.
    await banco.query("UPDATE PRODUTO_DETALHE d JOIN PRODUTO p ON p.id_produto=d.id_produto SET d.tipo_produto=CASE WHEN p.categoria_esporte IN ('tenis','chuteira') THEN 'calcado' WHEN p.categoria_esporte IN ('camiseta','shorts','bone') THEN 'roupa' ELSE 'outro' END");
  }
  // Conserva categorias pré-existentes e seus slugs originais.
  const { CATEGORIAS, GENEROS } = require('../src/validacao');
  for (const [slug, nome] of Object.entries(CATEGORIAS)) await banco.execute('INSERT IGNORE INTO CATEGORIA (slug,nome) VALUES (?,?)', [slug,nome]);
  for (const [slug, nome] of Object.entries(GENEROS)) await banco.execute('INSERT IGNORE INTO GENERO (slug,nome) VALUES (?,?)', [slug,nome]);
  await banco.query("INSERT IGNORE INTO CATEGORIA (slug,nome) SELECT DISTINCT categoria_esporte,categoria_esporte FROM PRODUTO WHERE categoria_esporte <> ''");
  await banco.query("INSERT IGNORE INTO MARCA (nome) SELECT DISTINCT marca_produto FROM PRODUTO WHERE marca_produto IS NOT NULL AND marca_produto <> ''");
  await banco.query("INSERT IGNORE INTO GENERO (slug,nome) SELECT DISTINCT genero,genero FROM PRODUTO_DETALHE WHERE genero <> ''");
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
      await produtos.cadastrar({ ...produto, tipo: produto.tipo || (['tenis','chuteira'].includes(produto.categoria) ? 'calcado' : ['camiseta','shorts','bone'].includes(produto.categoria) ? 'roupa' : 'outro') }, null);
      importados++;
    }
  }
  await banco.query("INSERT IGNORE INTO MARCA (nome) SELECT DISTINCT marca_produto FROM PRODUTO WHERE marca_produto IS NOT NULL AND marca_produto <> ''");
  console.log('Banco preparado. Produtos de demonstração inseridos: ' + importados + '. Dados existentes preservados.');
}

preparar().catch(erro => {
  console.error('Falha ao preparar banco:', erro.code || erro.message);
  console.error('Verifique DB_NAME, credenciais do .env e privilégios CREATE/ALTER do MySQL.');
  process.exitCode = 1;
}).finally(() => banco.end());
