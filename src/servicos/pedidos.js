'use strict';
const ler = (valor, fallback) => { try { if(Buffer.isBuffer(valor))valor=valor.toString('utf8'); return typeof valor === 'string' ? JSON.parse(valor) : valor || fallback; } catch { return fallback; } };
const erroCliente = msg => Object.assign(new Error(msg), { status: 400 });
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
module.exports = banco => ({
  async listar(usuarioId) {
    const [pedidos] = await banco.execute(`SELECT id_pedido AS id, data_pedido AS criadoEm, status_pedido AS status,
      valor_total_pedido AS total, forma_pagamento_pedido AS metodo,
      EXISTS(SELECT 1 FROM SOLICITACAO_TROCA t WHERE t.id_pedido=PEDIDO.id_pedido) AS trocaSolicitada
      FROM PEDIDO WHERE id_usuario=? ORDER BY id_pedido DESC`, [usuarioId]);
    for (const p of pedidos) {
      const [itens] = await banco.execute(`SELECT p.nome_produto AS nome, i.preco_unitario_item_produto AS preco, d.id_catalogo AS id,
        v.tamanho, v.cor, v.quantidade AS qtd, d.imagens FROM ITEM_PEDIDO_VARIANTE v
        JOIN PRODUTO p ON p.id_produto=v.id_produto JOIN ITEM_PEDIDO i ON i.id_pedido=v.id_pedido AND i.id_produto=v.id_produto
        LEFT JOIN PRODUTO_DETALHE d ON d.id_produto=p.id_produto
        WHERE v.id_pedido=?
        UNION ALL
        SELECT p.nome_produto AS nome, i.preco_unitario_item_produto AS preco, d.id_catalogo AS id,
          p.tamanho_produto AS tamanho, 'Padrão' AS cor, i.quantidade_item_produto AS qtd, d.imagens
        FROM ITEM_PEDIDO i JOIN PRODUTO p ON p.id_produto=i.id_produto
        LEFT JOIN PRODUTO_DETALHE d ON d.id_produto=p.id_produto
        WHERE i.id_pedido=? AND NOT EXISTS (
          SELECT 1 FROM ITEM_PEDIDO_VARIANTE v WHERE v.id_pedido=i.id_pedido AND v.id_produto=i.id_produto
        )`, [p.id,p.id]);
      p.itens = itens.map(i => ({ ...i, imagem: ler(i.imagens, ['/imagensUCE/acessorio.svg'])[0] }));
      p.totais = { total: Number(p.total) };
      const [enderecos] = await banco.execute(`SELECT endereco, numero, complemento, bairro, cidade, estado, cep FROM PEDIDO_ENDERECO WHERE id_pedido=?`,[p.id]);
      p.endereco = enderecos[0] || null;
    }
    return pedidos;
  },
  async solicitarTroca(usuarioId,idPedido) {
    const id=Number(idPedido);
    if(!Number.isSafeInteger(id)||id<1) throw erroCliente('Número do pedido inválido.');
    const [dados]=await banco.execute('SELECT status_pedido FROM PEDIDO WHERE id_pedido=? AND id_usuario=?',[id,usuarioId]);
    if(!dados.length) throw Object.assign(new Error('Pedido não encontrado.'),{status:404});
    if(dados[0].status_pedido==='Aguardando pagamento') throw erroCliente('A troca só pode ser solicitada após a confirmação do pagamento.');
    await banco.execute('INSERT IGNORE INTO SOLICITACAO_TROCA (id_pedido) VALUES (?)',[id]);
    return { idPedido:id, solicitada:true };
  },
  async criar(usuarioId, pedido) {
    if (!pedido || !Array.isArray(pedido.itens) || !pedido.itens.length || pedido.itens.length > 40 ||
        !['cartao', 'pix', 'boleto'].includes(pedido.metodo)) throw erroCliente('Confira os itens e a forma de pagamento.');
    const conexao = await banco.getConnection();
    try {
      await conexao.beginTransaction();
      const [enderecos] = await conexao.execute(`SELECT cep, estado, logradouro AS endereco, numero, complemento, bairro, cidade
        FROM ENDERECO_USUARIO WHERE id_usuario=? ORDER BY padrao DESC, id_endereco DESC LIMIT 1`, [usuarioId]);
      if (!enderecos.length) throw erroCliente('Cadastre seu endereço antes de finalizar o pedido.');
      const produtos = [], agregados = new Map(); let subtotal = 0, descontoPix = 0;
      for (const item of pedido.itens) {
        const quantidade = Number(item.qtd);
        if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 20 || typeof item.id !== 'string' ||
            typeof item.tamanho !== 'string' || typeof item.cor !== 'string') throw erroCliente('Item inválido.');
        const [linhas] = await conexao.execute(`SELECT p.id_produto, p.preco_produto, p.tamanho_produto, d.tamanhos, d.cores, d.desconto_pix
          FROM PRODUTO p LEFT JOIN PRODUTO_DETALHE d ON d.id_produto=p.id_produto
          WHERE COALESCE(d.id_catalogo, CAST(p.id_produto AS CHAR)) = ? LIMIT 1`, [item.id]);
        const p = linhas[0]; if (!p) throw erroCliente('Produto indisponível. Atualize o carrinho.');
        const tamanhos = ler(p.tamanhos, [p.tamanho_produto]); const cores = ler(p.cores, [{ nome: 'Padrão' }]);
        if (!tamanhos.includes(item.tamanho) || !cores.some(c => c.nome === item.cor)) throw erroCliente('Tamanho ou cor indisponível.');
        const preco = Number(p.preco_produto); subtotal += preco * quantidade;
        if (pedido.metodo === 'pix') descontoPix += preco * quantidade * Number(p.desconto_pix || 0) / 100;
        const atual = agregados.get(p.id_produto) || { quantidade: 0, subtotal: 0 };
        atual.quantidade += quantidade; atual.subtotal += preco * quantidade; agregados.set(p.id_produto, atual);
        produtos.push({ idProduto: p.id_produto, tamanho: item.tamanho, cor: item.cor, quantidade, preco });
      }
      // Mesmo frete básico anunciado no navegador; cupons não são aceitos sem validação no servidor.
      const cupom = typeof pedido.cupom === 'string' ? pedido.cupom : null;
      const base = subtotal - descontoPix;
      let descontoCupom = 0;
      if (cupom === 'TAU10') descontoCupom = base * .1;
      else if (cupom === 'BEMVINDO') descontoCupom = Math.min(20, base);
      else if (cupom !== null && cupom !== 'FRETEGRATIS') throw erroCliente('Cupom inválido.');
      const frete = subtotal >= 299.99 || cupom === 'FRETEGRATIS' ? 0 : 19.9;
      const total = round(Math.max(0,base - descontoCupom) + frete);
      if (!Number.isFinite(total) || total <= 0 || total > 99999999) throw erroCliente('Total inválido.');
      const status = 'Aguardando pagamento'; // NÃO marcar como pago: não existe gateway integrado.
      const [res] = await conexao.execute(`INSERT INTO PEDIDO (id_usuario, status_pedido, valor_total_pedido, forma_pagamento_pedido)
        VALUES (?,?,?,?)`, [usuarioId, status, total, pedido.metodo]);
      const endereco = enderecos[0];
      await conexao.execute(`INSERT INTO PEDIDO_ENDERECO (id_pedido,cep,estado,endereco,numero,complemento,bairro,cidade) VALUES (?,?,?,?,?,?,?,?)`,
        [res.insertId,endereco.cep,endereco.estado,endereco.endereco,endereco.numero,endereco.complemento,endereco.bairro,endereco.cidade]);
      for (const [id, a] of agregados) {
        await conexao.execute(`INSERT INTO ITEM_PEDIDO (id_pedido, id_produto, quantidade_item_produto,
          preco_unitario_item_produto, subtotal_item_produto) VALUES (?,?,?,?,?)`,
        [res.insertId, id, a.quantidade, round(a.subtotal / a.quantidade), round(a.subtotal)]);
      }
      for (const p of produtos) {
        await conexao.execute('INSERT INTO ITEM_PEDIDO_VARIANTE (id_pedido, id_produto, tamanho, cor, quantidade) VALUES (?,?,?,?,?)',
          [res.insertId, p.idProduto, p.tamanho, p.cor, p.quantidade]);
      }
      await conexao.commit();
      return { id: res.insertId, status, total, metodo: pedido.metodo };
    } catch (e) { await conexao.rollback(); throw e; }
    finally { conexao.release(); }
  }
});
