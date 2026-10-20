// Objetivo: Faz os botões dos carrosséis avançarem e retrocederem.
/* ==========================================================
   TAÚ SPORTS — carrossel.js
   Comportamento dos carrosséis de produtos (partials/carrossel.ejs).
   - Botões anterior/próximo avançam por "páginas" de cards inteiros
   - Botões somem quando não há o que rolar (ou no início/fim)
   - Funciona com os cards inseridos depois via JS (MutationObserver)
   - No toque, o usuário simplesmente arrasta (rolagem nativa)
   ========================================================== */
(function () {
  'use strict';

  function iniciar(raiz) {
    if (raiz.dataset.carrosselPronto) {
      return;
    }

    const pista = raiz.querySelector('.cardsCarrossel');
    const anterior = raiz.querySelector('.carrossel__botao--anterior');
    const proximo = raiz.querySelector('.carrossel__botao--proximo');
    if (!pista || !anterior || !proximo) {
      return;
    }
    raiz.dataset.carrosselPronto = '1';

    let quadro = 0;

    function atualizar() {
      quadro = 0;
      const max = pista.scrollWidth - pista.clientWidth;
      const temRolagem = max > 2;
      anterior.hidden = proximo.hidden = !temRolagem;
      anterior.disabled = pista.scrollLeft <= 2;
      proximo.disabled = pista.scrollLeft >= max - 2;
    }

    function agendar() {
      if (!quadro) quadro = requestAnimationFrame(atualizar);
    }

    /* distância de uma "página": quantos cards inteiros cabem na área visível */
    function passo() {
      const card = pista.querySelector('.cardProduto');
      if (!card) {
        return pista.clientWidth;
      }
      const estilo = getComputedStyle(pista);
      const gap = parseFloat(estilo.columnGap) || 0;
      const util = pista.clientWidth - (parseFloat(estilo.paddingLeft) || 0) - (parseFloat(estilo.paddingRight) || 0);
      const largura = card.getBoundingClientRect().width + gap;
      return largura * Math.max(1, Math.floor((util + gap) / largura));
    }

    function rolar(direcao) {
      pista.scrollBy({ left: direcao * passo(), behavior: 'smooth' });
    }

    anterior.addEventListener('click', () => rolar(-1));
    proximo.addEventListener('click', () => rolar(1));

    pista.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); rolar(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); rolar(-1); }
    });

    pista.addEventListener('scroll', agendar, { passive: true });
    window.addEventListener('resize', agendar);
    if ('ResizeObserver' in window) new ResizeObserver(agendar).observe(pista);
    if ('MutationObserver' in window) new MutationObserver(agendar).observe(pista, { childList: true });

    atualizar();
  }

  function iniciarTodos() {
    document.querySelectorAll('[data-carrossel]').forEach(iniciar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarTodos);
  } else {
    iniciarTodos();
  }

  window.Tau = window.Tau || {};
  window.Tau.iniciarCarrosseis = iniciarTodos;
})();
