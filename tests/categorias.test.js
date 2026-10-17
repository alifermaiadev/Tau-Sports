'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const criarBancoMemoria = require('./banco-memoria');
const criarCategorias = require('../src/modelos/categorias');

test('categorias originais continuam disponíveis', async () => {
  const categorias = criarCategorias(criarBancoMemoria());
  const lista = await categorias.listar();
  assert.equal(lista.tenis, 'Tênis');
  assert.equal(lista.camiseta, 'Camiseta');
  assert.equal(Object.keys(lista).length, 7);
});

test('categoria nova é salva e duplicada é rejeitada', async () => {
  const categorias = criarCategorias(criarBancoMemoria());
  await categorias.cadastrar({ chave: 'basquete', nome: 'Basquete' });
  assert.equal((await categorias.listar()).basquete, 'Basquete');
  await assert.rejects(categorias.cadastrar({ chave: 'basquete', nome: 'Basquete' }), {
    code: 'ER_DUP_ENTRY'
  });
});
