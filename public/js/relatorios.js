/* Dashboard e relatórios administrativos: somente dados reais da API, sem números de demonstração. */
(function () {
  'use strict';
  const definicoes = {
    categoria: { titulo:'Categorias', campos:[['codigo','Código'],['categoria','Categoria'],['quantidade_produtos','Produtos'],['preco_medio','Preço médio','moeda']] },
    marca: { titulo:'Marcas', campos:[['codigo','Código'],['marca','Marca'],['quantidade_produtos','Produtos'],['preco_medio','Preço médio','moeda']] },
    cliente: { titulo:'Clientes', campos:[['codigo','Código'],['nome','Nome'],['email','E-mail'],['telefone','Telefone'],['data_cadastro','Cadastro','data']] },
    venda: { titulo:'Vendas', campos:[['codigo','Pedido'],['cliente','Cliente'],['data_venda','Data','data'],['quantidade_itens','Itens'],['valor_total','Total','moeda'],['status','Status'],['__acoes','Atualizar status']] },
    enderecos: { titulo:'Endereços', campos:[['codigo','Código'],['cliente','Cliente'],['cep','CEP'],['logradouro','Logradouro'],['numero','Número'],['complemento','Complemento'],['bairro','Bairro'],['cidade','Cidade'],['estado','UF']] }
  };
  const $ = id => document.getElementById(id);
  const statusDisponiveis = ['Aguardando pagamento','Em separação','Em transporte','Entregue'];
  const dinheiro = n => Number(n || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const inteiro = n => Number(n || 0).toLocaleString('pt-BR');
  function data(v) {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.valueOf()) ? '—' : d.toLocaleDateString('pt-BR');
  }
  function celula(valor, tipo) {
    if (valor === null || valor === undefined || valor === '') return '—';
    if (tipo === 'moeda') return dinheiro(valor);
    if (tipo === 'data') return data(valor);
    return String(valor);
  }
  function elemento(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }
  function vazio(mensagem) { return elemento('p','vazioDashboard',mensagem); }
  function controleStatus(pedido) {
    const grupo=elemento('div','controleStatusPedido');
    const seletor=elemento('select','seletorStatusPedido');
    seletor.setAttribute('aria-label','Novo status do pedido #'+pedido.codigo);
    if (pedido.status && !statusDisponiveis.includes(pedido.status)) {
      const atual=elemento('option','',pedido.status);atual.value=pedido.status;atual.selected=true;seletor.append(atual);
    }
    statusDisponiveis.forEach(status=>{
      const opcao=elemento('option','',status);opcao.value=status;opcao.selected=status===pedido.status;seletor.append(opcao);
    });
    const botao=elemento('button','botaoSalvarStatus','Salvar');
    botao.type='button';botao.dataset.salvarStatus='';botao.dataset.pedidoId=String(pedido.codigo);
    grupo.append(seletor,botao);
    return grupo;
  }
  function periodoLabel(valor,periodo) {
    const s = String(valor);
    if (periodo === '90d') return 'S' + s.slice(-2);
    if (/^\d{4}-\d\d-\d\d$/.test(s)) return s.slice(8,10)+'/'+s.slice(5,7);
    if (/^\d{4}-\d\d$/.test(s)) return s.slice(5,7)+'/'+s.slice(2,4);
    return s;
  }
  function desenharVendas(linhas,periodo) {
    const alvo=$('graficoVendas'); alvo.replaceChildren();
    if (!linhas.length) return alvo.append(vazio('Nenhum pedido registrado neste período.'));
    const max = Math.max(1,...linhas.map(l => Number(l.total) || 0));
    for (const item of linhas) {
      const coluna=elemento('div','colunaGrafico');
      const area=elemento('div','alturaGrafico');
      const barra=elemento('span','barraGrafico');
      const n=Number(item.total) || 0;
      barra.style.height = Math.max(1,100*n/max)+'%';
      barra.title=periodoLabel(item.periodo,periodo)+': '+dinheiro(n)+' · '+inteiro(item.pedidos)+' pedidos';
      area.append(barra);
      coluna.append(area,elemento('span','rotuloGrafico',periodoLabel(item.periodo,periodo)));
      alvo.append(coluna);
    }
  }
  function desenharBarras(id,linhas) {
    const alvo=$(id); alvo.replaceChildren();
    if (!linhas.length) return alvo.append(vazio('Ainda não há dados para exibir.'));
    const maior=Math.max(1,...linhas.map(x=>Number(x.unidades)||0));
    for (const item of linhas) {
      const linha=elemento('div','linhaGrafico');
      const titulo=elemento('span','nomeGrafico',item.nome||'Não informado');
      titulo.title=item.nome||'Não informado';
      const trilho=elemento('div','trilhoGrafico');
      const barra=elemento('span');
      barra.style.width=(Math.max(0,Number(item.unidades)||0)/maior*100)+'%';
      trilho.append(barra);
      linha.append(titulo,trilho,elemento('span','numeroGrafico',inteiro(item.unidades)));
      alvo.append(linha);
    }
  }
  function desenharRanking(id,linhas,chave) {
    const alvo=$(id); alvo.replaceChildren();
    if (!linhas.length) return alvo.append(vazio('Nenhum registro encontrado.'));
    linhas.forEach((item,i)=>{
      const linha=elemento('div','itemRanking');
      const nome=elemento('span','nomeRanking',item.nome||'Não informado');
      nome.title=item.nome||'Não informado';
      linha.append(elemento('span','numeroRanking',String(i+1).padStart(2,'0')),nome,
        elemento('strong','',inteiro(item[chave])));
      alvo.append(linha);
    });
  }
  function confirmado(status) {
    return ['Pago','Pagamento aprovado','Em separação','Enviado','Em transporte','Entregue','Concluído'].includes(status);
  }
  function desenharRecentes(dados) {
    const corpo=$('listaPedidosRecentes'); corpo.replaceChildren();
    if (!dados.length) {
      const tr=elemento('tr'),td=elemento('td','registroVazio','Ainda não há pedidos no período.');
      td.colSpan=6;tr.append(td);corpo.append(tr);return;
    }
    for (const pedido of dados) {
      const linha=elemento('tr');
      linha.append(elemento('td','', '#'+pedido.codigo),elemento('td','',pedido.cliente),
        elemento('td','',data(pedido.data)));
      const status=elemento('td'),chip=elemento('span','chipStatus'+(confirmado(pedido.status)?' confirmado':''),pedido.status);
      status.append(chip);const editar=elemento('td');editar.append(controleStatus(pedido));
      linha.append(status,elemento('td','colunaValor',dinheiro(pedido.valor)),editar);
      corpo.append(linha);
    }
  }
  let versaoDashboard=0;
  async function carregarDashboard() {
    const ver=++versaoDashboard;
    const periodo=$('periodoDashboard').value;
    const status=$('statusDashboard');
    status.textContent='Atualizando indicadores da loja...';status.classList.remove('erro');status.hidden=false;
    $('atualizarDashboard').disabled=true;
    try {
      const resposta=await fetch('/api/relatorios/dashboard?periodo='+encodeURIComponent(periodo),{credentials:'same-origin'});
      const dados=await resposta.json();
      if (ver!==versaoDashboard)return;
      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível consultar os indicadores.');
      const r=dados.resumo;
      $('metricaValor').textContent=dinheiro(r.total_pedidos);
      $('metricaPedidos').textContent=inteiro(r.pedidos);
      $('metricaTicket').textContent=dinheiro(r.ticket_medio);
      $('metricaClientes').textContent=inteiro(r.clientes);
      $('metricaProdutos').textContent=inteiro(r.produtos);
      $('metricaPendentes').textContent=inteiro(r.aguardando);
      $('metricaConfirmado').textContent=dinheiro(r.valor_confirmado);
      desenharVendas(dados.evolucao,periodo);
      desenharBarras('graficoCategorias',dados.categorias);
      desenharBarras('graficoMarcas',dados.marcas);
      desenharRanking('listaProdutos',dados.produtos,'unidades');
      desenharRanking('listaStatus',dados.status.map(s=>({nome:s.nome,quantidade:s.quantidade})),'quantidade');
      desenharRecentes(dados.recentes);
      $('painelDashboard').hidden=false;
      status.hidden=true;
    } catch(e) {
      if (ver!==versaoDashboard)return;
      status.textContent=e.message||'Não foi possível carregar o dashboard.';status.classList.add('erro');
    } finally {
      if (ver===versaoDashboard)$('atualizarDashboard').disabled=false;
    }
  }
  let versaoRelatorio=0;
  async function abrirRelatorio(id,atualizarUrl=true) {
    if (!Object.hasOwn(definicoes,id))return;
    const versao=++versaoRelatorio, def=definicoes[id];
    const container=$('painelDetalhe'),estado=$('estadoRelatorio'), tabela=$('tabelaRelatorio');
    container.hidden=false;
    $('nomeRelatorio').textContent='Relatório de '+def.titulo.toLowerCase();
    estado.hidden=false;estado.classList.remove('erro');estado.textContent='Carregando registros...';
    tabela.hidden=true;$('cabecalhoRelatorio').replaceChildren();$('corpoRelatorio').replaceChildren();
    document.querySelectorAll('[data-relatorio]').forEach(a => {
      if (a.dataset.relatorio===id)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current');
    });
    if (atualizarUrl) history.replaceState(null,'','?aba='+encodeURIComponent(id));
    try {
      const resposta=await fetch('/api/relatorios/'+encodeURIComponent(id),{credentials:'same-origin'});
      const dados=await resposta.json();
      if (versao!==versaoRelatorio)return;
      if (!resposta.ok)throw new Error(dados.erro||'Não foi possível consultar o relatório.');
      if (!Array.isArray(dados))throw new Error('Resposta inesperada do servidor.');
      if (!dados.length){estado.textContent='Nenhum registro encontrado neste relatório.';return;}
      const linhaCab=elemento('tr');
      for (const [,rotulo] of def.campos) {
        const th=elemento('th','',rotulo);th.scope='col';linhaCab.append(th);
      }
      $('cabecalhoRelatorio').append(linhaCab);
      const fragmento=document.createDocumentFragment();
      for (const item of dados) {
        const linha=elemento('tr');
        for (const [campo,,tipo] of def.campos) {
          const td=elemento('td');
          if (campo==='__acoes') td.append(controleStatus(item));
          else td.textContent=celula(item[campo],tipo);
          linha.append(td);
        }
        fragmento.append(linha);
      }
      $('corpoRelatorio').append(fragmento);tabela.hidden=false;estado.hidden=true;
      // Na navegação por cards, leva o usuário à tabela efetivamente carregada.
      container.scrollIntoView({behavior:'smooth',block:'start'});
    } catch(e) {
      if (versao!==versaoRelatorio)return;
      estado.textContent=e.message||'Erro ao carregar relatório.';estado.classList.add('erro');
    }
  }
  document.querySelectorAll('[data-relatorio],[data-abrir]').forEach(a=>a.addEventListener('click',ev=>{
    ev.preventDefault();abrirRelatorio(a.dataset.relatorio||a.dataset.abrir);
  }));
  $('fecharRelatorio').addEventListener('click',()=>{
    versaoRelatorio++;$('painelDetalhe').hidden=true;
    document.querySelectorAll('[data-relatorio]').forEach(a=>a.removeAttribute('aria-current'));
    history.replaceState(null,'',location.pathname);
  });
  $('periodoDashboard').addEventListener('change',carregarDashboard);
  $('atualizarDashboard').addEventListener('click',carregarDashboard);
  document.addEventListener('click',async ev=>{
    const botao=ev.target.closest('[data-salvar-status]');
    if (!botao) return;
    const grupo=botao.closest('.controleStatusPedido'), seletor=grupo?.querySelector('select');
    const mensagem=$('mensagemStatusPedido');
    botao.disabled=true;botao.textContent='Salvando...';
    try {
      const resposta=await fetch('/api/pedidos/'+encodeURIComponent(botao.dataset.pedidoId)+'/status',{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':window.Tau.csrfToken},
        body:JSON.stringify({status:seletor.value})
      });
      const dados=await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro||'Não foi possível alterar o status.');
      mensagem.textContent='Status do pedido #'+dados.idPedido+' atualizado para '+dados.status+'.';
      mensagem.classList.remove('erro');mensagem.hidden=false;
      await carregarDashboard();
      if (new URLSearchParams(location.search).get('aba')==='venda') await abrirRelatorio('venda',false);
    } catch(erro) {
      mensagem.textContent=erro.message||'Não foi possível alterar o status.';
      mensagem.classList.add('erro');mensagem.hidden=false;
    } finally {
      botao.disabled=false;botao.textContent='Salvar';
    }
  });
  window.addEventListener('popstate',()=>{
    const aba=new URLSearchParams(location.search).get('aba');
    if (Object.hasOwn(definicoes,aba))abrirRelatorio(aba,false);
    else {$('painelDetalhe').hidden=true;document.querySelectorAll('[data-relatorio]').forEach(a=>a.removeAttribute('aria-current'));}
  });
  carregarDashboard();
  const aba=new URLSearchParams(location.search).get('aba');
  if (aba && Object.hasOwn(definicoes,aba)) abrirRelatorio(aba,false);
})();
