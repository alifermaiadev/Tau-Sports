'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const diretorioUploads = path.join(__dirname, '../../public/uploads/produtos');
const limiteTotal = 25 * 1024 * 1024;
const limiteArquivo = 8 * 1024 * 1024;
const erroUpload = (mensagem, status = 400) => Object.assign(new Error(mensagem), { status });

function tipoImagem(conteudo) {
  if (conteudo.length >= 8 && conteudo.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (conteudo.length >= 3 && conteudo[0] === 0xff && conteudo[1] === 0xd8 && conteudo[2] === 0xff) return 'jpg';
  if (conteudo.length >= 6 && ['GIF87a','GIF89a'].includes(conteudo.subarray(0,6).toString('ascii'))) return 'gif';
  if (conteudo.length >= 12 && conteudo.toString('ascii',0,4) === 'RIFF' && conteudo.toString('ascii',8,12) === 'WEBP') return 'webp';
  if (conteudo.length >= 12 && conteudo.toString('ascii',4,8) === 'ftyp' && /^(avif|avis)$/.test(conteudo.toString('ascii',8,12))) return 'avif';
  return null;
}

function lerDisposicao(valor) {
  const nome = /(?:^|;)\s*name="([^"]*)"/i.exec(valor)?.[1];
  const arquivo = /(?:^|;)\s*filename="([^"]*)"/i.exec(valor)?.[1];
  return { nome, arquivo };
}

function separarPartes(conteudo, boundary) {
  const prefixo = Buffer.from('--' + boundary + '\r\n');
  const separador = Buffer.from('\r\n--' + boundary);
  if (!conteudo.subarray(0, prefixo.length).equals(prefixo)) throw erroUpload('O formulário de imagens está malformado.');
  const partes = [];
  let inicio = prefixo.length;
  while (inicio < conteudo.length) {
    const fimCabecalho = conteudo.indexOf('\r\n\r\n', inicio, 'ascii');
    if (fimCabecalho < 0) throw erroUpload('O formulário de imagens está malformado.');
    const cabecalhos = conteudo.toString('latin1', inicio, fimCabecalho);
    const inicioDados = fimCabecalho + 4;
    const fimDados = conteudo.indexOf(separador, inicioDados);
    if (fimDados < 0) throw erroUpload('O formulário de imagens está malformado.');
    partes.push({ cabecalhos, dados: conteudo.subarray(inicioDados, fimDados) });
    inicio = fimDados + separador.length;
    if (conteudo.toString('ascii', inicio, inicio + 2) === '--') break;
    if (conteudo.toString('ascii', inicio, inicio + 2) !== '\r\n') throw erroUpload('O formulário de imagens está malformado.');
    inicio += 2;
  }
  return partes;
}

async function lerMultipart(req, res, next) {
  if (!/^multipart\/form-data\b/i.test(req.get('content-type') || '')) return next();
  try {
    const boundary = /\bboundary=(?:"([^"]+)"|([^;\s]+))/i.exec(req.get('content-type'));
    if (!boundary) throw erroUpload('Não foi possível ler as imagens enviadas.');
    const marcador = boundary[1] || boundary[2];
    if (marcador.length > 200) throw erroUpload('Não foi possível ler as imagens enviadas.');
    const blocos = [];
    let total = 0;
    for await (const bloco of req) {
      total += bloco.length;
      if (total > limiteTotal) throw erroUpload('O envio ultrapassa o limite de 25 MB.', 413);
      blocos.push(bloco);
    }
    req.body = Object.create(null);
    req.arquivosImagem = [];
    for (const parte of separarPartes(Buffer.concat(blocos), marcador)) {
      const disposicao = /content-disposition:\s*form-data;([^\r\n]+)/i.exec(parte.cabecalhos)?.[1] || '';
      const { nome, arquivo } = lerDisposicao(disposicao);
      if (!nome) continue;
      if (nome === 'arquivosImagem' && arquivo !== undefined) {
        if (!arquivo) continue;
        if (req.arquivosImagem.length >= 10) throw erroUpload('Envie no máximo 10 imagens por produto.');
        const extensao = tipoImagem(parte.dados);
        if (!extensao) throw erroUpload('Use uma imagem PNG, JPEG, GIF, WebP ou AVIF.');
        if (parte.dados.length > limiteArquivo) throw erroUpload('Cada imagem pode ter no máximo 8 MB.', 413);
        req.arquivosImagem.push({ conteudo: parte.dados, extensao });
        continue;
      }
      const valor = parte.dados.toString('utf8');
      if (Object.hasOwn(req.body, nome)) req.body[nome] = Array.isArray(req.body[nome]) ? [...req.body[nome], valor] : [req.body[nome], valor];
      else req.body[nome] = valor;
    }
    next();
  } catch (erro) {
    next(erro);
  }
}

async function salvarArquivos(arquivos = []) {
  if (!arquivos.length) return [];
  await fs.mkdir(diretorioUploads, { recursive: true });
  const caminhos = [];
  try {
    for (const arquivo of arquivos) {
      const nome = randomUUID() + '.' + arquivo.extensao;
      await fs.writeFile(path.join(diretorioUploads, nome), arquivo.conteudo, { flag: 'wx' });
      caminhos.push('/uploads/produtos/' + nome);
    }
    return caminhos;
  } catch (erro) {
    await removerArquivos(caminhos);
    throw erro;
  }
}

async function removerArquivos(caminhos = []) {
  await Promise.all(caminhos.map(caminho => {
    const nome = path.basename(caminho);
    if (nome !== caminho.slice('/uploads/produtos/'.length)) return Promise.resolve();
    return fs.rm(path.join(diretorioUploads, nome), { force: true });
  }));
}

module.exports = { lerMultipart, salvarArquivos, removerArquivos };
