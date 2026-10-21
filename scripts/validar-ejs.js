'use strict';
// Verificação sintática mínima de blocos JS/EJS, sem substituir renderização real.
const fs=require('node:fs');const path=require('node:path');
let contador=0;
function verificar(arquivo){
  const fonte=fs.readFileSync(arquivo,'utf8');
  const regex=/<%([\s\S]*?)(?:[-_]?%>)/g;let pos=0;let codigo='let resultado="";with(locals){\n';let match;
  while((match=regex.exec(fonte))){
    codigo+='resultado+='+JSON.stringify(fonte.slice(pos,match.index))+';\n';
    const interno=match[1];
    if(interno.startsWith('#')){ /* comentário EJS */ }
    else if(interno.startsWith('=')||interno.startsWith('-'))codigo+='resultado+=('+interno.slice(1).trim()+');\n';
    else codigo+=interno+'\n';
    pos=regex.lastIndex;
  }
  codigo+='resultado+='+JSON.stringify(fonte.slice(pos))+';\nreturn resultado;}';
  try { new Function('locals',codigo); }
  catch(e){throw new Error(arquivo+': '+e.message,{cause:e});}
  contador++;
}
function listar(diretorio){for(const nome of fs.readdirSync(diretorio)){const alvo=path.join(diretorio,nome);if(fs.statSync(alvo).isDirectory())listar(alvo);else if(nome.endsWith('.ejs'))verificar(alvo);}}
listar(path.join(__dirname,'../views'));
console.log('Sintaxe básica verificada em '+contador+' arquivos EJS.');
