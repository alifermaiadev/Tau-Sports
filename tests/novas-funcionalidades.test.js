'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const relatorios = require('../src/servicos/relatorios');
const enderecos = require('../src/servicos/enderecos');
const pedidos = require('../src/servicos/pedidos');

test('cinco relatórios executam SQL real e lista fechada de nomes', async () => {
  const sql=[];
  const modelo=relatorios({ async execute(comando){sql.push(comando);return [[{codigo:1}]];} });
  assert.deepEqual(modelo.tipos,['categoria','marca','cliente','venda','enderecos']);
  for(const tipo of modelo.tipos) assert.equal((await modelo.consultar(tipo))[0].codigo,1);
  assert.equal(sql.length,5);
  assert.ok(sql.every(comando=>comando.includes('SELECT')&&!comando.includes('DROP TABLE')));
  assert.doesNotMatch(sql[2],/senha_usuario|senha_hash|cpf_usuario|token_hash/i);
  assert.match(sql[3],/FROM ITEM_PEDIDO/i);
  assert.match(sql[4],/WHERE|JOIN USUARIO/i);
  await assert.rejects(modelo.consultar('venda; DELETE FROM PEDIDO'),/não encontrado/);
});

test('endereços: valida CEP e impede troca de usuário via ID no corpo', async () => {
  let id=1, lancados=0;
  const registros=[];
  const banco={
    async execute(q,v){ if(q.includes('SELECT id_endereco AS id'))return [registros.filter(r=>r.usuario===v[0])];throw Error('query '+q); },
    async getConnection(){return {
      async beginTransaction(){},async commit(){},async rollback(){},release(){},
      async execute(q,v){
        if(q.startsWith('SELECT COUNT('))return [[{n:registros.filter(r=>r.usuario===v[0]).length}]];
        if(q.startsWith('SELECT id_endereco'))return [registros.filter(r=>r.id===v[0]&&r.usuario===v[1])];
        if(q.startsWith('UPDATE ENDERECO_USUARIO SET padrao=0'))return [{}];
        if(q.startsWith('INSERT INTO ENDERECO_USUARIO')){
          const dado={id:id++,usuario:v[11],cep:v[0],estado:v[1],endereco:v[2],numero:v[3],
            complemento:v[4],bairro:v[5],cidade:v[6],nomeEndereco:v[7],referencia:v[8],tipoEndereco:v[9],padrao:!!v[10]};
          registros.push(dado);lancados++;return [{insertId:dado.id}];
        }
        if(q.startsWith('UPDATE ENDERECO_USUARIO SET cep='))return [{affectedRows:1}];
        throw Error('query '+q);
      }
    };}
  };
  const modelo=enderecos(banco);
  const novo={cep:'13000-000',estado:'SP',endereco:'Rua do Teste',numero:'12',bairro:'Centro',cidade:'Campinas',padrao:true};
  const salvo=await modelo.salvar(4,novo);
  assert.equal(salvo.usuario,4);
  assert.equal(salvo.cep,'13000000');
  assert.equal((await modelo.listar(3)).length,0);
  assert.equal(lancados,1);
  await assert.rejects(modelo.salvar(3,{...novo,id:salvo.id}),/não encontrado/);
  await assert.rejects(modelo.salvar(4,{...novo,cep:'000'}),/CEP/);
});

