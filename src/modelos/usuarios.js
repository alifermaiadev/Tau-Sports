'use strict';

module.exports = function criarUsuarios(banco) {
  return {
    async porEmail(email) {
      const [linhas] = await banco.execute(
        `SELECT id_usuario AS id, nome_usuario AS nome, email_usuario AS email,
                senha_usuario AS senha_hash,
                CAST(COALESCE(CAST(ies_admin AS BINARY), X'4E') AS CHAR CHARACTER SET utf8mb4) AS ies_admin
         FROM USUARIO WHERE email_usuario = ? AND ativo = 1 LIMIT 1`, [email]
      );
      return linhas[0] || null;
    },
    async porIdentidadeSocial(provedor, idProvedor) {
      const [linhas] = await banco.execute(
        `SELECT u.id_usuario AS id, u.nome_usuario AS nome, u.email_usuario AS email,
                CAST(COALESCE(CAST(u.ies_admin AS BINARY), X'4E') AS CHAR CHARACTER SET utf8mb4) AS ies_admin,
                u.ativo
         FROM IDENTIDADES_SOCIAIS i
         INNER JOIN USUARIO u ON u.id_usuario = i.id_usuario
         WHERE i.provedor = ? AND i.id_provedor = ? LIMIT 1`, [provedor, idProvedor]
      );
      return linhas[0] || null;
    },
    async provedoresVinculados(usuarioId) {
      const [linhas] = await banco.execute(
        'SELECT provedor FROM IDENTIDADES_SOCIAIS WHERE id_usuario = ?', [usuarioId]
      );
      return linhas.map(linha => linha.provedor);
    },
    async cadastrarSocial({ nome, email, senhaHash, cpf, telefone, provedor, idProvedor }) {
      const conexao = await banco.getConnection();
      try {
        await conexao.beginTransaction();
        const [resultado] = await conexao.execute(
          `INSERT INTO USUARIO
           (nome_usuario, email_usuario, senha_usuario, cpf_usuario, telefone_usuario, ativo, ies_admin)
           VALUES (?, ?, ?, ?, ?, 1, 'N')`,
          [nome, email, senhaHash, cpf, telefone]
        );
        await conexao.execute(
          `INSERT INTO IDENTIDADES_SOCIAIS (id_usuario, provedor, id_provedor, email_provedor)
           VALUES (?, ?, ?, ?)`, [resultado.insertId, provedor, idProvedor, email]
        );
        await conexao.commit();
        return resultado.insertId;
      } catch (erro) {
        await conexao.rollback();
        throw erro;
      } finally {
        conexao.release();
      }
    },
    async vincularIdentidadeSocial({ usuarioId, provedor, idProvedor, email }) {
      await banco.execute(
        `INSERT INTO IDENTIDADES_SOCIAIS (id_usuario, provedor, id_provedor, email_provedor)
         VALUES (?, ?, ?, ?)`, [usuarioId, provedor, idProvedor, email || null]
      );
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
    async promoverAdmin(usuarioId) {
      await banco.execute("UPDATE USUARIO SET ies_admin = 'S' WHERE id_usuario = ?", [usuarioId]);
    }
  };
};
