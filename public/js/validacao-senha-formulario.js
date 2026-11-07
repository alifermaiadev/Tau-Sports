/*
 * Mostra a força e os requisitos da senha nos formulários de cadastro.
 * A validação definitiva também acontece no servidor (não basta o JavaScript).
 */
(function () {
  'use strict';

  const formularios = document.querySelectorAll('form[data-validar-senha]');

  for (const formulario of formularios) {
    const senha = formulario.querySelector('input[name="senha"]');
    const confirmacao = formulario.querySelector('input[name="confirmarSenha"]');
    const textoForca = formulario.querySelector('[data-forca-texto]');
    const barraForca = formulario.querySelector('[data-forca-barra]');
    const aviso = formulario.querySelector('[data-erro-senha]');
    const requisitos = formulario.querySelectorAll('[data-requisito]');

    if (!senha || !confirmacao) {
      continue;
    }

    function atualizarForca() {
      const resultado = analisarSenha(senha.value);

      textoForca.textContent = senha.value ? 'Força da senha: ' + resultado.nivel : 'Força da senha: —';
      barraForca.classList.remove('fraca', 'media', 'forte');

      if (senha.value) {
        const classes = { Fraca: 'fraca', Média: 'media', Forte: 'forte' };
        barraForca.classList.add(classes[resultado.nivel]);
      }

      for (const item of requisitos) {
        const nome = item.dataset.requisito;
        const atendido = resultado.requisitos[nome];
        item.classList.toggle('atendido', atendido);
        item.setAttribute('aria-label', (atendido ? 'Atendido: ' : 'Pendente: ') + item.textContent);
      }

      if (confirmacao.value && senha.value !== confirmacao.value) {
        aviso.textContent = 'As senhas não são iguais.';
      } else {
        aviso.textContent = '';
      }
    }

    senha.addEventListener('input', atualizarForca);
    confirmacao.addEventListener('input', atualizarForca);

    formulario.addEventListener('submit', function (evento) {
      const resultado = analisarSenha(senha.value);

      if (!resultado.valida) {
        evento.preventDefault();
        aviso.textContent = 'A senha precisa atender a todos os requisitos.';
        senha.focus();
        return;
      }

      if (senha.value !== confirmacao.value) {
        evento.preventDefault();
        aviso.textContent = 'As senhas não são iguais.';
        confirmacao.focus();
      }
    });

    atualizarForca();
  }
})();
