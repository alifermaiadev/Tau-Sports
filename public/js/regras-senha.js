/*
 * Regras de senha compartilhadas entre navegador e servidor.
 * Uma senha válida precisa ter 8 a 128 caracteres, maiúscula, minúscula,
 * número e caractere especial. O nível exibido é apenas uma estimativa.
 */
function analisarSenha(senha) {
  if (typeof senha !== 'string') {
    senha = '';
  }

  const requisitos = {
    tamanho: senha.length >= 8 && senha.length <= 128,
    maiuscula: /[A-Z]/.test(senha),
    minuscula: /[a-z]/.test(senha),
    numero: /[0-9]/.test(senha),
    especial: /[^A-Za-z0-9\s]/.test(senha)
  };

  const valida = Object.values(requisitos).every(function (atendido) {
    return atendido;
  });

  let nivel = 'Fraca';

  if (valida) {
    if (senha.length >= 12) {
      nivel = 'Forte';
    } else {
      nivel = 'Média';
    }
  }

  return { valida, nivel, requisitos };
}

// No navegador, a função já fica acessível por <script>.
// No Node.js, require() permite aproveitar a mesma regra no backend.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { analisarSenha };
}