test('pedidos: valores são calculados por produtos reais e gravados com variantes em transação', async () => {
  let total, variante, pago, linhas=0;
  const banco={async getConnection(){return {
    async beginTransaction(){},async commit(){},async rollback(){},release(){},
    async execute(q,v){
      if(q.includes('FROM ENDERECO_USUARIO'))return [[{cep:'13000000',estado:'SP',endereco:'Rua Exemplo',numero:'1',complemento:'',bairro:'Centro',cidade:'Campinas'}]];
      if(q.includes('FROM PRODUTO p LEFT JOIN PRODUTO_DETALHE'))return [[{id_produto:7,preco_produto:100,tamanho_produto:'40',tamanhos:'["40","41"]',cores:'[{"nome":"Preto"}]',desconto_pix:10}]];
      if(q.startsWith('INSERT INTO PEDIDO (')){total=v[2];pago=v[1];return [{insertId:33}];}
      if(q.startsWith('INSERT INTO PEDIDO_ENDERECO'))return [{}];
      if(q.startsWith('INSERT INTO ITEM_PEDIDO (')){linhas++;return [{}];}
      if(q.startsWith('INSERT INTO ITEM_PEDIDO_VARIANTE')){variante=v;return [{}];}
      throw Error(q);
    }
  };}};
  const modelo=pedidos(banco);
  const p=await modelo.criar(3,{metodo:'pix',itens:[{id:'tenis-1',qtd:1,tamanho:'40',cor:'Preto',preco:0}],cupom:'TAU10',valor_total:1});
  assert.equal(total,100.9); // 100 menos 10% de desconto PIX, menos 10% de cupom e frete 19,90
  assert.equal(p.total,total);
  assert.equal(pago,'Aguardando pagamento');
  assert.equal(linhas,1);
  assert.deepEqual(variante,[33,7,'40','Preto',1]);
  await assert.rejects(modelo.criar(3,{metodo:'pix',itens:[{id:'tenis-1',qtd:1,tamanho:'P',cor:'Preto'}]}),/indisponível/);
});

test('EJS novo usa partials do projeto e scripts CSS existem',()=>{
  for(const nome of ['cadastrarproduto','relatorios','login','endereco']){
    const pagina=fs.readFileSync(path.join(__dirname,'../views/pages/'+nome+'.ejs'),'utf8');
    assert.match(pagina,/partials\/head/);
    assert.match(pagina,/partials\/scripts/);
  }
  for(const arquivo of ['views/pages/relatorios.ejs','public/css/relatorios.css','public/js/relatorios.js','database/consultas-relatorios.sql','database/migracao-2026.sql'])
    assert.ok(fs.statSync(path.join(__dirname,'..',arquivo)).size>100);
});

test('produto novo grava em PRODUTO e PRODUTO_DETALHE na mesma transação',async()=>{
  const criarProdutos=require('../src/modelos/produtos');
  const chamadas=[];
  const conexao={async beginTransaction(){chamadas.push('BEGIN');},async commit(){chamadas.push('COMMIT');},
    async rollback(){chamadas.push('ROLLBACK');},release(){chamadas.push('RELEASE');},
    async execute(q,values){chamadas.push({q,values});if(q.includes('INSERT INTO PRODUTO\n'))return [{insertId:6}];return [{affectedRows:1}];}};
  const modelo=criarProdutos({async getConnection(){return conexao;}});
  await modelo.cadastrar({id:'exemplo',nome:'Tênis Teste',descricao:'Tênis de treino',preco:120,categoria:'tenis',
    marca:'Taú',genero:'unissex',tipo:'calcado',tamanhos:['39','40'],precoDe:null,descontoPix:0,
    parcelas:2,imagens:['/imagensUCE/tenis.svg'],cores:[{nome:'Preto',imagem:'/imagensUCE/tenis.svg'}],
    tags:['novidade'],detalhes:[]},1);
  assert.equal(chamadas[0],'BEGIN');
  assert.equal(chamadas.at(-2),'COMMIT');
  assert.equal(chamadas.at(-1),'RELEASE');
  const consulta=chamadas.find(c=>c.q?.includes('INSERT INTO PRODUTO_DETALHE'));
  assert.ok(consulta);
  assert.match(consulta.q,/tipo_produto/);
  assert.equal(consulta.values.at(-1),'calcado');
  assert.equal(consulta.values[7],'["39","40"]');
});

test('scripts SQL de migração não incluem destruição de tabelas',()=>{
  const texto=fs.readFileSync(path.join(__dirname,'../database/migracao-2026.sql'),'utf8')
    .replace(/--[^\n]*/g,'');
  assert.doesNotMatch(texto,/\b(?:DROP|TRUNCATE|DELETE)\s+(?:TABLE|DATABASE|FROM)\b/i);
  for(const tabela of ['CATEGORIA','MARCA','GENERO','ENDERECO_USUARIO','CONTA_SOCIAL','ITEM_PEDIDO_VARIANTE','PEDIDO_ENDERECO','SOLICITACAO_TROCA'])
    assert.match(texto,new RegExp('CREATE TABLE IF NOT EXISTS '+tabela));
});
