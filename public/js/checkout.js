/* ==========================================================
   Itens do carrinho, quantidades, cupom, frete, forma de
   pagamento, endereço e criação do pedido.
   ========================================================== */
(function () {
  'use strict';
  const T = window.Tau;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const lista = $('.itensCompra');
  const [cardResumo, cardPagamento] = $$('.cardCheckout');
  let metodo = 'cartao';
  let editandoCupom = false;
  let enderecoServidor = null;
  async function consultarEndereco() {
    try { const r=await fetch('/api/enderecos'); if(r.ok){const dados=await r.json();enderecoServidor=dados[0] || null;renderPagamento();} }
    catch(e){T.toast('Não foi possível consultar o endereço salvo.');}
  }

  const nomeBandeira = { visa: 'Visa', mastercard: 'Mastercard' };

  /* ----- Itens ----- */
  function renderItens() {
    $$('.itemCarrinho, .carrinhoVazio', lista).forEach(el => el.remove());
    const itens = T.carrinho.itens();
    if (!itens.length) {
      lista.insertAdjacentHTML('beforeend',
        '<p class="carrinhoVazio">Seu carrinho está vazio. <a href="index.html">Explorar produtos da loja</a></p>');
      return;
    }
    lista.insertAdjacentHTML('beforeend', itens.map(i => {
      const p = T.produto(i.id), chave = T.esc(T.carrinho.chave(i));
      return `
        <article class="itemCarrinho" data-chave="${chave}">
            <img src="${T.esc(p.imagens[0])}" alt="${T.esc(p.nome)}">
            <div class="itemInfo">
                <h2><a href="produto.html?id=${encodeURIComponent(p.id)}" style="color:inherit;text-decoration:none">${T.esc(p.nome)}</a></h2>
                <p>Tamanho: <strong>${T.esc(i.tamanho)}</strong></p>
                <p>Cor: <strong>${T.esc(i.cor)}</strong></p>
            </div>
            <button class="botaoExcluir" type="button" data-acao="remover">Excluir</button>
            <div class="itemRodape">
                <div class="quantidade">
                    <span>Quantidade:</span>
                    <button type="button" data-acao="menos" aria-label="Diminuir quantidade"${i.qtd <= 1 ? ' disabled' : ''}>−</button>
                    <strong>${i.qtd}</strong>
                    <button type="button" data-acao="mais" aria-label="Aumentar quantidade"${i.qtd >= T.CONFIG.MAX_QTD_POR_ITEM ? ' disabled' : ''}>+</button>
                </div>
                <div class="precoItem">
                    <strong>${T.brl(p.preco * i.qtd, true)}</strong>
                    <small>ou em até ${p.parcelas}x de ${T.brl(p.preco * i.qtd / p.parcelas)}</small>
                </div>
            </div>
            <a href="index.html" class="linkPequeno">Explorar mais produtos da loja</a>
        </article>`;
    }).join(''));
  }

  lista.addEventListener('click', e => {
    const btn = e.target.closest('button[data-acao]');
    const item = e.target.closest('.itemCarrinho');
    if (!btn || !item) return;
    const chave = item.dataset.chave;
    if (btn.dataset.acao === 'remover') T.carrinho.remover(chave);
    if (btn.dataset.acao === 'mais') T.carrinho.alterarQtd(chave, 1);
    if (btn.dataset.acao === 'menos') T.carrinho.alterarQtd(chave, -1);
  });

  /* ----- Resumo ----- */
  function renderResumo() {
    const t = T.carrinho.totais({ metodo });
    const vazio = t.qtd === 0;
    const cupomHTML = t.cupom
      ? `<span><strong>− ${T.brl(t.descontoCupom, true)}</strong> <a href="#" data-acao="removerCupom">Remover</a></span>`
      : editandoCupom
        ? `<form class="tauCupomForm" data-acao="formCupom"><input name="codigo" placeholder="CÓDIGO" aria-label="Código do cupom" autocomplete="off"><button type="submit">Aplicar</button></form>`
        : `<a href="#" data-acao="cupom">Adicionar</a>`;
    const n = T.parcelasMax(t.total);

    cardResumo.innerHTML = `
      <h2 id="tituloResumo">Resumo da compra</h2>
      <div class="linhaResumo"><span>Subtotal (${t.qtd} ${t.qtd === 1 ? 'item' : 'itens'})</span><strong>${T.brl(t.subtotal, true)}</strong></div>
      ${t.descontoPix ? `<div class="linhaResumo"><span>Desconto PIX</span><strong>− ${T.brl(t.descontoPix, true)}</strong></div>` : ''}
      <div class="linhaResumo"><span>Valor do frete</span>${t.frete === 0 ? '<strong class="freteGratis">Frete Grátis</strong>' : `<strong>${T.brl(t.frete, true)}</strong>`}</div>
      <div class="linhaResumo"><span>Cupom de desconto${t.cupom ? ' (' + T.esc(t.cupom) + ')' : ''}</span>${cupomHTML}</div>
      <div class="linhaResumo total"><span>Valor Total</span><div><strong>${T.brl(t.total, true)}</strong>${vazio ? '' : `<small>ou em até ${n}x de ${T.brl(t.total / n)}</small>`}</div></div>
      ${t.economia > 0 ? `<p class="economia">Você está economizando ${T.brl(t.economia, true)}</p>` : ''}
      <button class="botaoPagamento" type="button" data-acao="pagar"${vazio ? ' disabled' : ''}>Confirmar pedido</button><small>O pagamento não é capturado pelo site; o pedido ficará aguardando pagamento.</small>`;
    const inp = $('.tauCupomForm input', cardResumo);
    if (inp) inp.focus();
  }

  cardResumo.addEventListener('click', e => {
    const el = e.target.closest('[data-acao]');
    if (!el) return;
    const acao = el.dataset.acao;
    if (acao === 'cupom') { e.preventDefault(); editandoCupom = true; renderResumo(); }
    if (acao === 'removerCupom') { e.preventDefault(); T.carrinho.removerCupom(); renderResumo(); }
    if (acao === 'pagar') pagar(el);
  });
  cardResumo.addEventListener('submit', e => {
    e.preventDefault();
    const codigo = new FormData(e.target).get('codigo');
    if (T.carrinho.aplicarCupom(codigo)) { editandoCupom = false; T.toast('Cupom aplicado.'); }
    else T.toast('Cupom inválido.');
    renderResumo();
  });

  /* ----- Pagamento / endereço ----- */
  function renderPagamento() {
    const metodos = $$('.metodoPagamento', cardPagamento);
    ['cartao', 'pix', 'boleto'].forEach((v, i) => {
      const r = $('input[type=radio]', metodos[i]);
      if (r) { r.value = v; r.checked = v === metodo; }
      metodos[i].classList.toggle('ativo', v === metodo);
    });

    const cartao = T.cartoes.creditoPadrao();
    const resumo = $('.cartaoResumo', cardPagamento);
    if (resumo) {
      resumo.innerHTML = cartao
        ? `<span class="iconeCartao"><img src="/imagensUCE/${T.esc(cartao.bandeira)}.svg" alt=""></span>
           <strong>${T.esc(nomeBandeira[cartao.bandeira] || 'Cartão')}</strong>
           <small>•••• •••• •••• ${T.esc(cartao.final)}</small>`
        : '<strong>Nenhum cartão de crédito salvo</strong>';
    }
    const alterar = $('.acoesPagamento a', cardPagamento);
    if (alterar) alterar.href = 'cartoessalvos.html';
    const dois = $$('.acoesPagamento a', cardPagamento)[1];
    if (dois) dois.addEventListener('click', e => { e.preventDefault(); T.toast('Pagamento com 2 cartões ainda não está disponível.'); });

    const end = enderecoServidor;
    const box = $('.enderecoEntrega', cardPagamento);
    const [l1, l2] = $$('p', box);
    if (end && end.endereco) {
      l1.innerHTML = '<strong></strong>';
      $('strong', l1).textContent = end.endereco + ', ' + end.numero;
      l2.textContent = [end.bairro, end.cidade, end.estado].filter(Boolean).join(' - ');
    } else {
      l1.innerHTML = '<strong>Nenhum endereço cadastrado</strong>';
      l2.textContent = '';
    }
    $('a', box).href = 'endereco.html';
  }

  cardPagamento.addEventListener('change', e => {
    if (e.target.name !== 'pagamento') return;
    metodo = e.target.value;
    $$('.metodoPagamento', cardPagamento).forEach(m => m.classList.toggle('ativo', $('input', m) === e.target));
    renderResumo();
  });

  async function pagar(btn) {
    const itens = T.carrinho.itens();
    if (!itens.length) return T.toast('Seu carrinho está vazio.');
    if (!T.auth.usuario()) {
      T.toast('Faça login para finalizar a compra.');
      return setTimeout(() => { location.href = 'login.html?next=finalizarcompra.html'; }, 1000);
    }
    const end = enderecoServidor;
    if (!end || !end.cep || !end.endereco) {
      T.toast('Cadastre um endereço de entrega.');
      return setTimeout(() => { location.href = 'endereco.html'; }, 1200);
    }
    if (metodo === 'cartao' && !T.cartoes.creditoPadrao()) {
      T.toast('Adicione um cartão de teste antes de finalizar com cartão.');
      return;
    }
    // Sem processador de pagamentos integrado: nunca cobrar um cartão pelo navegador.

    btn.disabled = true; btn.textContent = 'Salvando pedido...';
    try {
      const r=await fetch('/api/pedidos',{
        method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':T.csrfToken},
        body:JSON.stringify({ metodo, cupom:T.carrinho.cupomAtual(), itens:itens.map(i=>({id:i.id,tamanho:i.tamanho,cor:i.cor,qtd:i.qtd})) })
      });
      const resultado=await r.json();
      if(!r.ok)throw Error(resultado.erro || 'Falha ao registrar pedido.');
      T.carrinho.limpar();
      T.toast('Pedido #' + resultado.id + ' registrado no MySQL. Pagamento pendente.');
      setTimeout(() => { location.href='pedidos.html'; },1000);
    } catch(err) {
      btn.disabled=false;btn.textContent='Confirmar pedido';T.toast(err.message);
    }
  }

  document.addEventListener('carrinho:mudou', () => { renderItens(); renderResumo(); });
  renderItens(); renderResumo(); renderPagamento(); consultarEndereco();
})();
