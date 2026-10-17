CREATE DATABASE IF NOT EXISTS tau_sports CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE tau_sports;

-- Compatível com as tabelas originais do Tau Sports (MySQL 8+).
-- Execute pelo npm run banco:preparar. CREATE TABLE IF NOT EXISTS não elimina dados.
-- O banco tau_sports precisa existir e estar selecionado em DB_NAME no .env.
CREATE TABLE IF NOT EXISTS USUARIO (
  id_usuario INT AUTO_INCREMENT PRIMARY KEY,
  nome_usuario VARCHAR(100) NOT NULL,
  email_usuario VARCHAR(100) UNIQUE NOT NULL,
  senha_usuario VARCHAR(255) NOT NULL,
  cpf_usuario VARCHAR(14) UNIQUE NOT NULL,
  telefone_usuario VARCHAR(20) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  adm BOOLEAN NOT NULL DEFAULT FALSE,
  data_cadastro_usuario DATETIME DEFAULT CURRENT_TIMESTAMP,
  ies_admin CHAR(1) NOT NULL DEFAULT 'N'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS PRODUTO (
  id_produto INT AUTO_INCREMENT PRIMARY KEY,
  nome_produto VARCHAR(100) NOT NULL,
  descricao_produto TEXT,
  preco_produto DECIMAL(10, 2) NOT NULL,
  categoria_esporte VARCHAR(50) NOT NULL,
  marca_produto VARCHAR(50),
  tamanho_produto VARCHAR(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ESTOQUE (
  id_estoque INT AUTO_INCREMENT PRIMARY KEY,
  id_produto INT UNIQUE NOT NULL,
  quantidade_estoque INT NOT NULL DEFAULT 0,
  ultima_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (id_produto) REFERENCES PRODUTO(id_produto) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS PEDIDO (
  id_pedido INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  data_pedido DATETIME DEFAULT CURRENT_TIMESTAMP,
  status_pedido VARCHAR(30) NOT NULL DEFAULT 'Pendente',
  valor_total_pedido DECIMAL(10, 2) NOT NULL,
  forma_pagamento_pedido VARCHAR(30) NOT NULL,
  FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ITEM_PEDIDO (
  id_pedido INT NOT NULL,
  id_produto INT NOT NULL,
  quantidade_item_produto INT NOT NULL,
  preco_unitario_item_produto DECIMAL(10, 2) NOT NULL,
  subtotal_item_produto DECIMAL(10, 2) NOT NULL,
  PRIMARY KEY (id_pedido, id_produto),
  FOREIGN KEY (id_pedido) REFERENCES PEDIDO(id_pedido) ON DELETE CASCADE,
  FOREIGN KEY (id_produto) REFERENCES PRODUTO(id_produto)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sessões autenticadas no servidor, não dependem do localStorage.
CREATE TABLE IF NOT EXISTS SESSOES (
  token_hash CHAR(64) PRIMARY KEY,
  usuario_id INT NOT NULL,
  expira_em DATETIME NOT NULL,
  INDEX idx_sessoes_expiracao (expira_em),
  CONSTRAINT fk_sessoes_usuario FOREIGN KEY (usuario_id) REFERENCES USUARIO(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Informações extras usadas pelo catálogo EJS. PRODUTO continua intacta.
CREATE TABLE IF NOT EXISTS PRODUTO_DETALHE (
  id_produto INT NOT NULL PRIMARY KEY,
  id_catalogo VARCHAR(100) NOT NULL UNIQUE,
  genero VARCHAR(20) NOT NULL DEFAULT 'unissex',
  preco_de DECIMAL(10,2) NULL,
  desconto_pix TINYINT UNSIGNED NOT NULL DEFAULT 0,
  parcelas TINYINT UNSIGNED NOT NULL DEFAULT 1,
  imagens JSON NOT NULL,
  tamanhos JSON NOT NULL,
  cores JSON NOT NULL,
  tags JSON NOT NULL,
  detalhes JSON NOT NULL,
  criado_por INT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_detalhe_produto FOREIGN KEY (id_produto) REFERENCES PRODUTO(id_produto) ON DELETE CASCADE,
  CONSTRAINT fk_detalhe_autor FOREIGN KEY (criado_por) REFERENCES USUARIO(id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
