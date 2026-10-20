/* ==========================================================
   TAÚ SPORTS — core.js
   Catálogo, utilitários, sessão, carrinho, cartões e header.
   Carregar ANTES dos demais scripts, em todas as páginas.
   ========================================================== */
(function () {
  'use strict';

  const T = (window.Tau = {});
  const IMG = '/imagensUCE/';

  /* ---------- CONFIGURAÇÃO ---------- */
  T.CONFIG = {
    FRETE_GRATIS_A_PARTIR_DE: 299.99,
    FRETE_FIXO: 19.9,
    MAX_PARCELAS: 10,
    MIN_PARCELA: 50,
    MAX_QTD_POR_ITEM: 10
  };

  T.CUPONS = {
    TAU10:       { tipo: 'pct',   valor: 10, texto: '10% de desconto' },
    BEMVINDO:    { tipo: 'valor', valor: 20, texto: 'R$ 20,00 de desconto' },
    FRETEGRATIS: { tipo: 'frete',            texto: 'Frete grátis' }
  };

  /* ---------- DADOS RENDERIZADOS PELO SERVIDOR ---------- */
  const contexto = JSON.parse(document.getElementById('tau-contexto').textContent);
  T.PRODUTOS = contexto.produtos;
  T.csrfToken = contexto.csrfToken;

  T.produto = function (id) {
    const encontrado = T.PRODUTOS.find(function (produto) {
      return produto.id === id;
    });
    return encontrado || null;
  };

  /* ---------- UTILITÁRIOS ---------- */
  T.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  T.brl = (n, espaco) => 'R$' + (espaco ? ' ' : '') +
    Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  T.norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  T.validaEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
  T.pagina = () => location.pathname.split('/').pop().replace('.html', '') || 'index';

  const chaveLocal = k => ['perfil', 'endereco', 'cartoes', 'pedidos'].includes(k)
    ? 'tau:usuario:' + (contexto.usuario ? contexto.usuario.id : 'visitante') + ':' + k : 'tau:' + k;
  T.store = {
    get(chave, valorPadrao) {
      try {
        const salvo = localStorage.getItem(chaveLocal(chave));
        if (salvo === null) {
          return valorPadrao;
        }
        return JSON.parse(salvo);
      } catch (erro) {
        return valorPadrao;
      }
    },
    set(chave, valor) {
      try {
        localStorage.setItem(chaveLocal(chave), JSON.stringify(valor));
        return true;
      } catch (erro) {
        return false;
      }
    },
    del(chave) {
      try {
        localStorage.removeItem(chaveLocal(chave));
      } catch (erro) {
        // Se o navegador bloquear o armazenamento, não quebrar a página.
      }
    }
  };

  T.mask = {
    cep: v => v.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2'),
    telefone: v => {
      v = v.replace(/\D/g, '').slice(0, 11);
      if (v.length > 10) return v.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
      if (v.length > 6) return v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
      if (v.length > 2) return v.replace(/^(\d{2})(\d*)/, '($1) $2');
      return v;
    }
  };
  T.aplicarMascara = (input, fn) => {
    if (!input) return;
    input.value = fn(input.value);
    input.addEventListener('input', () => { input.value = fn(input.value); });
  };

  /* ---------- ESTILOS INJETADOS (badge, toast, menu mobile) ---------- */
  const css = document.createElement('style');
  css.textContent = `
    .iconesHeader a{position:relative}
    .tauBadge{position:absolute;top:-8px;right:-10px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;
      background:#FFD600;color:#000;font:700 11px/18px Rubik,sans-serif;text-align:center}
    .tauBadge[hidden]{display:none}
    #tauToast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,20px);opacity:0;pointer-events:none;z-index:9999;
      background:#1E1E1E;color:#fff;padding:12px 20px;border-left:4px solid #FFD600;border-radius:6px;
      font:500 14px Rubik,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.35);transition:.25s;max-width:90vw}
    #tauToast.on{opacity:1;transform:translate(-50%,0)}
    .carrinhoVazio,.listaVazia{padding:2rem 0;font-size:1rem}
    .carrinhoVazio a,.listaVazia a{font-weight:600}
    .tauCupomForm{display:flex;gap:.5rem}
    .tauCupomForm input{width:120px;padding:.35rem .5rem;text-transform:uppercase}
    .tauCupomForm button{padding:.35rem .75rem;cursor:pointer}
    .tauErro{outline:2px solid #d32f2f;outline-offset:4px;border-radius:6px}
    .tauDetalhes{margin-top:.5rem;font-size:.9rem;line-height:1.5}
    .tauDetalhes[hidden]{display:none}
    @media (max-width:900px){
      .linha2{position:relative}
      .linha2.tauMenuAberto .navLinks{display:flex;flex-direction:column;align-items:flex-start;position:absolute;
        top:100%;left:0;right:0;background:#1E1E1E;padding:1rem 1.5rem;gap:1rem;z-index:50}
      .linha2.tauBuscaAberta .barraPesquisaDesktop{display:block;position:absolute;top:100%;left:0;right:0;
        max-width:none;background:#1E1E1E;padding:.75rem 1.5rem;z-index:50}
    }`;
  document.head.appendChild(css);

  let toastTimer;
  T.toast = msg => {
    let el = document.getElementById('tauToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tauToast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 2800);
  };

  /* ---------- SESSÃO VALIDADA NO SERVIDOR ---------- */
  T.auth = {
    usuario() { return contexto.usuario; },
    exigir() {
      if (this.usuario()) {
        return true;
      }
      location.href = '/login.html?next=' + encodeURIComponent(T.pagina() + '.html');
      return false;
    }
  };
  // Remove a antiga sessão de demonstração: ela não autentica mais ninguém.
  T.store.del('sessao');

  /* ---------- CARTÕES (guarda só bandeira + 4 últimos dígitos, NUNCA número/CVV) ---------- */
  const CARTOES_INICIAIS = [
    { id: 'c1', bandeira: 'visa', final: '4582', validade: '08/29', titular: 'Alifer Henrique da Silva Maia', tipo: 'crédito', padrao: true },
    { id: 'c2', bandeira: 'mastercard', final: '9021', validade: '11/28', titular: 'Alifer Henrique da Silva Maia', tipo: 'débito', padrao: false }
  ];
  T.cartoes = {
    lista() {
      let l = T.store.get('cartoes', null);
      if (!l) { l = CARTOES_INICIAIS; T.store.set('cartoes', l); }
      return l;
    },
    salvar(l) { T.store.set('cartoes', l); },
    creditoPadrao() {
      const c = this.lista().filter(x => x.tipo === 'crédito');
      return c.find(x => x.padrao) || c[0] || null;
    }
  };

  /* ---------- CARRINHO ---------- */
  const chaveItem = i => [i.id, i.tamanho, i.cor].join('|');

  T.carrinho = {
    itens() {
      const salvos = T.store.get('carrinho', []);
      if (!Array.isArray(salvos)) return [];
      return salvos.filter(i => i && T.produto(i.id) && Number.isFinite(Number(i.qtd)) && Math.floor(Number(i.qtd)) > 0)
        .map(i => ({ ...i, qtd: Math.min(T.CONFIG.MAX_QTD_POR_ITEM, Math.floor(Number(i.qtd))) }));
    },
    _salvar(itens) {
      T.store.set('carrinho', itens);
      atualizarBadge();
      document.dispatchEvent(new CustomEvent('carrinho:mudou'));
    },
    quantidade() { return this.itens().reduce((s, i) => s + i.qtd, 0); },
    adicionar(id, { tamanho, cor, qtd = 1 }) {
      if (!T.produto(id)) return;
      const itens = this.itens();
      const novo = { id, tamanho, cor, qtd };
      const existente = itens.find(i => chaveItem(i) === chaveItem(novo));
      if (existente) existente.qtd = Math.min(T.CONFIG.MAX_QTD_POR_ITEM, existente.qtd + qtd);
      else itens.push({ ...novo, qtd: Math.min(T.CONFIG.MAX_QTD_POR_ITEM, qtd) });
      this._salvar(itens);
    },
    alterarQtd(chave, delta) {
      const itens = this.itens();
      const i = itens.find(x => chaveItem(x) === chave);
      if (!i) return;
      i.qtd = Math.max(1, Math.min(T.CONFIG.MAX_QTD_POR_ITEM, i.qtd + delta));
      this._salvar(itens);
    },
    remover(chave) { this._salvar(this.itens().filter(i => chaveItem(i) !== chave)); },
    limpar() { T.store.del('cupom'); this._salvar([]); },
    chave: chaveItem,

    cupomAtual() { const c = T.store.get('cupom', null); return c && T.CUPONS[c] ? c : null; },
    aplicarCupom(codigo) {
      codigo = String(codigo || '').trim().toUpperCase();
      if (!T.CUPONS[codigo]) return false;
      T.store.set('cupom', codigo);
      return true;
    },
    removerCupom() { T.store.del('cupom'); },

    /* Preços SEMPRE vêm do catálogo, nunca do que está salvo no navegador. */
    totais({ metodo } = {}) {
      const itens = this.itens();
      let qtd = 0, subtotal = 0, descontoPix = 0, economiaTabela = 0;
      itens.forEach(i => {
        const p = T.produto(i.id);
        const quantidade = Math.max(1, Math.floor(Number(i.qtd) || 1));
        qtd += quantidade;
        subtotal += p.preco * quantidade;
        if (p.precoDe) economiaTabela += (p.precoDe - p.preco) * quantidade;
        if (metodo === 'pix') descontoPix += p.preco * quantidade * (p.descontoPix || 0) / 100;
      });
      const cupom = this.cupomAtual();
      const base = subtotal - descontoPix;
      let descontoCupom = 0;
      if (cupom) {
        const c = T.CUPONS[cupom];
        if (c.tipo === 'pct') descontoCupom = base * c.valor / 100;
        if (c.tipo === 'valor') descontoCupom = Math.min(c.valor, base);
      }
      let frete = 0;
      if (itens.length && subtotal < T.CONFIG.FRETE_GRATIS_A_PARTIR_DE && !(cupom && T.CUPONS[cupom].tipo === 'frete')) {
        frete = T.CONFIG.FRETE_FIXO;
      }
      const total = Math.max(0, base - descontoCupom) + frete;
      const r2 = n => Math.round(n * 100) / 100;
      return {
        qtd, subtotal: r2(subtotal), descontoPix: r2(descontoPix), descontoCupom: r2(descontoCupom),
        cupom, frete, total: r2(total), economia: r2(economiaTabela + descontoPix + descontoCupom)
      };
    }
  };

  T.parcelasMax = total =>
    Math.max(1, Math.min(T.CONFIG.MAX_PARCELAS, Math.floor(total / T.CONFIG.MIN_PARCELA)));

  /* ---------- PAGAMENTO  ---------- */
  T.pagamento = {
    processar(pedido) {
      return new Promise(resolve => setTimeout(() =>
        resolve({ ok: true, status: pedido.metodo === 'cartao' ? 'Em separação' : 'Aguardando pagamento' }), 900));
    }
  };

  /* ---------- CARD DE PRODUTO (mesmo HTML das páginas originais) ---------- */
  T.cardHTML = p => `
    <a href="produto.html?id=${encodeURIComponent(p.id)}" class="cardProduto">
        <div class="imgProduto"><img src="${T.esc(p.imagens[0])}" alt="${T.esc(p.nome)}"></div>
        <p class="nomeProduto">${T.esc(p.nome)}</p>
        ${p.descontoPix ? `<p class="descontoProduto">${p.descontoPix}% OFF no PIX</p>` : ''}
        <div class="precoProduto">
            <p class="valorProduto">${T.brl(p.preco)}</p>
            <p class="parcelaProduto">ou em até ${p.parcelas}x de ${T.brl(p.preco / p.parcelas)}</p>
            ${p.preco >= T.CONFIG.FRETE_GRATIS_A_PARTIR_DE ? '<p class="freteProduto">Frete grátis</p>' : ''}
        </div>
    </a>`;

  /* ---------- HEADER ---------- */
  function atualizarBadge() {
    const a = document.querySelector('.iconesHeader a[aria-label="Carrinho"]');
    if (!a) return;
    let b = a.querySelector('.tauBadge');
    if (!b) { b = document.createElement('span'); b.className = 'tauBadge'; a.appendChild(b); }
    const n = T.carrinho.quantidade();
    b.textContent = n > 99 ? '99+' : n;
    b.hidden = n === 0;
  }

  function iniciarHeader() {
    atualizarBadge();
    window.addEventListener('storage', atualizarBadge);

    // Links de navegação -> filtros da home
    const filtros = {
      'CALÇADOS': 'categoria=calcados', 'MASCULINO': 'genero=masculino', 'FEMININO': 'genero=feminino',
      'INFANTIL': 'genero=infantil', 'ESPORTES': 'tag=esporte', 'STREETWEAR': 'tag=streetwear', 'OUTLET': 'outlet=1'
    };
    document.querySelectorAll('.navLinks a').forEach(a => {
      const f = filtros[a.textContent.trim().toUpperCase()];
      if (f) a.href = 'index.html?' + f;
    });

    // Busca (desktop e mobile)
    const form = document.querySelector('.barraPesquisaDesktop');
    if (form) {
      const input = form.querySelector('input');
      const q = new URLSearchParams(location.search).get('busca');
      if (q) input.value = q;
      form.addEventListener('submit', e => {
        e.preventDefault();
        const termo = input.value.trim();
        location.href = 'index.html' + (termo ? '?busca=' + encodeURIComponent(termo) : '');
      });
    }
    const nav = document.querySelector('.linha2');
    const [btnMenu, btnBusca] = document.querySelectorAll('.iconesHeaderMobile .botaoHeader');
    if (nav && btnMenu) btnMenu.addEventListener('click', () => {
      nav.classList.remove('tauBuscaAberta'); nav.classList.toggle('tauMenuAberto');
    });
    if (nav && btnBusca) btnBusca.addEventListener('click', () => {
      nav.classList.remove('tauMenuAberto'); nav.classList.toggle('tauBuscaAberta');
      const i = nav.querySelector('.barraPesquisaDesktop input'); if (i) i.focus();
    });

    // Ícone de perfil: conta se logado, login se não
    const perfil = document.querySelector('.iconesHeader a[aria-label="Perfil"]');
    if (perfil) perfil.href = T.auth.usuario() ? 'pedidos.html' : 'login.html';

    // O ícone da sacola precisa abrir o checkout em todas as páginas,
    // inclusive nas páginas da área de perfil que ainda têm href="#".
    const carrinho = document.querySelector('.iconesHeader a[aria-label="Carrinho"]');
    if (carrinho) carrinho.href = 'finalizarcompra.html';

    // Contagem regressiva das ofertas (até meia-noite)
    const relogio = document.querySelector('#ofertas2 strong');
    if (relogio) {
      const tick = () => {
        const agora = new Date(), fim = new Date(agora);
        fim.setHours(24, 0, 0, 0);
        const s = Math.floor((fim - agora) / 1000);
        relogio.textContent = [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60]
          .map(v => String(v).padStart(2, '0')).join(':');
      };
      tick(); setInterval(tick, 1000);
    }
  }

  iniciarHeader();
})();
