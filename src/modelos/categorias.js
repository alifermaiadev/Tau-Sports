// Consultas SQL das categorias. Mantemos uma chave curta usada nos produtos.
module.exports = function criarCategorias(banco) {
  return {
    async listar() {
      const [linhas] = await banco.execute(
        'SELECT chave_categoria, nome_categoria FROM CATEGORIA ORDER BY nome_categoria'
      );

      // Ex.: { tenis: 'Tênis', camiseta: 'Camiseta' }
      const categorias = {};
      for (const linha of linhas) {
        categorias[linha.chave_categoria] = linha.nome_categoria;
      }
      return categorias;
    },

    async cadastrar(categoria) {
      await banco.execute(
        'INSERT INTO CATEGORIA (chave_categoria, nome_categoria) VALUES (?, ?)',
        [categoria.chave, categoria.nome]
      );
    }
  };
};
