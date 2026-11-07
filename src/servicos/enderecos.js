'use strict';
const { texto } = require('../validacao');
const validar = dados => {
  const e = Object.fromEntries(['cep','estado','endereco','numero','complemento','bairro','cidade','nomeEndereco','referencia','tipoEndereco'].map(k=>[k,texto(dados[k])]));
  e.cep=e.cep.replace(/\D/g,''); e.estado=e.estado.toUpperCase();
  const limites={endereco:150,numero:20,complemento:100,bairro:100,cidade:100,nomeEndereco:80,referencia:150};
  if (!/^\d{8}$/.test(e.cep) || !/^[A-Z]{2}$/.test(e.estado) ||
    ['endereco','numero','bairro','cidade'].some(k=>!e[k]) || Object.keys(limites).some(k=>e[k].length>limites[k]))
    throw Object.assign(new Error('Informe CEP, UF, rua, número, bairro e cidade válidos.'),{status:400});
  e.tipoEndereco=['residencial','comercial'].includes(e.tipoEndereco)?e.tipoEndereco:'residencial';
  e.padrao=dados.enderecoPadrao==='sim' || dados.padrao===true || dados.padrao===1;
  e.id=dados.id === undefined || dados.id === null || dados.id === '' ? null : Number(dados.id);
  if(e.id !== null && (!Number.isSafeInteger(e.id) || e.id<1)) throw Object.assign(new Error('Endereço inválido.'),{status:400});
  return e;
};
module.exports = banco=>({
  async listar(usuarioId){
    return (await banco.execute(`SELECT id_endereco AS id, cep, estado, logradouro AS endereco, numero, complemento,
      bairro, cidade, nome_endereco AS nomeEndereco, referencia, tipo_endereco AS tipoEndereco,
      padrao FROM ENDERECO_USUARIO WHERE id_usuario=? ORDER BY padrao DESC, id_endereco DESC`,[usuarioId]))[0];
  },
  async salvar(usuarioId,dados){
    const e=validar(dados);
    const cx=await banco.getConnection();let salvoId=e.id;
    try {
      await cx.beginTransaction();
      if(e.id){
        const [existe]=await cx.execute('SELECT id_endereco FROM ENDERECO_USUARIO WHERE id_endereco=? AND id_usuario=? FOR UPDATE',[e.id,usuarioId]);
        if(!existe.length)throw Object.assign(new Error('Endereço não encontrado.'),{status:404});
      }
      const [quantidade]=await cx.execute('SELECT COUNT(*) AS n FROM ENDERECO_USUARIO WHERE id_usuario=?',[usuarioId]);
      if(quantidade[0].n >= 20 && !e.id)throw Object.assign(new Error('Limite de 20 endereços atingido.'),{status:400});
      const principal=e.padrao || quantidade[0].n===0;
      if(principal) await cx.execute('UPDATE ENDERECO_USUARIO SET padrao=0 WHERE id_usuario=?',[usuarioId]);
      const campos=[e.cep,e.estado,e.endereco,e.numero,e.complemento,e.bairro,e.cidade,e.nomeEndereco,e.referencia,e.tipoEndereco,principal?1:0];
      if(e.id){
        await cx.execute(`UPDATE ENDERECO_USUARIO SET cep=?,estado=?,logradouro=?,numero=?,complemento=?,bairro=?,cidade=?,
          nome_endereco=?,referencia=?,tipo_endereco=?,padrao=? WHERE id_endereco=? AND id_usuario=?`, [...campos,e.id,usuarioId]);
      } else {
        const [resultado]=await cx.execute(`INSERT INTO ENDERECO_USUARIO
          (cep,estado,logradouro,numero,complemento,bairro,cidade,nome_endereco,referencia,tipo_endereco,padrao,id_usuario)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,[...campos,usuarioId]);salvoId=resultado.insertId;
      }
      await cx.commit();
    }catch(erro){await cx.rollback();throw erro;}finally{cx.release();}
    const todos=await this.listar(usuarioId);
    return todos.find(item=>item.id===salvoId);
  }
});
