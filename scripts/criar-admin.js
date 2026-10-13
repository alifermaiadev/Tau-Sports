'use strict';

const readline = require('node:readline/promises');
const banco = require('../src/config/banco');
const usuarios = require('../src/modelos/usuarios')(banco);
const { gerarHash } = require('../src/seguranca/senhas');
const { emailValido, senhaValida } = require('../src/validacao');

async function criarAdmin() {
  const entrada = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const nome = (await entrada.question('Nome do administrador: ')).trim();
    const email = (await entrada.question('E-mail: ')).trim().toLowerCase();
    console.log('A senha será visível neste terminal.');
    const senha = await entrada.question('Senha (8 a 128 caracteres): ');
    const confirmacao = await entrada.question('Confirme a senha: ');
    if (nome.length < 3 || nome.length > 120 || !emailValido(email) || !senhaValida(senha) || senha !== confirmacao) {
      throw new Error('Nome, e-mail ou senha inválidos, ou confirmação diferente.');
    }
    if (await usuarios.porEmail(email)) {
      throw new Error('O e-mail já existe. Use outro e-mail para criar o administrador.');
    }
    await usuarios.cadastrar({ nome, email, senhaHash: await gerarHash(senha), perfil: 'ADMIN' });
    console.log('Administrador cadastrado. Faça login com as credenciais informadas.');
  } finally {
    entrada.close();
  }
}

criarAdmin().catch(erro => {
  console.error('Falha ao criar administrador:', erro.message);
  process.exitCode = 1;
}).finally(() => banco.end());
