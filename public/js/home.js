/* ==========================================================
     Renderiza os cards a partir do catálogo e aplica filtros/busca.
   ========================================================== */
(function () {
  'use strict';
  const T = window.Tau;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const q = new URLSearchParams(location.search);

  // Links de categorias e marcas -> filtros
  $$('.listaCategorias a').forEach(a => {
    a.href = 'index.html?categoria=' + T.norm($('p', a).textContent);
  });
  $$('.listaMarcas a').forEach(a => {
    a.href = 'index.html?marca=' + T.norm($('img', a).alt);
  });

  // Botão "Comprar agora" do banner principal
  const bannerBtn = $('.bannerPrincipal .botaoComprar');
  if (bannerBtn) bannerBtn.href = 'produto.html?id=bola-trionda-pro';

  const filtros = {
    busca: q.get('busca'), categoria: q.get('categoria'), marca: q.get('marca'),
    genero: q.get('genero'), tag: q.get('tag'), outlet: q.get('outlet')
  };
  const filtrando = Object.values(filtros).some(Boolean);

  function filtrar() {
    return T.PRODUTOS.filter(p => {
      if (filtros.categoria) {
        const c = T.norm(filtros.categoria);
        if (c === 'calcados' ? !['tenis', 'chuteira'].includes(p.categoria) : p.categoria !== c) return false;
      }
      if (filtros.marca && T.norm(p.marca) !== T.norm(filtros.marca)) return false;
      if (filtros.genero && p.genero !== T.norm(filtros.genero)) return false;
      if (filtros.tag && !p.tags.includes(T.norm(filtros.tag))) return false;
      if (filtros.outlet && !p.precoDe) return false;
      if (filtros.busca) {
        const alvo = T.norm([p.nome, p.marca, p.categoria, p.genero].join(' '));
        if (!T.norm(filtros.busca).split(/\s+/).every(t => alvo.includes(t))) return false;
      }
      return true;
    });
  }

  if (!filtrando) {
    const ofertas = $('#carrosselOfertas .cardsCarrossel');
    const vendidos = $('#carrosselVendidos .cardsCarrossel');
    const novidades = $('#carrosselNovidades .cardsCarrossel');
    const novos = T.PRODUTOS.filter(p => p.tags.includes('novidade'));
    if (novidades && novos.length) {
      novidades.innerHTML = novos.map(T.cardHTML).join('');
      $('.novidades').hidden = false;
    }
    if (ofertas) ofertas.innerHTML = T.PRODUTOS.filter(p => p.tags.includes('oferta')).map(T.cardHTML).join('');
    if (vendidos) vendidos.innerHTML = T.PRODUTOS.filter(p => p.tags.includes('vendido')).map(T.cardHTML).join('');
    return;
  }

  // Modo resultados: esconde vitrines e mostra a lista filtrada
  ['.bannerPrincipal', '.ofertasDoDia', '.maisVendidos', '.novidades', '.colecoes'].forEach(s => {
    const el = $(s); if (el) el.remove();
  });
  const rotulo = filtros.busca ? 'RESULTADOS PARA "' + filtros.busca + '"'
    : filtros.outlet ? 'OUTLET'
    : String(filtros.categoria || filtros.marca || filtros.genero || filtros.tag).toUpperCase();
  const lista = filtrar();

  const sec = document.createElement('section');
  sec.className = 'maisVendidos';
  sec.innerHTML = '<h2></h2>' + (lista.length
    ? '<div class="cardsContainer">' + lista.map(T.cardHTML).join('') + '</div>'
    : '<p class="listaVazia">Nenhum produto encontrado. <a href="index.html">Ver todos os produtos</a></p>');
  $('h2', sec).textContent = rotulo;
  const ref = $('.naTauTem');
  ref.parentNode.insertBefore(sec, ref.nextSibling);
})();
