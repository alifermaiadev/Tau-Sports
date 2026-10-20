'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const criarApp = require('../src/app');
const criarUsuarios = require('../src/modelos/usuarios');
const criarProdutos = require('../src/modelos/produtos');
const { gerarHash } = require('../src/seguranca/senhas');
const catalogo = require('../src/dados/catalogo-inicial.json');
const SEGREDO = 'segredo-apenas-para-os-testes-automatizados';
const SENHA = 'SenhaDeTeste123!';

async function prepararBanco() {
  if (process.env.TAU_TEST_MYSQL !== '1') {
    return { banco: require('./banco-memoria')(), limpar: async () => {} };
  }
  const mysql = require('mysql2/promise');
  const ambiente = require('../src/config/ambiente');
  const { database, ...conexao } = ambiente.banco;
  const manutencao = mysql.createPool(conexao);
  const nome = 'tau_sports_teste_' + Date.now();
  try {
    await manutencao.query('CREATE DATABASE `' + nome + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  } catch (erro) {
    await manutencao.end();
    throw erro;
  }
  const banco = mysql.createPool({ ...conexao, database: nome });
  try {
    const schema = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
    const comandos = schema.split(';').map(item => item.trim()).filter(Boolean)
      // Mantenha o schema de integração dentro do banco temporário deste teste.
      .filter(comando => !/^(?:CREATE\s+DATABASE|USE\s+)/i.test(comando));
    for (const comando of comandos) {
      await banco.query(comando);
    }
    return { banco, limpar: async () => {
      await manutencao.query('DROP DATABASE `' + nome + '`');
      await manutencao.end();
    } };
  } catch (erro) {
    await banco.end();
    await manutencao.query('DROP DATABASE `' + nome + '`');
    await manutencao.end();
    throw erro;
  }
}

function cliente(base) {
  const cookies = new Map();
  return {
    async requisitar(rota, dados) {
      const res = await fetch(base + rota, {
        method: dados ? 'POST' : 'GET', redirect: 'manual',
        headers: { Cookie: [...cookies].map(([nome, valor]) => nome + '=' + valor).join('; '), ...(dados ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        body: dados ? new URLSearchParams(dados) : undefined
      });
      const valores = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : (res.headers.get('set-cookie') || '').split(/,(?=\s*\w+=)/);
      for (const valor of valores) {
        const par = valor.split(';')[0].trim(), posicao = par.indexOf('=');
        if (posicao > 0) {
          cookies.set(par.slice(0, posicao), par.slice(posicao + 1));
        }
      }
      return { status: res.status, html: await res.text(), headers: res.headers };
    },
    csrf() { return cookies.get('tau_csrf'); },
    sessao() { return cookies.get('tau_sessao'); },
    definirCookie(nome, valor) { cookies.set(nome, valor); },
    async login(email, senha = SENHA, next = '/seusdados.html') {
      await this.requisitar('/login.html');
      return this.requisitar('/login', { email, senha, next, _csrf: this.csrf() });
    }
  };
}

const camposProduto = {
  nome: 'Tênis Teste Faculdade', marca: 'Taú', categoria: 'tenis', genero: 'unissex',
  preco: '199.90', precoDe: '249.90', descontoPix: '10', parcelas: '4',
  imagens: '/imagensUCE/TenisAdidas 01.avif', tamanhos: '38, 39, 40', cores: 'Preto, Branco',
  descricao: 'Produto cadastrado pelo administrador da faculdade.', detalhes: 'Material: Couro\nFechamento: Cadarço', tags: 'oferta'
};

function contexto(html) {
  return JSON.parse(html.match(/<script type="application\/json" id="tau-contexto">([\s\S]*?)<\/script>/)[1]);
}

test('login, autorização ADMIN e cadastro de produtos pelo fluxo HTTP', async t => {
  const { banco, limpar } = await prepararBanco();
  const usuarios = criarUsuarios(banco), produtos = criarProdutos(banco);
  const senhaHash = await gerarHash(SENHA);
  const adminId = await usuarios.cadastrar({ nome: 'Admin Faculdade', email: 'admin@tau.test', senhaHash, cpf: '12345678901', telefone: '11999999999' });
  await usuarios.promoverAdmin(adminId);
  const clienteId = await usuarios.cadastrar({ nome: 'Cliente Faculdade', email: 'cliente@tau.test', senhaHash, cpf: '12345678902', telefone: '11999999998' });
  for (const produto of catalogo) {
    await produtos.cadastrar(produto, null);
  }
  const app = criarApp({ banco, segredo: SEGREDO });
  const servidor = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + servidor.address().port;
  const visitante = cliente(base), comprador = cliente(base), admin = cliente(base);
  let produtoId;
  try {
    await t.test('área da conta exige sessão e preserva destino', async () => {
      const res = await visitante.requisitar('/seusdados.html');
      assert.equal(res.status, 303);
      assert.match(res.headers.get('location'), /login\.html\?next=/);
      const tentativa = await visitante.requisitar('/produtos', camposProduto);
      assert.equal(tentativa.status, 303);
      assert.equal((await produtos.listar()).length, 6);
    });
    await t.test('senha incorreta não cria sessão', async () => {
      const res = await visitante.login('admin@tau.test', 'errada123');
      assert.equal(res.status, 401);
      assert.match(res.html, /E-mail ou senha incorretos/);
      assert.equal(visitante.sessao(), undefined);
    });
    await t.test('e-mail inexistente usa a mesma mensagem', async () => {
      assert.equal((await visitante.login('inexistente@tau.test')).status, 401);
    });
    await t.test('formulários exigem token CSRF', async () => {
      const res = await visitante.requisitar('/login', { email: 'admin@tau.test', senha: SENHA });
      assert.equal(res.status, 403);
    });
    await t.test('CLIENTE faz login e não recebe opção de cadastro', async () => {
      assert.equal((await comprador.login('cliente@tau.test')).status, 303);
      const res = await comprador.requisitar('/seusdados.html');
      assert.equal(res.status, 200);
      assert.doesNotMatch(res.html, /Cadastrar Produto/);
      assert.equal(contexto(res.html).usuario.ies_admin, 'N');
      assert.equal(contexto(res.html).usuario.senha_hash, undefined);
    });
    await t.test('CLIENTE não acessa URL nem envia cadastro diretamente', async () => {
      assert.equal((await comprador.requisitar('/cadastrarproduto.html')).status, 403);
      assert.equal((await comprador.requisitar('/produtos', { ...camposProduto, _csrf: comprador.csrf(), perfil: 'ADMIN' })).status, 403);
      assert.equal((await produtos.listar()).length, 6);
    });
    await t.test('ADMIN tem cookie HttpOnly e opção acima de Sair', async () => {
      const login = await admin.login('ADMIN@TAU.TEST');
      assert.equal(login.status, 303);
      assert.match(login.headers.get('set-cookie'), /HttpOnly/i);
      assert.match(login.headers.get('set-cookie'), /SameSite=Lax/i);
      const res = await admin.requisitar('/seusdados.html');
      assert.ok(res.html.indexOf('Cadastrar Produto') < res.html.indexOf('<span>Sair</span>'));
      assert.equal(contexto(res.html).usuario.ies_admin, 'S');
      assert.match((await admin.requisitar('/cadastrarproduto.html')).html, /action="\/produtos" method="post"/);
    });
    await t.test('sessão e produtos continuam disponíveis ao recriar o servidor', async () => {
      const novoApp = criarApp({ banco, segredo: SEGREDO });
      const novoServidor = await new Promise(resolve => { const s = novoApp.listen(0, '127.0.0.1', () => resolve(s)); });
      try {
        const reaberto = cliente('http://127.0.0.1:' + novoServidor.address().port);
        reaberto.definirCookie('tau_sessao', admin.sessao());
        reaberto.definirCookie('tau_csrf', admin.csrf());
        const pagina = await reaberto.requisitar('/cadastrarproduto.html');
        assert.equal(pagina.status, 200);
        assert.equal(contexto(pagina.html).usuario.ies_admin, 'S');
        assert.equal(contexto(pagina.html).produtos.length, 6);
      } finally {
        await new Promise(resolve => novoServidor.close(resolve));
      }
    });
    await t.test('cadastro inválido preserva campos e não grava', async () => {
      const res = await admin.requisitar('/produtos', { ...camposProduto, preco: '-2', _csrf: admin.csrf() });
      assert.equal(res.status, 400);
      assert.match(res.html, /Tênis Teste Faculdade/);
      assert.match(res.html, /maior que zero/);
      assert.equal((await produtos.listar()).length, 6);
    });
    await t.test('CSRF incorreto não cadastra e Unicode inválido retorna 403', async () => {
      assert.equal((await admin.requisitar('/produtos', { ...camposProduto, _csrf: 'é'.repeat(129) })).status, 403);
      assert.equal((await produtos.listar()).length, 6);
    });
    await t.test('ADMIN cadastra e produto reaparece no catálogo da loja', async () => {
      const res = await admin.requisitar('/produtos', { ...camposProduto, _csrf: admin.csrf() });
      assert.equal(res.status, 303);
      const redirecionamento = res.headers.get('location');
      const confirmacao = await admin.requisitar(redirecionamento);
      assert.match(confirmacao.html, /Produto cadastrado com sucesso/);
      produtoId = new URL(redirecionamento, base).searchParams.get('criado');
      const salvo = (await produtos.listar()).find(produto => produto.id === produtoId);
      assert.equal(salvo.preco, 199.9);
      assert.deepEqual(salvo.tamanhos, ['38', '39', '40']);
      assert.ok(salvo.tags.includes('novidade'));
      const home = await visitante.requisitar('/index.html');
      assert.ok(contexto(home.html).produtos.some(produto => produto.id === produtoId));
      assert.equal((await visitante.requisitar('/produto.html?id=' + produtoId)).status, 200);
    });
    await t.test('conteúdo HTML do produto é serializado sem injetar script', async () => {
      const res = await admin.requisitar('/produtos', { ...camposProduto, nome: '</script><script>alert(1)</script>', _csrf: admin.csrf() });
      assert.equal(res.status, 303);
      const home = await visitante.requisitar('/');
      assert.doesNotMatch(home.html, /<script>alert\(1\)<\/script>/);
      assert.ok(contexto(home.html).produtos.some(p => p.nome.includes('alert(1)')));
    });
    await t.test('cadastro público ignora perfil ADMIN e senha vai como hash', async () => {
      const novo = cliente(base);
      await novo.requisitar('/cadastro.html');
      const res = await novo.requisitar('/cadastro', { nome: 'Novo Cliente', email: 'novo@tau.test', senha: SENHA, confirmarSenha: SENHA, ies_admin: 'S', cpf: '12345678903', telefone: '11999999997', ies_admin: 'S', _csrf: novo.csrf() });
      assert.equal(res.status, 303);
      const salvo = await usuarios.porEmail('novo@tau.test');
      assert.equal(salvo.ies_admin, 'N');
      assert.notEqual(salvo.senha_hash, SENHA);
      assert.match(salvo.senha_hash, /^scrypt\$/);
      assert.doesNotMatch((await novo.requisitar('/seusdados.html')).html, /Cadastrar Produto/);
    });
    await t.test('cadastro duplicado não substitui senha nem perfil', async () => {
      const novo = cliente(base);
      await novo.requisitar('/cadastro.html');
      const res = await novo.requisitar('/cadastro', { nome: 'Outro Nome', email: 'cliente@tau.test', senha: SENHA, confirmarSenha: SENHA, cpf: '12345678904', telefone: '11999999996', _csrf: novo.csrf() });
      assert.equal(res.status, 409);
      assert.equal((await usuarios.porEmail('cliente@tau.test')).id, clienteId);
    });
    await t.test('redirecionamento externo é rejeitado após login', async () => {
      const novo = cliente(base);
      const res = await novo.login('cliente@tau.test', SENHA, 'https://exemplo.test');
      assert.equal(res.headers.get('location'), '/seusdados.html');
    });
    await t.test('revogação de ADMIN no banco vale para a sessão atual', async () => {
      await banco.execute('UPDATE USUARIO SET ies_admin = ? WHERE id_usuario = ?', ['N', adminId]);
      assert.equal((await admin.requisitar('/cadastrarproduto.html')).status, 403);
      assert.equal((await admin.requisitar('/produtos', { ...camposProduto, _csrf: admin.csrf() })).status, 403);
      await banco.execute('UPDATE USUARIO SET ies_admin = ? WHERE id_usuario = ?', ['S', adminId]);
    });
    await t.test('logout invalida sessão inclusive se o cookie antigo for reenviado', async () => {
      const token = admin.sessao();
      assert.equal((await admin.requisitar('/logout', { _csrf: admin.csrf() })).status, 303);
      admin.definirCookie('tau_sessao', token);
      assert.equal((await admin.requisitar('/seusdados.html')).status, 303);
    });
    await t.test('sessão expirada não autentica', async () => {
      await banco.execute("UPDATE SESSOES SET expira_em = '2000-01-01 00:00:00' WHERE usuario_id = ?", [clienteId]);
      assert.equal((await comprador.requisitar('/seusdados.html')).status, 303);
    });
    await t.test('todas as páginas públicas e privadas renderizam em EJS', async () => {
      await admin.login('admin@tau.test');
      for (const pagina of ['index', 'produto', 'finalizarcompra', 'pedidos', 'trocas', 'seusdados', 'endereco', 'cartoessalvos', 'cadastrarproduto']) {
        assert.equal((await admin.requisitar('/' + pagina + '.html')).status, 200, pagina);
      }
      assert.equal((await visitante.requisitar('/naoexiste.html')).status, 404);
    });
  } finally {
    await new Promise(resolve => servidor.close(resolve));
    await banco.end();
    await limpar();
  }
});
