// Testes da validação de senha, aplicada a cliente, ADMIN e terminal.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analisarSenha, senhaValida, validarDadosUsuario } = require('../src/validacao');

const base = {
  nome: 'Cliente Teste',
  email: 'cliente@tau.test',
  cpf: '12345678901',
  telefone: '11999999999',
  senha: 'SenhaSegura123!',
  confirmarSenha: 'SenhaSegura123!'
};

test('senha precisa conter todos os cinco requisitos', () => {
  const invalidas = [
    'Ab1!',               // muito curta
    'senha1234!',         // sem maiúscula
    'SENHA1234!',         // sem minúscula
    'SenhaForte!',        // sem número
    'SenhaForte123',      // sem especial
    'Senha com 123',      // espaço não é especial
    'A1!'.repeat(45)      // acima de 128 caracteres
  ];

  for (const senha of invalidas) {
    assert.equal(senhaValida(senha), false, senha);
    assert.equal(analisarSenha(senha).nivel, 'Fraca', senha);
  }
});

test('classifica senha fraca, média e forte', () => {
  assert.equal(analisarSenha('abc').nivel, 'Fraca');
  assert.equal(analisarSenha('Abc1234!').nivel, 'Média');
  assert.equal(analisarSenha('Abcdefgh1234!').nivel, 'Forte');
  assert.equal(senhaValida('Abc1234!'), true);
  assert.equal(senhaValida('Abcdefgh1234!'), true);
});

test('cadastro valida os dados uma única vez para cliente e ADMIN', () => {
  assert.deepEqual(validarDadosUsuario(base).erros, []);

  const fraca = validarDadosUsuario({ ...base, senha: '12345678', confirmarSenha: '12345678' });
  assert.ok(fraca.erros.some(erro => erro.includes('maiúscula')));

  const diferente = validarDadosUsuario({ ...base, confirmarSenha: 'OutraSenha12!' });
  assert.ok(diferente.erros.some(erro => erro.includes('confirmação')));

  const dados = validarDadosUsuario({ ...base, cpf: '123.456.789-01', telefone: '(11) 99999-9999' });
  assert.deepEqual(dados.erros, []);
  assert.equal(dados.dados.cpf, '12345678901');
  assert.equal(dados.dados.telefone, '11999999999');
});
