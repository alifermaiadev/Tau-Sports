'use strict';

const { spawnSync } = require('node:child_process');
const resultado = spawnSync(process.execPath, ['--test', 'tests/fluxos.test.js', 'tests/validacao.test.js'], {
  stdio: 'inherit', env: { ...process.env, TAU_TEST_MYSQL: '1' }
});
process.exitCode = resultado.status === null ? 1 : resultado.status;
