// Objetivo: Confere os dados recebidos do usuário antes de salvar no banco.
'use strict';

const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { analisarSenha } = require('../public/js/regras-senha');
const CATEGORIAS = { tenis: 'Tênis', camiseta: 'Camiseta', chuteira: 'Chuteira', mochila: 'Mochila', acessorio: 'Acessório', bone: 'Boné', shorts: 'Shorts' };
const GENEROS = { masculino: 'Masculino', feminino: 'Feminino', infantil: 'Infantil', unissex: 'Unissex' };
const texto = valor => typeof valor === 'string' ? valor.trim() : '';
const emailValido = email => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
function senhaValida(senha) {
  return analisarSenha(senha).valida;
}

// Confere os dados comuns aos cadastros de cliente e de administrador.
function validarDadosUsuario(formulario) {
  const nome = texto(formulario.nome);
  const email = texto(formulario.email).toLowerCase();
  const cpfOriginal = texto(formulario.cpf);
  const telefoneOriginal = texto(formulario.telefone);
  const cpf = cpfOriginal.replace(/\D/g, '');
  const telefone = telefoneOriginal.replace(/\D/g, '');
  const erros = [];

  if (nome.length < 3 || nome.length > 100) {
    erros.push('O nome deve ter entre 3 e 100 caracteres.');
  }
  if (email.length > 100 || !emailValido(email)) {
    erros.push('Informe um e-mail válido de até 100 caracteres.');
  }
  if (!/^\d{11}$/.test(cpf)) {
    erros.push('O CPF deve ter 11 dígitos.');
  }
  if (!/^\d{10,11}$/.test(telefone)) {
    erros.push('O telefone deve ter 10 ou 11 dígitos.');
  }
  if (!senhaValida(formulario.senha)) {
    erros.push('A senha deve ter de 8 a 128 caracteres, maiúscula, minúscula, número e caractere especial.');
  }
  if (formulario.senha !== formulario.confirmarSenha) {
    erros.push('A confirmação da senha deve ser igual à senha.');
  }

  return {
    erros,
    dados: { nome, email, cpf, telefone },
    valores: { nome, email, cpf: cpfOriginal, telefone: telefoneOriginal }
  };
}

// Gera o código que o catálogo usa ("Tênis" -> "tenis").
function criarChaveCategoria(nome) {
  return nome.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

function validarCategoria(dados) {
  const nome = texto(dados.nome);
  const chave = criarChaveCategoria(nome);
  const erros = [];

  if (nome.length < 3 || nome.length > 50) {
    erros.push('O nome da categoria deve ter entre 3 e 50 caracteres.');
  }
  if (!chave) {
    erros.push('Informe um nome com letras ou números.');
  }

  return { erros, categoria: { nome, chave } };
}

function validarProduto(dados, categoriasDisponiveis = CATEGORIAS) {
  const erros = [];
  const campoTexto = (campo, rotulo, minimo, maximo) => {
    const valor = texto(dados[campo]);
    if (valor.length < minimo || valor.length > maximo) {
      erros.push(`${rotulo}: informe entre ${minimo} e ${maximo} caracteres.`);
    }
    return valor;
  };
  const dinheiro = (campo, obrigatorio) => {
    const valor = texto(dados[campo]).replace(',', '.');
    if (!valor && !obrigatorio) {
      return null;
    }
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(valor) || Number(valor) <= 0 || Number(valor) > 99999999.99) {
      erros.push(campo === 'preco' ? 'Informe um preço válido, maior que zero, com até duas casas decimais.' : 'Informe um preço anterior válido.');
    }
    return Number(valor);
  };
  const inteiro = (campo, padrao, minimo, maximo) => {
    const valor = texto(dados[campo]) || String(padrao);
    if (!/^\d+$/.test(valor) || Number(valor) < minimo || Number(valor) > maximo) {
      erros.push(`${campo === 'parcelas' ? 'Parcelas' : 'Desconto PIX'}: informe um inteiro de ${minimo} a ${maximo}.`);
    }
    return Number(valor);
  };
  const lista = (campo, separador, maximo, tamanho) => {
    const itens = [...new Set(texto(dados[campo]).split(separador).map(texto).filter(Boolean))];
    if (itens.length > maximo || itens.some(item => item.length > tamanho)) {
      erros.push(`O campo ${campo} excede o limite de itens ou de caracteres.`);
    }
    return itens;
  };
  const nome = campoTexto('nome', 'Nome', 3, 100);
  const marca = campoTexto('marca', 'Marca', 2, 50);
  const descricao = campoTexto('descricao', 'Descrição', 10, 5000);
  const categoria = texto(dados.categoria), genero = texto(dados.genero);
  if (!Object.hasOwn(categoriasDisponiveis, categoria)) {
    erros.push('Selecione uma categoria válida.');
  }
  if (!Object.hasOwn(GENEROS, genero)) {
    erros.push('Selecione um público válido.');
  }
  const preco = dinheiro('preco', true), precoDe = dinheiro('precoDe', false);
  if (precoDe !== null && precoDe <= preco) {
    erros.push('O preço anterior deve ser maior que o preço de venda.');
  }
  const imagens = lista('imagens', /\r?\n/, 10, 2048);
  if (!imagens.length) {
    erros.push('Informe pelo menos uma imagem.');
  }
  for (const imagem of imagens) {
    let valida = false;
    if (/^\/imagensUCE\/[^?#]+$/.test(imagem)) {
      try {
        const raiz = path.join(__dirname, '../public/imagensUCE');
        const arquivo = path.resolve(raiz, decodeURIComponent(imagem.slice('/imagensUCE/'.length)));
        valida = arquivo.startsWith(raiz + path.sep) && fs.existsSync(arquivo) && fs.statSync(arquivo).isFile();
      } catch (erro) {
        valida = false;
      }
    } else {
      try {
        const url = new URL(imagem);
        valida = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
      } catch (erro) {
        valida = false;
      }
    }
    if (!valida) {
      erros.push('Cada imagem deve ser uma URL HTTP/HTTPS válida ou um arquivo existente em /imagensUCE/.');
      break;
    }
  }
  const tamanhos = lista('tamanhos', /,/, 30, 20), cores = lista('cores', /,/, 20, 40);
  if (tamanhos.length && tamanhos[0].length > 10) {
    erros.push('O tamanho principal deve ter no máximo 10 caracteres.');
  }
  if (!tamanhos.length || !cores.length) {
    erros.push('Informe pelo menos um tamanho e uma cor.');
  }
  const recebidas = Array.isArray(dados.tags) ? dados.tags : [dados.tags];
  const tags = ['novidade', ...['oferta', 'esporte', 'streetwear'].filter(tag => recebidas.includes(tag))];
  const descontoPix = inteiro('descontoPix', 0, 0, 99), parcelas = inteiro('parcelas', 1, 1, 10);
  const detalhes = lista('detalhes', /\r?\n/, 20, 250);
  const slug = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'produto';
  return { erros, produto: {
    id: slug + '-' + randomUUID().slice(0, 8), nome, marca, categoria, genero, preco, precoDe,
    descontoPix, parcelas, descricao, imagens, tamanhos,
    cores: cores.map(cor => ({ nome: cor, imagem: imagens[0] })), tags, detalhes
  } };
}

module.exports = { texto, emailValido, senhaValida, analisarSenha, validarDadosUsuario, validarProduto, validarCategoria, CATEGORIAS, GENEROS };
