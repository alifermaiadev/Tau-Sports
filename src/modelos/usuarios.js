// Objetivo: Consulta e salva usuários no banco MySQL.
'use strict';

module.exports = function criarUsuarios(banco) {
  return {
    async porEmail(email) {
      const [linhas] = await banco.execute(
        `SELECT id_usuario AS id, nome_usuario AS nome, email_usuario AS email,
                senha_usuario AS senha_hash, COALESCE(ies_admin, 'N') AS ies_admin
         FROM USUARIO WHERE email_usuario = ? AND ativo = 1 LIMIT 1`, [email]
      );
      return linhas[0] || null;
    },
    async cadastrar({ nome, email, senhaHash, cpf, telefone }) {
      // A rota pública nunca pode escolher administrador.
      const [resultado] = await banco.execute(
        `INSERT INTO USUARIO
         (nome_usuario, email_usuario, senha_usuario, cpf_usuario, telefone_usuario, ativo, ies_admin)
         VALUES (?, ?, ?, ?, ?, 1, 'N')`,
        [nome, email, senhaHash, cpf, telefone]
      );
      return resultado.insertId;
    },
    async cadastrarAdmin({ nome, email, senhaHash, cpf, telefone }) {
      // Somente a rota protegida por ADMIN chama este método.
      const [resultado] = await banco.execute(
        `INSERT INTO USUARIO
         (nome_usuario, email_usuario, senha_usuario, cpf_usuario, telefone_usuario, ativo, ies_admin)
         VALUES (?, ?, ?, ?, ?, 1, 'S')`,
        [nome, email, senhaHash, cpf, telefone]
      );
      return resultado.insertId;
    },
    async promoverAdmin(usuarioId) {
      await banco.execute("UPDATE USUARIO SET ies_admin = 'S' WHERE id_usuario = ?", [usuarioId]);
    }
  };
};
