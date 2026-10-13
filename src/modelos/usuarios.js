'use strict';

module.exports = function criarUsuarios(banco) {
  return {
    async porEmail(email) {
      const [linhas] = await banco.execute('SELECT id, nome, email, senha_hash, ies_admin FROM usuarios WHERE email = ?', [email]);
      return linhas[0] || null;
    },
    async cadastrar({ nome, email, senhaHash, ies_admin = 'N' }) {
      const [resultado] = await banco.execute(
        'INSERT INTO usuarios (nome, email, senha_hash, ies_admin) VALUES (?, ?, ?, ?)',
        [nome, email, senhaHash, ies_admin]
      );
      return resultado.insertId;
    }
  };
};
