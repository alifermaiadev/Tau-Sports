'use strict';

// Substituto do banco apenas para testar o fluxo HTTP sem um servidor MySQL.
// npm run test:mysql usa as mesmas rotas e modelos com um banco MySQL real.
module.exports = function criarBancoMemoria() {
  const usuarios = [], sessoes = [], produtos = [];
  return {
    async execute(sql, valores = []) {
      const consulta = sql.replace(/\s+/g, ' ').trim();
      if (consulta.startsWith('SELECT id, nome, email, senha_hash, perfil FROM usuarios')) {
        return [usuarios.filter(usuario => usuario.email === valores[0])];
      }
      if (consulta.startsWith('INSERT INTO usuarios')) {
        if (usuarios.some(usuario => usuario.email === valores[1])) {
          const erro = new Error('E-mail duplicado');
          erro.code = 'ER_DUP_ENTRY';
          throw erro;
        }
        const usuario = { id: usuarios.length + 1, nome: valores[0], email: valores[1], senha_hash: valores[2], perfil: valores[3] };
        usuarios.push(usuario);
        return [{ insertId: usuario.id }];
      }
      if (consulta.startsWith('SELECT u.id, u.nome, u.email, u.perfil FROM sessoes')) {
        const sessao = sessoes.find(item => item.token_hash === valores[0] && item.expira_em > new Date());
        const usuario = sessao && usuarios.find(item => item.id === sessao.usuario_id);
        return [usuario ? [{ id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil }] : []];
      }
      if (consulta.startsWith('INSERT INTO sessoes')) {
        sessoes.push({ token_hash: valores[0], usuario_id: valores[1], expira_em: valores[2] });
        return [{ affectedRows: 1 }];
      }
      if (consulta.startsWith('DELETE FROM sessoes')) {
        for (let i = sessoes.length - 1; i >= 0; i--) {
          if (consulta.includes('token_hash = ?') ? sessoes[i].token_hash === valores[0] : sessoes[i].expira_em <= new Date()) {
            sessoes.splice(i, 1);
          }
        }
        return [{ affectedRows: 1 }];
      }
      if (consulta.startsWith('SELECT * FROM produtos')) {
        return [produtos.slice().reverse()];
      }
      if (consulta.startsWith('INSERT INTO produtos')) {
        const campos = ['id', 'nome', 'marca', 'categoria', 'genero', 'preco', 'preco_de', 'desconto_pix', 'parcelas', 'descricao', 'imagens', 'tamanhos', 'cores', 'tags', 'detalhes', 'criado_por'];
        produtos.push(Object.fromEntries(campos.map((campo, i) => [campo, valores[i]])));
        return [{ affectedRows: 1 }];
      }
      if (consulta.startsWith('UPDATE usuarios SET perfil')) {
        usuarios.find(usuario => usuario.id === valores[1]).perfil = valores[0];
        return [{ affectedRows: 1 }];
      }
      if (consulta.startsWith('UPDATE sessoes SET expira_em')) {
        for (const sessao of sessoes.filter(item => item.usuario_id === valores[0])) {
          sessao.expira_em = new Date(0);
        }
        return [{ affectedRows: 1 }];
      }
      throw new Error('Consulta não prevista no substituto de testes: ' + consulta);
    },
    async end() {}
  };
};
