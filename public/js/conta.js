
(function () {
  'use strict';
  const T = window.Tau;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const pagina = T.pagina();

  const STATUS_PODE_TROCAR = s => s !== 'Aguardando pagamento';
  const nomeMetodo = { cartao: 'Cartão de crédito', pix: 'PIX', boleto: 'Boleto bancário' };

  /* ================= LOGIN ================= */
  function login() {
    const form = $('.login-form');
    if (!form) return;
    if (T.auth.usuario()) { location.replace('pedidos.html'); return; }

    // O formulário envia e-mail e senha diretamente ao servidor.
    $('.esqueceuASenha').addEventListener('click', e => {
      e.preventDefault();
      T.toast('Recuperação de senha ainda não disponível. Contate o administrador.');
    });

  }

  /* ================= MENU DA CONTA ================= */
  function menuConta() {
    const rotas = { 'Pedidos': 'pedidos', 'Trocas e Devoluções': 'trocas', 'Seus Dados': 'seusdados', 'Endereços': 'endereco', 'Cartões Salvos': 'cartoessalvos', 'Cadastrar Produto': 'cadastrarproduto' };
    $$('.perfilSelecao li').forEach(li => {
      const a = $('a', li);
      if (!a) { return; }
      const nome = $('span', li).textContent.trim();
      if (rotas[nome]) {
        a.href = rotas[nome] + '.html';
        li.classList.toggle('ativo', rotas[nome] === pagina);
      }
    });
  }

  /* ================= PEDIDOS / TROCAS ================= */
  async function listaPedidos(modo) {
    const sec = $('.perfilInformacao');
    if (!sec) return;
    $$('.pedido', sec).forEach(el => el.remove());
    $$('.listaVazia', sec).forEach(el => el.remove());
    $$('.pedidosCarregando', sec).forEach(el => el.remove());
    const carregando = document.createElement('p');
    carregando.className = 'pedidosCarregando';
    carregando.textContent = 'Carregando seus pedidos...';
    sec.append(carregando);
    let pedidos;
    try {
      const resposta = await fetch('/api/pedidos', { headers: { Accept: 'application/json' } });
      const resultado = await resposta.json();
      if (!resposta.ok) throw new Error(resultado.erro || 'Não foi possível carregar seus pedidos.');
      pedidos = Array.isArray(resultado.pedidos) ? resultado.pedidos : [];
    } catch (erro) {
      carregando.className = 'listaVazia';
      carregando.textContent = erro.message || 'Não foi possível carregar seus pedidos. Atualize a página.';
      return;
    }
    carregando.remove();
    if (!pedidos.length) {
      sec.insertAdjacentHTML('beforeend',
        '<p class="listaVazia">Você ainda não fez nenhum pedido. <a href="index.html">Ir às compras</a></p>');
      return;
    }
    const data = iso => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? 'Data não disponível' : d.toLocaleDateString('pt-BR');
    };
    sec.insertAdjacentHTML('beforeend', pedidos.map(p => {
      const itens = (Array.isArray(p.itens) ? p.itens : []).filter(i => i && i.nome);
      if (!itens.length) return '';
      const primeiro = itens[0], resto = itens.length - 1;
      const qtd = itens.reduce((s, i) => s + (Number(i.qtd) || 0), 0);
      const detalhes = itens.map(i =>
        `<div>${T.esc(Number(i.qtd) || 0)}x ${T.esc(i.nome)} — tam. ${T.esc(i.tamanho || '—')}, ${T.esc(i.cor || '—')} — ${T.brl((Number(i.preco) || 0) * (Number(i.qtd) || 0), true)}</div>`).join('');
      const total = Number(p.totais && p.totais.total) || itens.reduce((s, i) => s + (Number(i.preco) || 0) * (Number(i.qtd) || 0), 0);
      const acao = modo === 'trocas'
            ? (p.trocaSolicitada
            ? '<a class="botaoComprar" href="#" aria-disabled="true">Troca solicitada</a>'
            : STATUS_PODE_TROCAR(p.status) ? '<a class="botaoComprar" href="#" data-acao="troca">Solicitar troca</a>' : '')
        : '<a class="botaoComprar" href="#" data-acao="detalhes">Ver detalhes</a>';
      return `
        <article class="pedido" data-id="${T.esc(p.id)}">
            <img src="${T.esc(primeiro.imagem)}" alt="${T.esc(primeiro.nome)}">
            <div class="pedidoDetalhes">
                <h2>${T.esc(primeiro.nome)}${resto > 0 ? ' e mais ' + resto + (resto > 1 ? ' itens' : ' item') : ''}</h2>
                <p>Pedido: <strong>#${T.esc(p.id)}</strong> · ${data(p.criadoEm)}</p>
                <p>Quantidade: <strong>${qtd}</strong></p>
                <p>${modo === 'trocas' ? 'Valor total' : 'Status'}: <strong>${modo === 'trocas' ? T.brl(total, true) : T.esc(p.status || 'Em processamento')}</strong></p>
                <div class="tauDetalhes" hidden>
                    ${detalhes}
                    <div>Total: <strong>${T.brl(total, true)}</strong> · ${T.esc(nomeMetodo[p.metodo] || p.metodo || 'Pagamento')}</div>
                    ${p.cartao && p.cartao.final ? '<div>Cartão final ' + T.esc(p.cartao.final) + '</div>' : ''}
                    <div>Entrega: ${T.esc(p.endereco && p.endereco.endereco || 'Endereço indisponível')}${p.endereco && p.endereco.numero ? ', ' + T.esc(p.endereco.numero) : ''}${p.endereco && p.endereco.cidade ? ' — ' + T.esc(p.endereco.cidade) : ''}${p.endereco && p.endereco.estado ? '/' + T.esc(p.endereco.estado) : ''}</div>
                </div>
            </div>
            <div class="pedidoAcoes">${acao}</div>
        </article>`;
    }).join(''));

    if (sec.dataset.tauPedidosListener) return;
    sec.dataset.tauPedidosListener = 'true';
    sec.addEventListener('click', async e => {
      const a = e.target.closest('a[data-acao]');
      if (!a) return;
      e.preventDefault();
      const card = a.closest('.pedido');
      if (a.dataset.acao === 'detalhes') {
        const d = $('.tauDetalhes', card); d.hidden = !d.hidden;
        a.textContent = d.hidden ? 'Ver detalhes' : 'Ocultar detalhes';
      }
      if (a.dataset.acao === 'troca' && confirm('Deseja solicitar a troca/devolução deste pedido?')) {
        a.setAttribute('aria-disabled', 'true');
        try {
          const resposta = await fetch('/api/pedidos/' + encodeURIComponent(card.dataset.id) + '/troca', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Accept: 'application/json' },
            body: new URLSearchParams({ _csrf: T.csrfToken })
          });
          const resultado = await resposta.json().catch(() => ({}));
          if (!resposta.ok) throw new Error(resultado.erro || 'Não foi possível registrar a solicitação.');
          a.textContent = 'Troca solicitada'; a.removeAttribute('data-acao');
          T.toast('Solicitação de troca registrada.');
        } catch (erro) {
          a.removeAttribute('aria-disabled');
          T.toast(erro.message || 'Não foi possível registrar a solicitação.');
        }
      }
    });
  }

  /* ================= SEUS DADOS ================= */
  function seusDados() {
    const nome = $('#nomeCompleto');
    if (!nome) return;
    const perfil = T.store.get('perfil', {});
    const sessao = T.auth.usuario();
    const [formDados, formAcesso] = $$('.formUsuario');

    nome.value = perfil.nome || (sessao && sessao.nome) || '';
    $('#dataNascimento').value = perfil.nascimento || '';
    $('#telefone').value = perfil.telefone || '';
    if (perfil.genero) { const r = $(`input[name=genero][value="${perfil.genero}"]`); if (r) r.checked = true; }
    T.aplicarMascara($('#telefone'), T.mask.telefone);

    const email = $('#emailUsuario');
    email.value = (sessao && sessao.email) || perfil.email || '';
    $$('input[name=preferencias]').forEach(c => { c.checked = (perfil.preferencias || []).includes(c.value); });

    const salvar = extra => {
      const atual = T.store.get('perfil', {});
      T.store.set('perfil', { ...atual, ...extra });
    };

    formDados.addEventListener('submit', e => {
      e.preventDefault();
      const n = nome.value.trim();
      if (n.length < 3) { nome.focus(); return T.toast('Informe seu nome completo.'); }
      const tel = $('#telefone').value.replace(/\D/g, '');
      if (tel && (tel.length < 10)) return T.toast('Telefone inválido.');
      const g = $('input[name=genero]:checked');
      salvar({ nome: n, nascimento: $('#dataNascimento').value, telefone: $('#telefone').value, genero: g ? g.value : '' });

      T.toast('Dados pessoais salvos.');
    });

    formAcesso.addEventListener('submit', e => {
      e.preventDefault();
      salvar({ preferencias: $$('input[name=preferencias]:checked').map(c => c.value) });
      T.toast('Preferências salvas.');
    });

    const [btnEmail, btnSenha] = $$('.acoesAcesso button');
    btnEmail.addEventListener('click', () => {
      const novo = email.value.trim();
      if (!T.validaEmail(novo)) { email.focus(); return T.toast('Digite um e-mail válido.'); }
      email.value = sessao.email;
      T.toast('A alteração do e-mail de acesso ainda não está disponível.');
    });
    btnSenha.addEventListener('click', () => T.toast('A troca de senha precisa do back-end da loja.'));
  }

  /* ================= ENDEREÇO ================= */
  async function buscarCep(cep) {
    try {
      const r = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
      const d = await r.json();
      return d.erro ? null : d;
    } catch (e) { return null; }
  }

  function endereco() {
    const cep = $('#cep');
    if (!cep) return;
    const [form1, form2] = $$('.formUsuario');
    const campos = ['cep', 'estado', 'endereco', 'numero', 'bairro', 'cidade', 'complemento'];
    const extras = ['nomeEndereco', 'referencia'];
    const salvo = T.store.get('endereco', {});

    const setUF = uf => {
      const sel = $('#estado');
      if (uf && ![...sel.options].some(o => o.value === uf)) sel.add(new Option(uf, uf));
      sel.value = uf || '';
    };
    campos.concat(extras).forEach(c => { if (c !== 'estado' && salvo[c]) $('#' + c).value = salvo[c]; });
    setUF(salvo.estado);
    if (salvo.tipoEndereco) { const r = $(`input[name=tipoEndereco][value="${salvo.tipoEndereco}"]`); if (r) r.checked = true; }
    $('#enderecoPadrao').checked = !!salvo.padrao;

    T.aplicarMascara(cep, T.mask.cep);
    ['cep', 'estado', 'endereco', 'numero', 'bairro', 'cidade'].forEach(c => { $('#' + c).required = true; });
    cep.pattern = '\\d{5}-\\d{3}'; cep.title = 'Formato: 00000-000';

    cep.addEventListener('input', async () => {
      const digitos = cep.value.replace(/\D/g, '');
      if (digitos.length !== 8) return;
      const d = await buscarCep(digitos);
      if (cep.value.replace(/\D/g, '') !== digitos) return; // usuário mudou o CEP enquanto buscava
      if (!d) return T.toast('CEP não encontrado. Preencha o endereço manualmente.');
      setUF(d.uf);
      $('#endereco').value = d.logradouro || '';
      $('#bairro').value = d.bairro || '';
      $('#cidade').value = d.localidade || '';
      $('#numero').focus();
    });

    const guardar = extra => T.store.set('endereco', { ...T.store.get('endereco', {}), ...extra });

    form1.addEventListener('submit', e => {
      e.preventDefault();
      const dados = {};
      campos.forEach(c => { dados[c] = $('#' + c).value.trim(); });
      guardar(dados);
      T.toast('Endereço salvo.');
    });
    form2.addEventListener('submit', e => {
      e.preventDefault();
      const t = $('input[name=tipoEndereco]:checked');
      guardar({
        nomeEndereco: $('#nomeEndereco').value.trim(), referencia: $('#referencia').value.trim(),
        tipoEndereco: t ? t.value : '', padrao: $('#enderecoPadrao').checked
      });
      T.toast('Informações de entrega salvas.');
    });
  }

  /* ================= CARTÕES SALVOS ================= */
  function cartoes() {
    const box = $('.listaCartoes');
    if (!box) return;
    const nomeBand = { visa: 'Visa', mastercard: 'Mastercard' };

    const render = () => {
      const l = T.cartoes.lista();
      box.innerHTML = l.length ? l.map(c => `
        <div class="cartaoSalvo" data-id="${T.esc(c.id)}">
            <div class="cartaoVisual">
                <div class="cartaoBandeira"><img src="/imagensUCE/${T.esc(c.bandeira)}.svg" alt="${T.esc(nomeBand[c.bandeira] || '')}"></div>
                <strong>•••• •••• •••• ${T.esc(c.final)}</strong>
                <small>Vence em ${T.esc(c.validade)}</small>
            </div>
            <div class="cartaoInformacoes">
                <h3>${T.esc(c.titular)}</h3>
                <p>Cartão de ${T.esc(c.tipo)}</p>
                ${c.padrao ? '<span class="seloPadrao">Padrão</span>' : ''}
            </div>
            <div class="cartaoAcoes">
                ${c.padrao ? '' : '<button type="button" class="botaoSecundario" data-acao="padrao">Tornar padrão</button>'}
                <button type="button" class="botaoSecundario" data-acao="editar">Editar</button>
                <button type="button" class="botaoRemover" data-acao="remover">Remover</button>
            </div>
        </div>`).join('') : '<p class="listaVazia">Nenhum cartão salvo.</p>';
    };

    box.addEventListener('click', e => {
      const b = e.target.closest('button[data-acao]');
      if (!b) return;
      const id = b.closest('.cartaoSalvo').dataset.id;
      let l = T.cartoes.lista();
      const c = l.find(x => x.id === id);
      if (b.dataset.acao === 'padrao') {
        l = l.map(x => ({ ...x, padrao: x.id === id }));
        T.toast('Cartão definido como padrão.');
      }
      if (b.dataset.acao === 'editar') {
        const nome = prompt('Nome do titular no cartão:', c.titular);
        if (nome && nome.trim().length >= 3) { c.titular = nome.trim(); T.toast('Cartão atualizado.'); }
      }
      if (b.dataset.acao === 'remover') {
        if (!confirm('Remover o cartão final ' + c.final + '?')) return;
        l = l.filter(x => x.id !== id);
        if (c.padrao && l.length) l[0].padrao = true;
        T.toast('Cartão removido.');
      }
      T.cartoes.salvar(l);
      render();
    });
    render();
  }

  /* ================= INICIALIZAÇÃO ================= */
  if (pagina === 'login') return login();

  if (!T.auth.exigir()) return;
  menuConta();
  if (pagina === 'pedidos') listaPedidos('pedidos');
  if (pagina === 'trocas') listaPedidos('trocas');
  if (pagina === 'seusdados') seusDados();
  if (pagina === 'endereco') endereco();
  if (pagina === 'cartoessalvos') cartoes();
})();
