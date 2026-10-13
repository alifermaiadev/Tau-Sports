'use strict';

module.exports = function criarUsuarios(banco) {
  return {
    async porEmail(email) {
      const [linhas] = await banco.execute('SELECT id, nome, email, senha_hash, perfil FROM usuarios WHERE email = ?', [email]);
      return linhas[0] || null;
    },
    async cadastrar({ nome, email, senhaHash, perfil = 'CLIENTE' }) {
      const [resultado] = await banco.execute(
        'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)',
        [nome, email, senhaHash, perfil]
      );
      return resultado.insertId;
    }
  };
};
