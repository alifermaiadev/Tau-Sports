-- Extensões aditivas: executar por npm run banco:preparar após backup.
-- Não executa DROP, TRUNCATE ou DELETE — migração compatível com cadastros existentes.
CREATE TABLE IF NOT EXISTS CATEGORIA (
  id_categoria INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(50) NOT NULL UNIQUE,
  nome VARCHAR(80) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS MARCA (
  id_marca INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS GENERO (
  id_genero INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(30) NOT NULL UNIQUE,
  nome VARCHAR(60) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ENDERECO_USUARIO (
  id_endereco INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  cep CHAR(8) NOT NULL,
  estado CHAR(2) NOT NULL,
  logradouro VARCHAR(150) NOT NULL,
  numero VARCHAR(20) NOT NULL,
  complemento VARCHAR(100) NOT NULL DEFAULT '',
  bairro VARCHAR(100) NOT NULL,
  cidade VARCHAR(100) NOT NULL,
  nome_endereco VARCHAR(80) NOT NULL DEFAULT '',
  referencia VARCHAR(150) NOT NULL DEFAULT '',
  tipo_endereco VARCHAR(20) NOT NULL DEFAULT 'residencial',
  padrao BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario) ON DELETE CASCADE,
  INDEX idx_endereco_usuario (id_usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS CONTA_SOCIAL (
  id_conta_social INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  provedor VARCHAR(20) NOT NULL,
  id_provedor VARCHAR(190) NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_social_provedor (provedor, id_provedor),
  UNIQUE KEY uq_social_usuario_provedor (id_usuario, provedor),
  FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Preserva a PK original de ITEM_PEDIDO e registra as opções separadamente.
CREATE TABLE IF NOT EXISTS ITEM_PEDIDO_VARIANTE (
  id_variante BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_pedido INT NOT NULL,
  id_produto INT NOT NULL,
  tamanho VARCHAR(20) NOT NULL,
  cor VARCHAR(40) NOT NULL,
  quantidade INT NOT NULL,
  CONSTRAINT fk_variante_item FOREIGN KEY (id_pedido, id_produto)
    REFERENCES ITEM_PEDIDO(id_pedido, id_produto) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- A coluna tipo_produto em PRODUTO_DETALHE é acrescentada condicionalmente em preparar-banco.js.

-- Copia os dados de entrega na data da venda para preservar o histórico se o usuário editar o endereço.
CREATE TABLE IF NOT EXISTS PEDIDO_ENDERECO (
  id_pedido INT PRIMARY KEY,
  cep CHAR(8) NOT NULL, estado CHAR(2) NOT NULL,
  endereco VARCHAR(150) NOT NULL, numero VARCHAR(20) NOT NULL,
  complemento VARCHAR(100) NOT NULL DEFAULT '', bairro VARCHAR(100) NOT NULL, cidade VARCHAR(100) NOT NULL,
  FOREIGN KEY (id_pedido) REFERENCES PEDIDO(id_pedido) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Conserva a funcionalidade de solicitação de troca do projeto original, agora persistida.
CREATE TABLE IF NOT EXISTS SOLICITACAO_TROCA (
  id_pedido INT PRIMARY KEY,
  solicitada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_pedido) REFERENCES PEDIDO(id_pedido) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
