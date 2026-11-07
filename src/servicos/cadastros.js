'use strict';
const { texto } = require('../validacao');
const { CATEGORIAS, GENEROS } = require('../validacao');
const slug = valor => texto(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
module.exports = banco => ({
  async opcoes() {
    const [[categorias], [marcas], [generos]] = await Promise.all([
      banco.execute('SELECT chave_categoria AS slug, nome_categoria AS nome FROM CATEGORIA ORDER BY nome_categoria'),
      banco.execute('SELECT nome FROM MARCA ORDER BY nome'),
      banco.execute('SELECT slug, nome FROM GENERO ORDER BY nome')
    ]);
    return { categorias: Object.fromEntries(categorias.map(c => [c.slug, c.nome])),
      marcas: marcas.map(m => m.nome), generos: Object.fromEntries(generos.map(g => [g.slug, g.nome])) };
  },
  async cadastrar(tipo, nome) {
    nome = texto(nome);
    if (!['categoria', 'marca', 'genero'].includes(tipo) || nome.length < 2 || nome.length > (tipo === 'genero' ? 60 : 50))
      throw Object.assign(new Error('Informe um nome válido de 2 a 60 caracteres.'), { status: 400 });
    if (tipo === 'marca') return banco.execute('INSERT INTO MARCA (nome) VALUES (?)', [nome]);
    const valor = slug(nome);
    if (!valor) throw Object.assign(new Error('Nome inválido.'), { status: 400 });
    return tipo === 'categoria'
      ? banco.execute('INSERT INTO CATEGORIA (chave_categoria,nome_categoria) VALUES (?, ?)', [valor,nome])
      : banco.execute('INSERT INTO GENERO (slug,nome) VALUES (?, ?)', [valor,nome]);
  }
});
