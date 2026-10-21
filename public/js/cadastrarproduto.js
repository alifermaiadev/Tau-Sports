/* Validação visível do cadastro de produtos. A gravação continua sendo feita pelo POST /produtos. */
(function () {
  'use strict';
  const formulario = document.querySelector('.cadastroProduto [data-formulario="produto"] form');
  const seletor = document.getElementById('tipoCadastro');
  const opcoes = ['produto','categoria','marca','genero'];
  function alternar() {
    for (const nome of opcoes) {
      const secao = document.querySelector('[data-formulario="' + nome + '"]');
      if (secao) secao.hidden = seletor.value !== nome;
      if (secao) secao.querySelectorAll('input,select,textarea,button').forEach(el => el.disabled = secao.hidden);
    }
  }
  if (seletor) { seletor.addEventListener('change',alternar); alternar(); }
  const tipo = document.getElementById('tipo');
  const grupo = document.getElementById('grupoTamanhos');
  if (tipo && grupo) {
    const tamanhos = { roupa:['PP','P','M','G','GG','XG'], calcado:Array.from({length:10},(_,i)=>String(i+35)), outro:['Único'] };
    let selecionados = new Set(grupo.dataset.selecionados.split(',').map(t=>t.trim()).filter(Boolean));
    function desenhar() {
      grupo.replaceChildren();
      for (const valor of tamanhos[tipo.value] || []) {
        const label = document.createElement('label'); label.className='opcaoCheckbox';
        const check=document.createElement('input'); check.type='checkbox'; check.name='tamanhos'; check.value=valor;
        check.checked=selecionados.has(valor);
        const span=document.createElement('span'); span.textContent=valor; label.append(check,span); grupo.append(label);
      }
      selecionados = new Set([...grupo.querySelectorAll('input:checked')].map(el=>el.value));
    }
    tipo.addEventListener('change', () => { selecionados.clear(); desenhar(); });
    grupo.addEventListener('change',()=>{selecionados=new Set([...grupo.querySelectorAll('input:checked')].map(el=>el.value));});
    desenhar();
    if (formulario) formulario.addEventListener('submit', e=>{ if (!grupo.querySelector('input:checked')) { e.preventDefault(); alert('Selecione pelo menos um tamanho disponível.'); } });
  }
  if (!formulario) return;

  const alerta = document.getElementById('alertaValidacaoProduto');
  const controles = 'input:not([type="hidden"]), select, textarea';

  function rotuloDoCampo(campo) {
    const rotulo = formulario.querySelector('label[for="' + campo.id + '"]');
    return rotulo ? rotulo.textContent.replace('*', '').trim() : campo.name;
  }

  function mensagemDoCampo(campo) {
    const rotulo = rotuloDoCampo(campo);
    if (campo.validity.valueMissing) {
      return rotulo + ': preenchimento obrigatório.';
    }
    if (campo.validity.rangeUnderflow) {
      return rotulo + ': o valor está abaixo do mínimo permitido.';
    }
    if (campo.validity.rangeOverflow) {
      return rotulo + ': o valor ultrapassa o máximo permitido.';
    }
    if (campo.validity.tooShort) {
      return rotulo + ': texto menor que o mínimo permitido.';
    }
    if (campo.validity.tooLong) {
      return rotulo + ': texto maior que o limite permitido.';
    }
    if (campo.validity.stepMismatch || campo.validity.badInput) {
      return rotulo + ': informe um número válido dentro das casas decimais permitidas.';
    }
    return rotulo + ': ' + (campo.validationMessage || 'valor inválido.');
  }

  function atualizarCampo(campo) {
    if (!campo.matches(controles) || !campo.willValidate) {
      return;
    }
    const agrupador = campo.closest('.campoFormulario');
    if (!agrupador) {
      return;
    }
    let erro = agrupador.querySelector('.erroCampoProduto');
    if (campo.validity.valid) {
      campo.removeAttribute('aria-invalid');
      campo.removeAttribute('aria-describedby');
      if (erro) {
        erro.remove();
      }
      return;
    }
    if (!erro) {
      erro = document.createElement('small');
      erro.className = 'erroCampoProduto';
      erro.id = 'erro-' + campo.id;
      erro.setAttribute('role', 'alert');
      agrupador.appendChild(erro);
    }
    erro.textContent = mensagemDoCampo(campo);
    campo.setAttribute('aria-invalid', 'true');
    campo.setAttribute('aria-describedby', erro.id);
  }

  // O evento 'invalid' não dispara 'submit' e não sobe pela árvore por padrão:
  // a captura permite mostrar o erro mesmo quando o navegador bloqueia o POST.
  formulario.addEventListener('invalid', function (evento) {
    atualizarCampo(evento.target);
    alerta.hidden = false;
  }, true);

  function atualizarAposEdicao(evento) {
    if (!evento.target.matches(controles)) {
      return;
    }
    if (evento.target.hasAttribute('aria-invalid')) {
      atualizarCampo(evento.target);
    }
    if (!formulario.querySelector('[aria-invalid="true"]')) {
      alerta.hidden = true;
    }
  }
  formulario.addEventListener('input', atualizarAposEdicao);
  formulario.addEventListener('change', atualizarAposEdicao);

  // Sem preventDefault: os dados continuam sendo enviados ao Node.js.
  formulario.addEventListener('submit', function () {
    const botao = formulario.querySelector('button[type="submit"]');
    if (botao) {
      botao.textContent = 'Salvando produto...';
    }
  });
})();
