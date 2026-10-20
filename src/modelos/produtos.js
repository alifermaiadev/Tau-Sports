// Objetivo: Consulta e salva os produtos no banco MySQL.
'use strict';

function lerJson(valor, padrao) {
  if (valor === undefined || valor === null) {
    return padrao;
  }
  if (Buffer.isBuffer(valor)) {
    valor = valor.toString('utf8');
  }
  try {
    return typeof valor === 'string' ? JSON.parse(valor) : valor;
  } catch {
    return padrao;
  }
}

module.exports = function criarProdutos(banco) {
  return {
    async listar() {
      const [linhas] = await banco.execute(
        `SELECT p.id_produto, p.nome_produto, p.descricao_produto, p.preco_produto,
                p.categoria_esporte, p.marca_produto, p.tamanho_produto,
                d.id_catalogo, d.genero, d.preco_de, d.desconto_pix, d.parcelas,
                d.imagens, d.tamanhos, d.cores, d.tags, d.detalhes
         FROM PRODUTO p LEFT JOIN PRODUTO_DETALHE d ON d.id_produto = p.id_produto
         ORDER BY p.id_produto DESC`
      );
      return linhas.map(linha => {
        const imagens = lerJson(linha.imagens, ['/imagensUCE/acessorio.svg']);
        return {
          id: linha.id_catalogo || String(linha.id_produto),
          nome: linha.nome_produto,
          marca: linha.marca_produto || 'Sem marca',
          categoria: linha.categoria_esporte,
          genero: linha.genero || 'unissex',
          preco: Number(linha.preco_produto),
          precoDe: linha.preco_de == null ? null : Number(linha.preco_de),
          descontoPix: linha.desconto_pix || 0,
          parcelas: linha.parcelas || 1,
          descricao: linha.descricao_produto || 'Produto esportivo',
          imagens, tamanhos: lerJson(linha.tamanhos, [linha.tamanho_produto]),
          cores: lerJson(linha.cores, [{ nome: 'Padrão', imagem: imagens[0] }]),
          tags: lerJson(linha.tags, ['novidade']),
          detalhes: lerJson(linha.detalhes, [])
        };
      });
    },
    async cadastrar(produto, usuarioId) {
      // Ambos os INSERTs formam uma única transação: não fica produto incompleto.
      const conexao = await banco.getConnection();
      try {
        await conexao.beginTransaction();
        const [resultado] = await conexao.execute(
          `INSERT INTO PRODUTO
           (nome_produto, descricao_produto, preco_produto, categoria_esporte, marca_produto, tamanho_produto)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [produto.nome, produto.descricao, produto.preco, produto.categoria, produto.marca, produto.tamanhos[0]]
        );
        await conexao.execute(
          `INSERT INTO PRODUTO_DETALHE
           (id_produto, id_catalogo, genero, preco_de, desconto_pix, parcelas,
            imagens, tamanhos, cores, tags, detalhes, criado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [resultado.insertId, produto.id, produto.genero, produto.precoDe, produto.descontoPix,
            produto.parcelas, JSON.stringify(produto.imagens), JSON.stringify(produto.tamanhos),
            JSON.stringify(produto.cores), JSON.stringify(produto.tags),
            JSON.stringify(produto.detalhes), usuarioId]
        );
        await conexao.commit();
        return resultado.insertId;
      } catch (erro) {
        await conexao.rollback();
        throw erro;
      } finally {
        conexao.release();
      }
    }
  };
};
