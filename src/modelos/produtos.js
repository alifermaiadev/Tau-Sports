'use strict';

function lerJson(valor) {
  return typeof valor === 'string' ? JSON.parse(valor) : valor;
}

module.exports = function criarProdutos(banco) {
  return {
    async listar() {
      const [linhas] = await banco.execute('SELECT * FROM produtos ORDER BY criado_em DESC, id ASC');
      return linhas.map(linha => ({
        id: linha.id, nome: linha.nome, marca: linha.marca, categoria: linha.categoria, genero: linha.genero,
        preco: Number(linha.preco), precoDe: linha.preco_de === null ? null : Number(linha.preco_de),
        descontoPix: linha.desconto_pix, parcelas: linha.parcelas, descricao: linha.descricao,
        imagens: lerJson(linha.imagens), tamanhos: lerJson(linha.tamanhos), cores: lerJson(linha.cores),
        tags: lerJson(linha.tags), detalhes: lerJson(linha.detalhes)
      }));
    },
    async cadastrar(produto, usuarioId) {
      await banco.execute(
        `INSERT INTO produtos
         (id, nome, marca, categoria, genero, preco, preco_de, desconto_pix, parcelas, descricao,
          imagens, tamanhos, cores, tags, detalhes, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [produto.id, produto.nome, produto.marca, produto.categoria, produto.genero, produto.preco,
          produto.precoDe, produto.descontoPix, produto.parcelas, produto.descricao,
          JSON.stringify(produto.imagens), JSON.stringify(produto.tamanhos), JSON.stringify(produto.cores),
          JSON.stringify(produto.tags), JSON.stringify(produto.detalhes), usuarioId]
      );
    }
  };
};
