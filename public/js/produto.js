// Objetivo: Exibe os detalhes do produto e permite adicioná-lo ao carrinho.
/* ==========================================================
   Monta a página a partir do catálogo, seleção de tamanho/cor,
   carrinho, "Comprar" e lightbox da galeria.
   ========================================================== */
(function () {
  'use strict';
  const T = window.Tau;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const id = new URLSearchParams(location.search).get('id') || 'adidas-campus-00s';
  const p = T.produto(id);
  if (!p) {
    $('main').innerHTML = '<p class="listaVazia" style="padding:3rem 1.5rem">Produto não encontrado. <a href="index.html">Voltar para a loja</a></p>';
    return;
  }
  document.title = p.nome + ' | Taú Sports';

  const rotulo = { tenis: 'Tênis', camiseta: 'Camiseta', chuteira: 'Chuteira', mochila: 'Mochila', acessorio: 'Acessório', bone: 'Boné', shorts: 'Shorts' };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ----- Breadcrumb ----- */
  const bc = $$('.breadcrumb a');
  if (bc.length >= 3) {
    bc[0].href = 'index.html';
    bc[1].textContent = cap(p.genero); bc[1].href = 'index.html?genero=' + p.genero;
    bc[2].textContent = rotulo[p.categoria] || cap(p.categoria); bc[2].href = 'index.html?categoria=' + p.categoria;
  }
  $('.breadcrumb__atual').textContent = p.nome;

  /* ----- Galeria ----- */
  $('.galeria__grid').innerHTML = p.imagens.map((src, i) => `
    <div class="galeria__item${i === 0 ? ' galeria__item--principal' : ''}">
        <img src="${T.esc(src)}" alt="${T.esc(p.nome)} - foto ${i + 1}">
    </div>`).join('');
  const verMais = $('.galeria__ver-mais');
  if (p.imagens.length < 2) verMais.hidden = true;

  /* ----- Especificações ----- */
  const conteudos = $$('.espec__conteudo');
  if (conteudos[0]) conteudos[0].innerHTML = p.tamanhos.length > 1
    ? '<p>Consulte o nosso guia de tamanhos para encontrar o número ideal para você.</p>'
    : '<p>Produto de tamanho único.</p>';
  if (conteudos[1]) conteudos[1].innerHTML = '<p>' + T.esc(p.descricao) + '</p>';
  if (conteudos[2]) conteudos[2].innerHTML = '<ul>' + p.detalhes.map(d => '<li>' + T.esc(d) + '</li>').join('') + '</ul>';

  /* ----- Sugestões ----- */
  $('#carrosselSugestoes .cardsCarrossel').innerHTML = T.PRODUTOS.filter(x => x.id !== p.id).map(T.cardHTML).join('');

  /* ----- Compra ----- */
  $('.compra__nome').textContent = p.nome;
  const de = $('.preco__de');
  if (p.precoDe) {
    de.innerHTML = 'de <s>' + T.brl(p.precoDe) + '</s>';
  } else {
    de.hidden = true;
  }
  $('.preco__por').textContent = T.brl(p.preco);
  const parc = $('.preco__parcelamento');
  parc.textContent = 'ou até ' + p.parcelas + 'x ' + T.brl(p.preco / p.parcelas) + ' sem juros';
  if (p.descontoPix) {
    const pix = document.createElement('p');
    pix.className = 'preco__parcelamento';
    pix.textContent = 'ou ' + T.brl(p.preco * (1 - p.descontoPix / 100)) + ' no PIX (' + p.descontoPix + '% OFF)';
    parc.after(pix);
  }

  const gridTam = $('.tamanhos__grid');
  gridTam.innerHTML = p.tamanhos.map(t => `<button class="tamanho" type="button" aria-pressed="false">${T.esc(t)}</button>`).join('');
  if (p.tamanhos.length === 1) {
    const botaoTamanho = $('.tamanho', gridTam);
    botaoTamanho.classList.add('ativo');
    botaoTamanho.setAttribute('aria-pressed', 'true');
  }
  const guia = $('.tamanhos__guia');
  if (p.tamanhos.length === 1 && guia) guia.hidden = true;

  $('.cores__grid').innerHTML = p.cores.map((c, i) => `
    <button class="cor${i === 0 ? ' ativo' : ''}" type="button" aria-label="${T.esc(c.nome)}" aria-pressed="${i === 0}">
        <img src="${T.esc(c.imagem)}" alt="Variação ${T.esc(c.nome.toLowerCase())}">
    </button>`).join('');

  function selecionar(container, seletor, alvo) {
    $$(seletor, container).forEach(b => { b.classList.remove('ativo'); b.setAttribute('aria-pressed', 'false'); });
    alvo.classList.add('ativo'); alvo.setAttribute('aria-pressed', 'true');
    gridTam.classList.remove('tauErro');
  }
  gridTam.addEventListener('click', e => { const b = e.target.closest('.tamanho'); if (b) selecionar(gridTam, '.tamanho', b); });
  const gridCor = $('.cores__grid');
  gridCor.addEventListener('click', e => { const b = e.target.closest('.cor'); if (b) selecionar(gridCor, '.cor', b); });

  function escolha() {
    const t = $('.tamanho.ativo', gridTam);
    if (!t) {
      gridTam.classList.add('tauErro');
      gridTam.scrollIntoView({ behavior: 'smooth', block: 'center' });
      T.toast('Selecione um tamanho.');
      return null;
    }
    const c = $('.cor.ativo', gridCor);
    return { tamanho: t.textContent.trim(), cor: c ? c.getAttribute('aria-label') : p.cores[0].nome };
  }

  $('.btn-carrinho').addEventListener('click', () => {
    const e = escolha(); if (!e) return;
    T.carrinho.adicionar(p.id, e);
    T.toast('Produto adicionado ao carrinho.');
  });
  $('.btn-comprar').addEventListener('click', () => {
    const e = escolha(); if (!e) return;
    T.carrinho.adicionar(p.id, e);
    location.href = 'finalizarcompra.html';
  });

  /* ----- Lightbox ----- */
  const lb = $('#lightbox'), lbImg = $('#lightboxImg'), lbCont = $('#lightboxContador');
  const fotos = $$('.galeria__item img');
  let atual = 0;
  const mostrar = i => {
    atual = (i + fotos.length) % fotos.length;
    lbImg.src = fotos[atual].src; lbImg.alt = fotos[atual].alt;
    lbCont.textContent = (atual + 1) + ' / ' + fotos.length;
  };
  const abrir = i => { mostrar(i); lb.classList.add('aberto'); document.body.style.overflow = 'hidden'; };
  const fechar = () => { lb.classList.remove('aberto'); document.body.style.overflow = ''; };

  fotos.forEach((img, i) => {
    img.parentElement.style.cursor = 'zoom-in';
    img.parentElement.addEventListener('click', () => abrir(i));
  });
  verMais.addEventListener('click', () => abrir(0));
  $('#lightboxFechar').addEventListener('click', fechar);
  $('#lightboxAnterior').addEventListener('click', () => mostrar(atual - 1));
  $('#lightboxProximo').addEventListener('click', () => mostrar(atual + 1));
  lb.addEventListener('click', e => { if (e.target === lb) fechar(); });
  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('aberto')) return;
    if (e.key === 'Escape') fechar();
    if (e.key === 'ArrowLeft') mostrar(atual - 1);
    if (e.key === 'ArrowRight') mostrar(atual + 1);
  });
})();
