'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const criarBancoMemoria = require('./banco-memoria');
const criarUsuarios = require('../src/modelos/usuarios');
const { gerarHash, verificarSenha } = require('../src/seguranca/senhas');

test('cadastro público cria usuário comum; cadastro administrativo cria ADMIN com hash', async () => {
  const banco = criarBancoMemoria();
  const usuarios = criarUsuarios(banco);
  const senha = 'SenhaDeTeste123!';
  const hashComum = await gerarHash(senha);
  const hashAdmin = await gerarHash(senha);

  await usuarios.cadastrar({
    nome: 'Cliente', email: 'cliente@teste.com', senhaHash: hashComum,
    cpf: '12345678901', telefone: '11999999999'
  });
  await usuarios.cadastrarAdmin({
    nome: 'Novo Admin', email: 'admin@teste.com', senhaHash: hashAdmin,
    cpf: '12345678902', telefone: '11999999998'
  });

  const cliente = await usuarios.porEmail('cliente@teste.com');
  const admin = await usuarios.porEmail('admin@teste.com');
  assert.equal(cliente.ies_admin, 'N');
  assert.equal(admin.ies_admin, 'S');
  assert.notEqual(admin.senha_hash, senha);
  assert.notEqual(admin.senha_hash, cliente.senha_hash);
  assert.equal(await verificarSenha(senha, admin.senha_hash), true);
  assert.equal(await verificarSenha('SenhaErrada123!', admin.senha_hash), false);

  await assert.rejects(() => usuarios.cadastrarAdmin({
    nome: 'Duplicado', email: 'cliente@teste.com', senhaHash: hashAdmin,
    cpf: '12345678903', telefone: '11999999997'
  }), erro => erro.code === 'ER_DUP_ENTRY');
  assert.equal((await usuarios.porEmail('cliente@teste.com')).ies_admin, 'N');
  await banco.end();
});
