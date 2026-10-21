(function () {
  'use strict';
  const definicoes = {
    categoria:{titulo:'Categorias', campos:[['categoria','Categoria'],['quantidade_produtos','Produtos'],['preco_medio','Preço médio','moeda']]},
    marca:{titulo:'Marcas', campos:[['marca','Marca'],['quantidade_produtos','Produtos'],['preco_medio','Preço médio','moeda']]},
    cliente:{titulo:'Clientes', campos:[['codigo','Código'],['nome','Nome'],['email','E-mail'],['telefone','Telefone'],['data_cadastro','Cadastro','data']]},
    venda:{titulo:'Vendas', campos:[['codigo','Pedido'],['cliente','Cliente'],['data_venda','Data','data'],['quantidade_itens','Itens'],['valor_total','Total','moeda'],['status','Status']]},
    enderecos:{titulo:'Endereços', campos:[['cliente','Cliente'],['cep','CEP'],['logradouro','Logradouro'],['numero','Número'],['complemento','Complemento'],['bairro','Bairro'],['cidade','Cidade'],['estado','Estado']]}
  };
  const botoes=[...document.querySelectorAll('[data-relatorio]')];
  const tabela=document.getElementById('tabelaRelatorio');
  const titulo=document.getElementById('nomeRelatorio');
  const estado=document.getElementById('estadoRelatorio');
  const cab=document.getElementById('cabecalhoRelatorio');
  const corpo=document.getElementById('corpoRelatorio');
  let atual=0;
  const brl=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const data=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.valueOf())?'—':d.toLocaleDateString('pt-BR');};
  function celula(valor,tipo){if(valor===null||valor===undefined||valor==='')return '—';if(tipo==='moeda')return brl(valor);if(tipo==='data')return data(valor);return String(valor);}
  async function abrir(id){
    const def=definicoes[id]; if(!def)return;
    const numero=++atual;
    botoes.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.relatorio===id)));
    titulo.textContent=def.titulo; estado.textContent='Carregando registros...'; estado.classList.remove('erro');estado.hidden=false;
    tabela.hidden=true; corpo.replaceChildren();cab.replaceChildren();
    try{
      const resposta=await fetch('/api/relatorios/'+encodeURIComponent(id),{credentials:'same-origin'});
      const dados=await resposta.json();
      if(numero!==atual)return;
      if(!resposta.ok)throw new Error(dados.erro||'Falha na consulta.');
      if(!Array.isArray(dados))throw new Error('Resposta inesperada.');
      if(!dados.length){estado.textContent='Nenhum registro encontrado neste relatório.';return;}
      const linhaCab=document.createElement('tr');
      for(const [,rotulo] of def.campos){const th=document.createElement('th');th.scope='col';th.textContent=rotulo;linhaCab.append(th);}cab.append(linhaCab);
      const fragmento=document.createDocumentFragment();
      for(const item of dados){const linha=document.createElement('tr');for(const [campo,,tipo] of def.campos){const td=document.createElement('td');td.textContent=celula(item[campo],tipo);linha.append(td);}fragmento.append(linha);}
      corpo.append(fragmento);tabela.hidden=false;estado.hidden=true;
    }catch(e){if(numero!==atual)return;estado.classList.add('erro');estado.textContent=e.message||'Falha ao carregar o relatório.';}
  }
  botoes.forEach(b=>b.addEventListener('click',()=>abrir(b.dataset.relatorio)));
  abrir(new URLSearchParams(location.search).get('aba')||'categoria');
})();
