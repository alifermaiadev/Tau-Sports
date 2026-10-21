'use strict';

const ambiente = require('./src/config/ambiente');
const banco = require('./src/config/banco');
const criarApp = require('./src/app');

async function iniciar() {
  const app = criarApp({ banco, segredo: ambiente.segredo });
  // Verifica conexão e tabelas antes de aceitar requisições.
  await banco.execute('SELECT id_usuario FROM USUARIO LIMIT 1');
  await banco.execute('SELECT token_hash FROM SESSOES LIMIT 1');
  await banco.execute('SELECT id_produto FROM PRODUTO LIMIT 1');
  await banco.execute('SELECT id_produto, tipo_produto FROM PRODUTO_DETALHE LIMIT 1');
  for (const tabela of ['CATEGORIA','MARCA','GENERO','ENDERECO_USUARIO','CONTA_SOCIAL',
    'ITEM_PEDIDO_VARIANTE','PEDIDO_ENDERECO','SOLICITACAO_TROCA']) {
    await banco.query('SELECT 1 FROM `' + tabela + '` LIMIT 1');
  }
  const servidor = app.listen(ambiente.porta, () => {
    console.log('Taú Sports rodando em http://localhost:' + ambiente.porta);
  });
  for (const sinal of ['SIGINT', 'SIGTERM']) {
    process.on(sinal, () => servidor.close(async () => {
      await banco.end();
      process.exit(0);
    }));
  }
}

if (require.main === module) {
  iniciar().catch(async erro => {
    console.error('Não foi possível iniciar:', erro.message);
    console.error('Confira o .env e execute npm run banco:preparar.');
    await banco.end();
    process.exitCode = 1;
  });
}

module.exports = { iniciar };
