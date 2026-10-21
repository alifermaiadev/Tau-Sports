-- relatorio: categoria
-- Inclui categorias sem produtos (LEFT JOIN); média dos preços registrados.
SELECT c.id_categoria AS codigo, c.nome AS categoria,
  COUNT(p.id_produto) AS quantidade_produtos,
  ROUND(AVG(p.preco_produto), 2) AS preco_medio
FROM CATEGORIA c LEFT JOIN PRODUTO p ON p.categoria_esporte = c.slug
GROUP BY c.id_categoria, c.nome ORDER BY c.nome;

-- relatorio: marca
-- Mantém marcas cadastradas ainda sem produtos.
SELECT m.id_marca AS codigo, m.nome AS marca,
  COUNT(p.id_produto) AS quantidade_produtos,
  ROUND(AVG(p.preco_produto), 2) AS preco_medio
FROM MARCA m LEFT JOIN PRODUTO p ON p.marca_produto = m.nome
GROUP BY m.id_marca, m.nome ORDER BY m.nome;

-- relatorio: cliente
-- Não seleciona campos de senha, autenticação ou documentos pessoais.
SELECT u.id_usuario AS codigo, u.nome_usuario AS nome,
  u.email_usuario AS email, u.telefone_usuario AS telefone,
  u.data_cadastro_usuario AS data_cadastro
FROM USUARIO u WHERE COALESCE(u.ies_admin, 'N') <> 'S' AND u.ativo = 1
ORDER BY u.id_usuario DESC;

-- relatorio: venda
-- Agrega itens sem multiplicação das linhas por JOIN.
SELECT p.id_pedido AS codigo, u.nome_usuario AS cliente, p.data_pedido AS data_venda,
  COALESCE(i.quantidade_itens, 0) AS quantidade_itens,
  p.valor_total_pedido AS valor_total, p.status_pedido AS status
FROM PEDIDO p INNER JOIN USUARIO u ON u.id_usuario = p.id_usuario
LEFT JOIN (SELECT id_pedido, SUM(quantidade_item_produto) AS quantidade_itens
           FROM ITEM_PEDIDO GROUP BY id_pedido) i ON i.id_pedido = p.id_pedido
ORDER BY p.data_pedido DESC, p.id_pedido DESC;

-- relatorio: enderecos
-- Somente para APIs protegidas de administradores.
SELECT e.id_endereco AS codigo, u.nome_usuario AS cliente,
  e.cep, e.logradouro, e.numero, e.complemento, e.bairro, e.cidade, e.estado
FROM ENDERECO_USUARIO e INNER JOIN USUARIO u ON u.id_usuario = e.id_usuario
ORDER BY u.nome_usuario, e.id_endereco DESC;
