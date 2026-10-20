'use strict';

// Simula as consultas utilizadas pelas rotas para testar HTTP sem MySQL.
module.exports = function criarBancoMemoria() {
  const usuarios = [], sessoes = [], produtos = [], detalhes = [], identidadesSociais = [];
  let idProduto = 0;
  const normalizar = sql => sql.replace(/\s+/g, ' ').trim();
  const api = {
    async execute(sql, valores = []) {
      const consulta = normalizar(sql);
      if (consulta.startsWith('SELECT id_usuario AS id, nome_usuario AS nome')) {
        return [usuarios.filter(u => u.email === valores[0] && u.ativo).map(u => ({ ...u }))];
      }
      if (consulta.startsWith('INSERT INTO USUARIO')) {
        if (usuarios.some(u => u.email === valores[1] || u.cpf === valores[3])) {
          const erro = new Error('Cadastro duplicado'); erro.code = 'ER_DUP_ENTRY'; throw erro;
        }
        const usuario = { id: usuarios.length + 1, nome: valores[0], email: valores[1], senha_hash: valores[2], cpf: valores[3], telefone: valores[4], ies_admin: 'N', ativo: true };
        usuarios.push(usuario);
        return [{ insertId: usuario.id }];
      }
      if (consulta.startsWith('SELECT provedor FROM IDENTIDADES_SOCIAIS')) {
        return [identidadesSociais.filter(i => i.id_usuario === valores[0]).map(i => ({ provedor: i.provedor }))];
      }
      if (consulta.includes('FROM IDENTIDADES_SOCIAIS i')) {
        const identidade = identidadesSociais.find(i => i.provedor === valores[0] && i.id_provedor === valores[1]);
        const usuario = identidade && usuarios.find(u => u.id === identidade.id_usuario);
        return [usuario ? [{ id: usuario.id, nome: usuario.nome, email: usuario.email, ies_admin: usuario.ies_admin, ativo: usuario.ativo }] : []];
      }
      if (consulta.startsWith('INSERT INTO IDENTIDADES_SOCIAIS')) {
        if (identidadesSociais.some(i => (i.provedor === valores[1] && i.id_provedor === valores[2]) || (i.id_usuario === valores[0] && i.provedor === valores[1]))) {
          const erro = new Error('Identidade social duplicada'); erro.code = 'ER_DUP_ENTRY'; throw erro;
        }
        identidadesSociais.push({ id_usuario: valores[0], provedor: valores[1], id_provedor: valores[2], email_provedor: valores[3] });
        return [{ affectedRows: 1 }];
      }
      if (consulta.startsWith('UPDATE USUARIO SET ies_admin')) {
        const usuario = usuarios.find(u => u.id === valores[valores.length - 1]);
        if (usuario) { usuario.ies_admin = consulta.includes("ies_admin = 'S'") ? 'S' : valores[0]; }
        return [{ affectedRows: usuario ? 1 : 0 }];
      }
      if (consulta.startsWith('SELECT u.id_usuario AS id')) {
        const sessao = sessoes.find(s => s.token_hash === valores[0] && s.expira_em > new Date());
        const u = sessao && usuarios.find(u => u.id === sessao.usuario_id && u.ativo);
        return [u ? [{ id: u.id, nome: u.nome, email: u.email, ies_admin: u.ies_admin }] : []];
      }
      if (consulta.startsWith('INSERT INTO SESSOES')) {
        sessoes.push({ token_hash: valores[0], usuario_id: valores[1], expira_em: valores[2] });
        return [{ affectedRows: 1 }];
      }
      if (consulta.startsWith('DELETE FROM SESSOES')) {
        for (let i = sessoes.length - 1; i >= 0; i--) {
          if (consulta.includes('token_hash = ?') ? sessoes[i].token_hash === valores[0] : sessoes[i].expira_em <= new Date()) {
            sessoes.splice(i, 1);
          }
        }
        return [{ affectedRows: 1 }];
      }
      if (consulta.startsWith('UPDATE SESSOES SET expira_em')) {
        for (const s of sessoes.filter(s => s.usuario_id === valores[0])) { s.expira_em = new Date(0); }
        return [{ affectedRows: 1 }];
      }
      if (consulta.startsWith('SELECT p.id_produto, p.nome_produto')) {
        return [produtos.slice().reverse().map(p => ({ ...p, ...(detalhes.find(d => d.id_produto === p.id_produto) || {}) }))];
      }
      if (consulta.startsWith('INSERT INTO PRODUTO ')) {
        const id_produto = ++idProduto;
        const campos = ['nome_produto','descricao_produto','preco_produto','categoria_esporte','marca_produto','tamanho_produto'];
        produtos.push({ id_produto, ...Object.fromEntries(campos.map((campo, i) => [campo, valores[i]])) });
        return [{ insertId: id_produto }];
      }
      if (consulta.startsWith('INSERT INTO PRODUTO_DETALHE ')) {
        const campos = ['id_produto','id_catalogo','genero','preco_de','desconto_pix','parcelas','imagens','tamanhos','cores','tags','detalhes','criado_por'];
        detalhes.push(Object.fromEntries(campos.map((campo, i) => [campo, valores[i]])));
        return [{ affectedRows: 1 }];
      }
      throw new Error('Consulta não prevista no substituto de testes: ' + consulta);
    },
    async getConnection() {
      const inicial = { u: usuarios.length, i: identidadesSociais.length, p: produtos.length, d: detalhes.length, idProduto };
      return { execute: api.execute, async beginTransaction() {}, async commit() {}, async rollback() {
        usuarios.length = inicial.u; identidadesSociais.length = inicial.i;
        produtos.length = inicial.p; detalhes.length = inicial.d; idProduto = inicial.idProduto;
      }, release() {} };
    },
    async end() {}
  };
  return api;
};
