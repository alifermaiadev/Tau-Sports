'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const criarRelatorios = require('../src/servicos/relatorios');
const criarCadastros = require('../src/servicos/cadastros');
const { validarProduto, validarDadosUsuario } = require('../src/validacao');
const catalogo = require('../src/dados/catalogo-inicial.json');

test('dashboard usa dados retornados pelo banco (sem indicadores fictícios) e todos os oito conjuntos', async () => {
  const sql = [], valores = [];
  const resultados = [
    [{pedidos:3,total_pedidos:399.90,ticket_medio:133.30,aguardando:2,valor_confirmado:120}],
    [{clientes:8,produtos:12,categorias:7,marcas:4}],
    [{periodo:'2026-11',primeira_data:'2026-11-01',pedidos:3,total:399.90}],
    [{nome:'Tênis',unidades:8,produtos:4}],
    [{nome:'Adidas',unidades:4}],
    [{nome:'Aguardando pagamento',quantidade:2}],
    [{codigo:5,cliente:'Cliente fictício',valor:99.99,status:'Aguardando pagamento'}],
    [{nome:'Tênis de teste',unidades:4}]
  ];
  const banco = {execute:async (consulta,argumentos=[])=>{
    sql.push(consulta);valores.push(argumentos);
    return [resultados[sql.length-1]];
  }};
  const modelo=criarRelatorios(banco);
  const dados=await modelo.dashboard('90d');
  assert.equal(sql.length,8);
  assert.equal(dados.resumo.total_pedidos,399.90);
  assert.equal(dados.resumo.clientes,8);
  assert.equal(dados.resumo.valor_confirmado,120);
  assert.equal(dados.categorias[0].nome,'Tênis');
  assert.equal(dados.marcas[0].unidades,4);
  assert.equal(dados.recentes[0].codigo,5);
  assert.ok(sql.every(query=>query.includes('SELECT') && !/\b(?:DELETE|DROP|UPDATE|TRUNCATE)\b/i.test(query)));
  assert.deepEqual(valores.map(x=>x.length),[1,0,1,1,1,1,1,1]);
  assert.ok(sql.some(query=>query.includes('valor_confirmado')));
  assert.ok(sql.some(query=>query.includes('CATEGORIA')));
  assert.ok(sql.some(query=>query.includes('MARCA')));
  assert.ok(sql.some(query=>query.includes('ITEM_PEDIDO')));
  await assert.rejects(modelo.dashboard('90d OR 1=1'), {status:400});
});

test('as duas páginas de categoria usam esquema legado do main(3)', async()=>{
  const chamadas = [];
  const banco = {execute:async (sql,params=[])=>{
    chamadas.push({sql,params});
    if(sql.startsWith('SELECT chave_categoria'))return [[{slug:'tenis',nome:'Tênis'}]];
    if(sql.startsWith('SELECT nome FROM MARCA'))return [[{nome:'Nike'}]];
    if(sql.startsWith('SELECT slug, nome FROM GENERO'))return [[{slug:'unissex',nome:'Unissex'}]];
    return [{insertId:1}];
  }};
  const cadastros=criarCadastros(banco);
  const opcoes=await cadastros.opcoes();
  assert.equal(opcoes.categorias.tenis,'Tênis');
  await cadastros.cadastrar('categoria','Basquete');
  assert.match(chamadas.at(-1).sql,/chave_categoria,nome_categoria/);
  assert.deepEqual(chamadas.at(-1).params,['basquete','Basquete']);
});

test('formulário com checkboxes integra sem perder validação de senha forte',()=>{
  const produto = {
    tipo:'calcado',nome:'Tênis de Futebol',marca:'Nike',categoria:'tenis',genero:'unissex',
    preco:'250.00',precoDe:'350',descricao:'Produto esportivo para uso diário',
    imagens:'/imagensUCE/tenis.svg',tamanhos:['39','40'],cores:'Preto',descontoPix:'0',parcelas:'2'
  };
  const validado=validarProduto(produto,{
    categorias:{tenis:'Tênis'},marcas:['Nike'],generos:{unissex:'Unissex'}
  });
  assert.deepEqual(validado.erros,[]);
  assert.equal(validado.produto.tipo,'calcado');
  assert.deepEqual(validado.produto.tamanhos,['39','40']);
  assert.ok(validarProduto({...produto,tamanhos:['GG']},{categorias:{tenis:'Tênis'},marcas:['Nike'],generos:{unissex:'Unissex'}}).erros.length);
  assert.ok(validarDadosUsuario({nome:'Teste Teste',email:'teste@exemplo.com',cpf:'12345678900',telefone:'11999999999',senha:'12345678',confirmarSenha:'12345678'}).erros.length);
});

test('dashboard e links admin são protegidos e a interface tem cinco cards independentes',()=>{
  const origem=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
  const pagina=fs.readFileSync(path.join(__dirname,'../views/pages/relatorios.ejs'),'utf8');
  assert.match(origem,/app\.get\('\/api\/relatorios\/dashboard', apiLogin, apiAdmin/);
  assert.match(origem,/app\.get\('\/api\/relatorios\/:tipo', apiLogin, apiAdmin/);
  assert.match(origem,/const PAGINAS_ADMIN = \[[^\]]*'relatorios'/);
  for(const id of ['categoria','marca','cliente','venda','enderecos']) {
    assert.match(pagina,new RegExp('data-relatorio="'+id+'"'));
  }
  for(const id of ['graficoVendas','graficoCategorias','graficoMarcas','listaProdutos','listaStatus','listaPedidosRecentes']) {
    assert.ok(pagina.includes('id="'+id+'"'));
  }
  const doc=fs.readFileSync(path.join(__dirname,'../src/servicos/oauth.js'),'utf8');
  assert.doesNotMatch(doc,/simple-oauth2/);
});
