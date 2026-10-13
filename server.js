'use strict';

const ambiente = require('./src/config/ambiente');
const banco = require('./src/config/banco');
const criarApp = require('./src/app');

async function iniciar() {
  const app = criarApp({ banco, segredo: ambiente.segredo });
  // Verifica conexão e tabelas antes de aceitar requisições.
  await banco.execute('SELECT id FROM usuarios LIMIT 1');
  await banco.execute('SELECT id FROM produtos LIMIT 1');
  await banco.execute('SELECT token_hash FROM sessoes LIMIT 1');
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
