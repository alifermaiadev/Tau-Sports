'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { gerarHash, verificarSenha } = require('../src/seguranca/senhas');
const { validarProduto } = require('../src/validacao');

const dados = { nome: 'Camisa de treino', marca: 'Taú', categoria: 'camiseta', genero: 'masculino', preco: '89,90', imagens: '/imagensUCE/camisaAlemanha.png', tamanhos: 'P, M, G', cores: 'Preto', descricao: 'Camisa confortável para atividades esportivas.' };

test('hash usa salt distinto e aceita somente a senha correta', async () => {
  const primeiro = await gerarHash('Senha123!');
  const segundo = await gerarHash('Senha123!');
  assert.notEqual(primeiro, segundo);
  assert.equal(await verificarSenha('Senha123!', primeiro), true);
  assert.equal(await verificarSenha('SenhaErrada!', primeiro), false);
  assert.equal(await verificarSenha('Senha123!', 'texto-sem-hash'), false);
});
test('aceita vírgula decimal e aplica limites padrão', () => {
  const { erros, produto } = validarProduto(dados);
  assert.deepEqual(erros, []);
  assert.equal(produto.preco, 89.9);
  assert.equal(produto.parcelas, 1);
  assert.equal(produto.descontoPix, 0);
  assert.equal(produto.precoDe, null);
  assert.deepEqual(produto.tags, ['novidade']);
});
test('rejeita imagem com javascript, arquivo ausente e traversal', () => {
  for (const imagens of ['javascript:alert(1)', '/imagensUCE/inexistente.png', '/imagensUCE/../../server.js', '/imagensUCE/..%2F..%2Fserver.js']) {
    assert.ok(validarProduto({ ...dados, imagens }).erros.length > 0, imagens);
  }
});
test('rejeita valores e categorias fora da regra', () => {
  for (const alteracao of [{ preco: '0' }, { preco: '-1' }, { preco: '1.999' }, { preco: 'Infinity' }, { descontoPix: '100' }, { parcelas: '11' }, { parcelas: '1.5' }, { precoDe: '10' }, { categoria: 'invalida' }, { genero: 'invalido' }, { tamanhos: '' }, { cores: '' }]) {
    assert.ok(validarProduto({ ...dados, ...alteracao }).erros.length > 0, JSON.stringify(alteracao));
  }
});
