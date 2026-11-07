// Objetivo: Cria ou promove administradores pelo terminal.
'use strict';

// Comando administrativo LOCAL. Nunca há concessão de privilégio via formulário público.
const readline = require('node:readline/promises');
const banco = require('../src/config/banco');
const usuarios = require('../src/modelos/usuarios')(banco);
const { gerarHash } = require('../src/seguranca/senhas');
const { emailValido, validarDadosUsuario } = require('../src/validacao');

async function criarAdmin() {
  const entrada = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const email = (await entrada.question('E-mail do administrador: ')).trim().toLowerCase();
    if (email.length > 100 || !emailValido(email)) {
      throw new Error('E-mail inválido.');
    }
    const existente = await usuarios.porEmail(email);
    if (existente) {
      const confirmacao = (await entrada.question('O usuário já existe. Promover a administrador? (SIM para confirmar): ')).trim();
      if (confirmacao !== 'SIM') {
        throw new Error('Operação cancelada.');
      }
      await usuarios.promoverAdmin(existente.id);
      console.log('Privilégio de administrador atualizado para ' + email + '.');
      return;
    }
    const nome = (await entrada.question('Nome completo: ')).trim();
    const cpf = (await entrada.question('CPF (11 dígitos): ')).replace(/\D/g, '');
    const telefone = (await entrada.question('Telefone (10 ou 11 dígitos): ')).replace(/\D/g, '');
    console.log('A senha será visível neste terminal.');
    const senha = await entrada.question('Senha (8 a 128 caracteres, A-Z, a-z, número e especial): ');
    const confirmacaoSenha = await entrada.question('Confirme a senha: ');
    const cadastro = validarDadosUsuario({
      nome,
      email,
      cpf,
      telefone,
      senha,
      confirmarSenha: confirmacaoSenha
    });

    if (cadastro.erros.length > 0) {
      throw new Error(cadastro.erros.join(' '));
    }

    const senhaHash = await gerarHash(senha);
    const id = await usuarios.cadastrar({ ...cadastro.dados, senhaHash });
    await usuarios.promoverAdmin(id);
    console.log('Administrador criado. Acesse /login.html e entre com suas credenciais.');
  } finally {
    entrada.close();
  }
}

criarAdmin().catch(erro => {
  console.error('Falha ao configurar administrador:', erro.code || erro.message);
  process.exitCode = 1;
}).finally(() => banco.end());
