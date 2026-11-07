'use strict';

// Divide um arquivo SQL sem confundir ponto e vírgula dentro de comentários,
// textos ou identificadores entre aspas.
function dividirSql(texto) {
  const comandos = [];
  let atual = '', aspas = null, comentarioLinha = false, comentarioBloco = false;

  for (let i = 0; i < texto.length; i++) {
    const caractere = texto[i], proximo = texto[i + 1];

    if (comentarioLinha) {
      if (caractere === '\n') { comentarioLinha = false; atual += '\n'; }
      continue;
    }
    if (comentarioBloco) {
      if (caractere === '*' && proximo === '/') { comentarioBloco = false; atual += ' '; i++; }
      continue;
    }
    if (aspas) {
      atual += caractere;
      if (caractere === '\\' && aspas !== '`' && i + 1 < texto.length) atual += texto[++i];
      else if (caractere === aspas) {
        if (proximo === aspas) atual += texto[++i];
        else aspas = null;
      }
      continue;
    }

    if (caractere === "'" || caractere === '"' || caractere === '`') { aspas = caractere; atual += caractere; continue; }
    if (caractere === '#') { comentarioLinha = true; continue; }
    if (caractere === '-' && proximo === '-' && (i + 2 >= texto.length || /\s/.test(texto[i + 2]))) {
      comentarioLinha = true; i++; continue;
    }
    if (caractere === '/' && proximo === '*') { comentarioBloco = true; i++; continue; }
    if (caractere === ';') {
      if (atual.trim()) comandos.push(atual.trim());
      atual = '';
      continue;
    }
    atual += caractere;
  }
  if (atual.trim()) comandos.push(atual.trim());
  return comandos;
}

module.exports = dividirSql;
