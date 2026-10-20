'use strict';

function lerJson(valor, padrao) {
  if (valor === undefined || valor === null) return padrao;
  if (Buffer.isBuffer(valor)) valor = valor.toString('utf8');
  try { return typeof valor === 'string' ? JSON.parse(valor) : valor; }
  catch { return padrao; }
}

function invalidar(mensagem) {
  const erro = new Error(mensagem);
  erro.status = 400;
  erro.code = 'PEDIDO_INVALIDO';
  return erro;
}

const arredondar = valor => Math.round(valor);
const dinheiroCentavos = valor => Math.round(Number(valor || 0) * 100);
const opcoesTexto = (valor, propriedade) => Array.isArray(valor)
  ? valor.map(item => typeof item === 'string' ? item : item && item[propriedade]).filter(item => typeof item === 'string')
  : [];

module.exports = function criarPedidos(banco) {
  async function catalogoPara(itens) {
    const ids = [...new Set(itens.map(item => item.id))];
    const marcadores = ids.map(() => 'CAST(? AS BINARY)').join(', ');
    const [linhas] = await banco.execute(
      `SELECT p.id_produto AS idBanco,
              CONVERT(COALESCE(CAST(d.id_catalogo AS BINARY), CAST(p.id_produto AS BINARY)) USING utf8mb4) AS id,
              p.nome_produto AS nome, p.preco_produto AS preco,
              p.tamanho_produto AS tamanhoPrincipal,
              d.desconto_pix AS descontoPix, d.imagens, d.tamanhos, d.cores
       FROM PRODUTO p LEFT JOIN PRODUTO_DETALHE d ON d.id_produto = p.id_produto
       WHERE (d.id_catalogo IS NOT NULL AND CAST(d.id_catalogo AS BINARY) IN (${marcadores}))
          OR (d.id_catalogo IS NULL AND CAST(p.id_produto AS BINARY) IN (${marcadores}))`, [...ids, ...ids]
    );
    return new Map(linhas.map(linha => [String(linha.id), {
      ...linha,
      preco: dinheiroCentavos(linha.preco),
      imagens: lerJson(linha.imagens, ['/imagensUCE/acessorio.svg']),
      tamanhos: lerJson(linha.tamanhos, [linha.tamanhoPrincipal]),
      cores: lerJson(linha.cores, [{ nome: 'Padrão' }])
    }]));
  }

  function validarEndereco(endereco) {
    if (!endereco || typeof endereco !== 'object' || Array.isArray(endereco)) throw invalidar('Cadastre um endereço de entrega válido.');
    const campos = ['cep', 'endereco', 'numero', 'bairro', 'cidade', 'estado', 'complemento', 'nomeEndereco', 'referencia', 'tipoEndereco'];
    const seguro = {};
    for (const campo of campos) {
      const valor = typeof endereco[campo] === 'string' ? endereco[campo].trim() : '';
      if (valor.length > 160) throw invalidar('Um dos campos do endereço excedeu o limite de caracteres.');
      seguro[campo] = valor;
    }
    if (!/^\d{5}-?\d{3}$/.test(seguro.cep) || seguro.endereco.length < 2 || !seguro.numero ||
        seguro.bairro.length < 2 || seguro.cidade.length < 2 || !/^[A-Za-z]{2}$/.test(seguro.estado)) {
      throw invalidar('Preencha CEP, rua, número, bairro, cidade e estado antes de finalizar.');
    }
    return seguro;
  }

  function montarTotais(itens, produtos, metodo, cupom) {
    let subtotal = 0, descontoPix = 0;
    for (const item of itens) {
      const produto = produtos.get(item.id);
      const parcial = produto.preco * item.qtd;
      subtotal += parcial;
      if (metodo === 'pix') descontoPix += arredondar(parcial * (Number(produto.descontoPix) || 0) / 100);
    }
    const base = Math.max(0, subtotal - descontoPix);
    let descontoCupom = 0;
    if (cupom === 'TAU10') descontoCupom = arredondar(base * 0.10);
    if (cupom === 'BEMVINDO') descontoCupom = Math.min(2000, base);
    const frete = itens.length && subtotal < 29999 && cupom !== 'FRETEGRATIS' ? 1990 : 0;
    return {
      subtotal: subtotal / 100,
      descontoPix: descontoPix / 100,
      descontoCupom: descontoCupom / 100,
      cupom: cupom || null,
      frete: frete / 100,
      total: (Math.max(0, base - descontoCupom) + frete) / 100
    };
  }

  return {
    async criar(usuarioId, dados) {
      const metodos = ['cartao', 'pix', 'boleto'];
      if (!dados || !Array.isArray(dados.itens) || dados.itens.length < 1 || dados.itens.length > 50) {
        throw invalidar('O carrinho está vazio ou contém itens demais.');
      }
      if (!metodos.includes(dados.metodo)) throw invalidar('Selecione uma forma de pagamento válida.');
      const cupom = ['TAU10', 'BEMVINDO', 'FRETEGRATIS'].includes(dados.cupom) ? dados.cupom : null;
      const endereco = validarEndereco(dados.endereco);
      const itens = dados.itens.map(item => {
        if (!item || typeof item !== 'object') throw invalidar('Não foi possível validar os produtos do carrinho.');
        const id = typeof item.id === 'string' ? item.id : String(item.id || '');
        const tamanho = typeof item.tamanho === 'string' ? item.tamanho.trim() : '';
        const cor = typeof item.cor === 'string' ? item.cor.trim() : '';
        const qtd = Number(item.qtd);
        if (!id || id.length > 100 || !tamanho || tamanho.length > 20 || !cor || cor.length > 40 ||
            !Number.isInteger(qtd) || qtd < 1 || qtd > 10) {
          throw invalidar('Um dos produtos do carrinho tem dados inválidos.');
        }
        return { id, tamanho, cor, qtd };
      });
      const produtos = await catalogoPara(itens);
      const itensSalvos = itens.map(item => {
        const produto = produtos.get(item.id);
        if (!produto) throw invalidar('Um produto do carrinho não está mais disponível. Atualize a página e tente novamente.');
        const tamanhos = opcoesTexto(produto.tamanhos, 'nome');
        const cores = opcoesTexto(produto.cores, 'nome');
        if (!tamanhos.includes(item.tamanho) || !cores.includes(item.cor)) {
          throw invalidar('O tamanho ou a cor de um produto não está mais disponível. Atualize o carrinho.');
        }
        return {
          id: produto.id, idBanco: produto.idBanco, nome: produto.nome,
          imagem: Array.isArray(produto.imagens) ? produto.imagens[0] : '/imagensUCE/acessorio.svg',
          tamanho: item.tamanho, cor: item.cor, qtd: item.qtd, preco: produto.preco / 100
        };
      });
      const totais = montarTotais(itensSalvos, produtos, dados.metodo, cupom);
      const snapshot = {
        itens: itensSalvos.map(({ idBanco, ...item }) => item),
        totais, metodo: dados.metodo, endereco, trocaSolicitada: false
      };
      const porProduto = new Map();
      for (const item of itensSalvos) {
        const acumulado = porProduto.get(item.idBanco) || { qtd: 0, subtotal: 0, preco: item.preco };
        acumulado.qtd += item.qtd;
        acumulado.subtotal += Math.round(item.preco * 100) * item.qtd;
        porProduto.set(item.idBanco, acumulado);
      }

      const conexao = await banco.getConnection();
      try {
        await conexao.beginTransaction();
        const [resultado] = await conexao.execute(
          `INSERT INTO PEDIDO (id_usuario, status_pedido, valor_total_pedido, forma_pagamento_pedido)
           VALUES (?, 'Aguardando pagamento', ?, ?)`,
          [usuarioId, totais.total, dados.metodo]
        );
        const pedidoId = resultado.insertId;
        await conexao.execute(
          'INSERT INTO PEDIDO_DETALHE (id_pedido, pedido_json) VALUES (?, ?)',
          [pedidoId, JSON.stringify(snapshot)]
        );
        for (const [idProduto, item] of porProduto) {
          await conexao.execute(
            `INSERT INTO ITEM_PEDIDO
             (id_pedido, id_produto, quantidade_item_produto, preco_unitario_item_produto, subtotal_item_produto)
             VALUES (?, ?, ?, ?, ?)`,
            [pedidoId, idProduto, item.qtd, item.preco, item.subtotal / 100]
          );
        }
        await conexao.commit();
        return { id: String(pedidoId), ...snapshot, status: 'Aguardando pagamento', criadoEm: new Date().toISOString() };
      } catch (erro) {
        await conexao.rollback();
        throw erro;
      } finally {
        conexao.release();
      }
    },

    async listarDoUsuario(usuarioId) {
      const [linhas] = await banco.execute(
        `SELECT p.id_pedido AS id, p.data_pedido AS criadoEm, p.status_pedido AS status,
                p.valor_total_pedido AS valorTotal, p.forma_pagamento_pedido AS metodo,
                d.pedido_json AS pedidoJson
         FROM PEDIDO p LEFT JOIN PEDIDO_DETALHE d ON d.id_pedido = p.id_pedido
         WHERE p.id_usuario = ? ORDER BY p.data_pedido DESC, p.id_pedido DESC`, [usuarioId]
      );
      const semDetalhe = linhas.filter(linha => !lerJson(linha.pedidoJson, {}).itens).map(linha => linha.id);
      const itensLegados = new Map();
      if (semDetalhe.length) {
        const [itens] = await banco.execute(
          `SELECT i.id_pedido AS pedidoId,
                  CONVERT(COALESCE(CAST(d.id_catalogo AS BINARY), CAST(pr.id_produto AS BINARY)) USING utf8mb4) AS id,
                  pr.nome_produto AS nome, pr.preco_produto AS preco,
                  i.quantidade_item_produto AS qtd,
                  COALESCE(
                    CONVERT(JSON_UNQUOTE(JSON_EXTRACT(d.imagens, '$[0]')) USING utf8mb4) COLLATE utf8mb4_bin,
                    _utf8mb4'/imagensUCE/acessorio.svg' COLLATE utf8mb4_bin
                  ) AS imagem
           FROM ITEM_PEDIDO i
           INNER JOIN PEDIDO p ON p.id_pedido = i.id_pedido
           INNER JOIN PRODUTO pr ON pr.id_produto = i.id_produto
           LEFT JOIN PRODUTO_DETALHE d ON d.id_produto = pr.id_produto
           WHERE p.id_usuario = ? AND p.id_pedido IN (${semDetalhe.map(() => '?').join(', ')})`,
          [usuarioId, ...semDetalhe]
        );
        for (const item of itens) {
          const agrupados = itensLegados.get(String(item.pedidoId)) || [];
          agrupados.push({ id: String(item.id), nome: item.nome, imagem: item.imagem, qtd: Number(item.qtd), preco: Number(item.preco) });
          itensLegados.set(String(item.pedidoId), agrupados);
        }
      }
      return linhas.map(linha => {
        const salvo = lerJson(linha.pedidoJson, {});
        const criadoEm = linha.criadoEm instanceof Date ? linha.criadoEm.toISOString() : linha.criadoEm;
        return {
          ...salvo, itens: Array.isArray(salvo.itens) ? salvo.itens : itensLegados.get(String(linha.id)) || [],
          id: String(linha.id), criadoEm, status: linha.status,
          metodo: salvo.metodo || linha.metodo,
          totais: salvo.totais || { total: Number(linha.valorTotal) }
        };
      });
    },

    async solicitarTroca(usuarioId, pedidoId) {
      const [resultado] = await banco.execute(
        `UPDATE PEDIDO_DETALHE d
         INNER JOIN PEDIDO p ON p.id_pedido = d.id_pedido
         SET d.pedido_json = JSON_SET(d.pedido_json, '$.trocaSolicitada', true)
         WHERE p.id_usuario = ? AND p.id_pedido = ?
           AND p.status_pedido <> 'Aguardando pagamento'
           AND COALESCE(JSON_EXTRACT(d.pedido_json, '$.trocaSolicitada'), false) = false`,
        [usuarioId, pedidoId]
      );
      return resultado.affectedRows > 0;
    }
  };
};
