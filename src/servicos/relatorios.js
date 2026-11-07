'use strict';
// Consultas fechadas, parametrizadas. Dados pessoais disponíveis apenas nas rotas ADMIN.
const fs = require('node:fs');
const path = require('node:path');
const origem = fs.readFileSync(path.join(__dirname, '../../database/consultas-relatorios.sql'), 'utf8');
const partes = origem.split(/-- relatorio: (categoria|marca|cliente|venda|enderecos)\s*\n/g);
const sql = Object.fromEntries(Array.from({ length: (partes.length - 1) / 2 }, (_, i) =>
  [partes[i * 2 + 1], partes[i * 2 + 2].trim()]));
const periodos = { '30d': 30, '90d': 90, '365d': 365, todos: 36500 };

module.exports = banco => ({
  tipos: Object.keys(sql),
  async consultar(tipo) {
    if (!Object.hasOwn(sql, tipo)) throw Object.assign(new Error('Relatório não encontrado.'), { status:404 });
    return (await banco.execute(sql[tipo]))[0];
  },
  async dashboard(periodo = '90d') {
    if (typeof periodo !== 'string' || !Object.hasOwn(periodos, periodo)) {
      throw Object.assign(new Error('Período inválido.'), { status:400 });
    }
    const dias = periodos[periodo];
    // Apenas os formatos predefinidos aqui podem aparecer no SQL.
    const escala = periodo === '30d' ? "DATE_FORMAT(p.data_pedido, '%Y-%m-%d')" :
      periodo === '90d' ? "YEARWEEK(p.data_pedido, 3)" : "DATE_FORMAT(p.data_pedido, '%Y-%m')";
    const limite = 'DATE_SUB(CURRENT_DATE(), INTERVAL ? DAY)';
    const consultas = [
      banco.execute(`SELECT COUNT(*) AS pedidos, COALESCE(SUM(valor_total_pedido),0) AS total_pedidos,
        COALESCE(AVG(valor_total_pedido),0) AS ticket_medio,
        COALESCE(SUM(CASE WHEN status_pedido IN ('Pago','Pagamento aprovado','Em separação','Enviado','Em transporte','Entregue','Concluído')
          THEN valor_total_pedido ELSE 0 END),0) AS valor_confirmado,
        SUM(CASE WHEN status_pedido IN ('Aguardando pagamento','Pendente') THEN 1 ELSE 0 END) AS aguardando
        FROM PEDIDO WHERE data_pedido >= ${limite}`, [dias]),
      banco.execute(`SELECT
        (SELECT COUNT(*) FROM USUARIO WHERE ativo=1 AND COALESCE(ies_admin,'N') <> 'S') AS clientes,
        (SELECT COUNT(*) FROM PRODUTO) AS produtos,
        (SELECT COUNT(*) FROM CATEGORIA) AS categorias,
        (SELECT COUNT(*) FROM MARCA) AS marcas`),
      banco.execute(`SELECT ${escala} AS periodo, MIN(p.data_pedido) AS primeira_data,
        COUNT(*) AS pedidos, COALESCE(SUM(p.valor_total_pedido),0) AS total
        FROM PEDIDO p WHERE p.data_pedido >= ${limite}
        GROUP BY periodo ORDER BY primeira_data`, [dias]),
      banco.execute(`SELECT c.nome_categoria AS nome, COUNT(DISTINCT p.id_produto) AS produtos,
        COALESCE(SUM(CASE WHEN ped.data_pedido >= ${limite} THEN i.quantidade_item_produto ELSE 0 END),0) AS unidades
        FROM CATEGORIA c LEFT JOIN PRODUTO p ON p.categoria_esporte=c.chave_categoria
        LEFT JOIN ITEM_PEDIDO i ON i.id_produto=p.id_produto
        LEFT JOIN PEDIDO ped ON ped.id_pedido=i.id_pedido
        GROUP BY c.id_categoria,c.nome_categoria ORDER BY unidades DESC,produtos DESC,c.nome_categoria LIMIT 7`, [dias]),
      banco.execute(`SELECT m.nome, COALESCE(SUM(CASE WHEN ped.data_pedido >= ${limite}
        THEN i.quantidade_item_produto ELSE 0 END),0) AS unidades
        FROM MARCA m LEFT JOIN PRODUTO p ON p.marca_produto=m.nome
        LEFT JOIN ITEM_PEDIDO i ON i.id_produto=p.id_produto
        LEFT JOIN PEDIDO ped ON ped.id_pedido=i.id_pedido
        GROUP BY m.id_marca,m.nome ORDER BY unidades DESC,m.nome LIMIT 6`, [dias]),
      banco.execute(`SELECT p.status_pedido AS nome, COUNT(*) AS quantidade
        FROM PEDIDO p WHERE p.data_pedido >= ${limite}
        GROUP BY p.status_pedido ORDER BY quantidade DESC,p.status_pedido`, [dias]),
      banco.execute(`SELECT p.id_pedido AS codigo, u.nome_usuario AS cliente,
        p.data_pedido AS data, p.status_pedido AS status, p.valor_total_pedido AS valor
        FROM PEDIDO p INNER JOIN USUARIO u ON u.id_usuario=p.id_usuario
        WHERE p.data_pedido >= ${limite} ORDER BY p.data_pedido DESC,p.id_pedido DESC LIMIT 6`, [dias]),
      banco.execute(`SELECT p.nome_produto AS nome,
        COALESCE(SUM(CASE WHEN ped.data_pedido >= ${limite} THEN i.quantidade_item_produto ELSE 0 END),0) AS unidades
        FROM PRODUTO p LEFT JOIN ITEM_PEDIDO i ON i.id_produto=p.id_produto
        LEFT JOIN PEDIDO ped ON ped.id_pedido=i.id_pedido
        GROUP BY p.id_produto,p.nome_produto ORDER BY unidades DESC,p.nome_produto LIMIT 5`, [dias])
    ];
    const resultados = await Promise.all(consultas);
    const [resumo, catalogo, evolucao, categorias, marcas, status, recentes, produtos] = resultados.map(r => r[0]);
    return {
      periodo, atualizadoEm: new Date().toISOString(),
      resumo: { ...resumo[0], ...catalogo[0] },
      evolucao, categorias, marcas, status, recentes, produtos,
      observacao: 'Pedidos de teste aguardando pagamento não são faturamento confirmado.'
    };
  }
});
