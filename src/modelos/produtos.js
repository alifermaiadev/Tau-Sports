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
                d.id_catalogo, d.genero, d.tipo_produto, d.preco_de, d.desconto_pix, d.parcelas,
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
          tipo: linha.tipo_produto || (/^(tenis|chuteira)$/.test(linha.categoria_esporte) ? 'calcado' : /^(camiseta|shorts|bone)$/.test(linha.categoria_esporte) ? 'roupa' : 'outro'),
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
    async buscarPorId(id) {
      const catalogo = await this.listar();
      return catalogo.find(p => p.id === id) || null;
    },
    async atualizar(id, produto) {
      const conexao = await banco.getConnection();
      try {
        await conexao.beginTransaction();
        const [linhas] = await conexao.execute(`SELECT p.id_produto FROM PRODUTO p
          LEFT JOIN PRODUTO_DETALHE d ON d.id_produto=p.id_produto
          WHERE COALESCE(d.id_catalogo, CAST(p.id_produto AS CHAR))=? FOR UPDATE`, [id]);
        if (!linhas.length) throw Object.assign(new Error('Produto não encontrado.'), { status: 404 });
        const numero = linhas[0].id_produto;
        await conexao.execute(`UPDATE PRODUTO SET nome_produto=?, descricao_produto=?, preco_produto=?,
          categoria_esporte=?, marca_produto=?, tamanho_produto=? WHERE id_produto=?`,
          [produto.nome, produto.descricao, produto.preco, produto.categoria, produto.marca, produto.tamanhos[0], numero]);
        await conexao.execute(`INSERT INTO PRODUTO_DETALHE
          (id_produto,id_catalogo,genero,tipo_produto,preco_de,desconto_pix,parcelas,imagens,tamanhos,cores,tags,detalhes)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE
          genero=VALUES(genero),tipo_produto=VALUES(tipo_produto),preco_de=VALUES(preco_de),
          desconto_pix=VALUES(desconto_pix),parcelas=VALUES(parcelas),imagens=VALUES(imagens),
          tamanhos=VALUES(tamanhos),cores=VALUES(cores),tags=VALUES(tags),detalhes=VALUES(detalhes)`,
          [numero, id, produto.genero, produto.tipo, produto.precoDe, produto.descontoPix, produto.parcelas,
            JSON.stringify(produto.imagens), JSON.stringify(produto.tamanhos), JSON.stringify(produto.cores),
            JSON.stringify(produto.tags), JSON.stringify(produto.detalhes)]);
        await conexao.commit();
      } catch (e) { await conexao.rollback(); throw e; }
      finally { conexao.release(); }
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
            imagens, tamanhos, cores, tags, detalhes, criado_por, tipo_produto)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [resultado.insertId, produto.id, produto.genero, produto.precoDe, produto.descontoPix,
            produto.parcelas, JSON.stringify(produto.imagens), JSON.stringify(produto.tamanhos),
            JSON.stringify(produto.cores), JSON.stringify(produto.tags),
            JSON.stringify(produto.detalhes), usuarioId, produto.tipo || 'outro']
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
