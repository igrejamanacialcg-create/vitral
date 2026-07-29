/* =====================================================================
   VITRAL — API (Google Apps Script)
   Backend do sistema: planilha como banco de dados, Drive como acervo
   de imagens, login/senha com papéis (gestor | cadastro) verificados
   aqui dentro — nunca confiar em nada que vier só do navegador.

   INSTALAÇÃO: veja DEPLOY.md na raiz do projeto.
   ===================================================================== */

const NOME_ABA = {
  USUARIOS: 'Usuarios', CONFIG: 'Config', MINISTERIOS: 'Ministerios',
  CULTOS: 'Cultos', MEMBROS: 'Membros', ESCALAS: 'Escalas',
  SLOTS: 'Slots', PASTOREIO: 'Pastoreio', MIDIA: 'Midia'
};

const CAB = {
  Usuarios: ['id','nome','usuario','hash','salt','papel','ativo','criadoEm'],
  Config: ['chave','valor'],
  Ministerios: ['id','nome','qtd','cor'],
  Cultos: ['id','nome','tipo','diaSemanai','hora','data'],
  /* endereco/email no fim de propósito — mesmo truque do conjuge, pra não deslocar colunas
     numa planilha já em uso: se adicionar campo novo no futuro, sempre no fim */
  Membros: ['id','nome','telefone','foto','nascimento','ministerios','disponibilidade','ativo','obs','conjuge','endereco','email'],
  Escalas: ['mes','geradaEm','folga','apertados'],
  Slots: ['id','mes','data','hora','ministerioId','membroId','forcado'],
  Pastoreio: ['id','pessoa','tipo','data','hora','responsavel','status','assunto','notas'],
  Midia: ['id','titulo','tipo','tema','data','url']
};

const MINISTERIOS_PADRAO = [
  {nome:'Sonoplastia', qtd:1, cor:'#3B6FE0'},
  {nome:'Guardião', qtd:2, cor:'#23A06B'},
  {nome:'Recepção', qtd:2, cor:'#D2568F'},
  {nome:'Café', qtd:2, cor:'#E07A3B'},
  {nome:'Apoio ao Apóstolo', qtd:1, cor:'#E8B44A'},
  {nome:'Oração de Abertura', qtd:1, cor:'#1FA8B5'},
  {nome:'Oração de Dízimos e Ofertas', qtd:1, cor:'#8B5CF6'},
  {nome:'Intercessão', qtd:3, cor:'#E04E5C'},
  {nome:'Ministério Infantil', qtd:2, cor:'#6C7BE8'}
];

/* Quem pode chamar cada ação. 'login' é liberado à parte, antes de checar token. */
const PERMISSOES = {
  carregarTudo: ['gestor','cadastro'],
  salvarMembro: ['gestor','cadastro'],
  apagarMembro: ['gestor'],
  salvarMinisterio: ['gestor'],
  apagarMinisterio: ['gestor'],
  salvarCulto: ['gestor'],
  apagarCulto: ['gestor'],
  salvarConfig: ['gestor'],
  gerarEscala: ['gestor'],
  trocarSlot: ['gestor'],
  apagarEscala: ['gestor'],
  salvarPastoreio: ['gestor','cadastro'],
  apagarPastoreio: ['gestor'],
  salvarMidia: ['gestor','cadastro'],
  apagarMidia: ['gestor'],
  uploadImagem: ['gestor','cadastro'],
  criarUsuario: ['gestor'],
  listarUsuarios: ['gestor'],
  apagarUsuario: ['gestor'],
  alterarMinhaSenha: ['gestor','cadastro']
};

/* ================= ENTRADA HTTP ================= */
function doGet(e){
  return respostaJson({ok:true, servico:'Vitral API'});
}

function doPost(e){
  let corpo;
  try{ corpo = JSON.parse(e.postData.contents); }
  catch(erro){ return respostaJson({erro:'Corpo da requisição inválido.'}); }

  const acao = corpo.acao, dados = corpo.dados || {};

  if(acao === 'login') return respostaJson(acaoLogin(dados));

  /* formulário público de autocadastro (cadastro.html) — sem login, para compartilhar no grupo da igreja */
  if(acao === 'opcoesPublicas'){
    try{ return respostaJson({ok:true, dados: opcoesPublicas()}); }
    catch(erro){ return respostaJson({erro: String(erro.message || erro)}); }
  }
  if(acao === 'cadastroPublico'){
    try{ return respostaJson({ok:true, dados: cadastroPublico(dados)}); }
    catch(erro){ return respostaJson({erro: String(erro.message || erro)}); }
  }

  const sessao = verificarToken(corpo.token);
  if(!sessao) return respostaJson({erro:'Sessão expirada. Faça login novamente.'});

  const papeis = PERMISSOES[acao];
  if(!papeis) return respostaJson({erro:'Ação desconhecida: ' + acao});
  if(papeis.indexOf(sessao.papel) === -1) return respostaJson({erro:'Sem permissão para esta ação.'});

  try{
    return respostaJson({ok:true, dados: executarAcao(acao, dados, sessao)});
  }catch(erro){
    return respostaJson({erro: String(erro.message || erro)});
  }
}

function respostaJson(objeto){
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}

function executarAcao(acao, dados, sessao){
  switch(acao){
    case 'carregarTudo': return carregarTudo();
    case 'salvarMembro': return salvarMembro(dados);
    case 'apagarMembro': return apagarMembro(dados);
    case 'salvarMinisterio': return salvarMinisterio(dados);
    case 'apagarMinisterio': return apagarMinisterio(dados);
    case 'salvarCulto': return salvarCulto(dados);
    case 'apagarCulto': return apagarCulto(dados);
    case 'salvarCultos': return salvarCultosFn(dados);
    case 'salvarConfig': return salvarConfigFn(dados);
    case 'gerarEscala': return gerarEscalaFn(dados);
    case 'trocarSlot': return trocarSlotFn(dados);
    case 'apagarEscala': return apagarEscalaFn(dados);
    case 'salvarPastoreio': return salvarPastoreio(dados);
    case 'apagarPastoreio': return apagarPastoreio(dados);
    case 'salvarMidia': return salvarMidia(dados);
    case 'apagarMidia': return apagarMidia(dados);
    case 'uploadImagem': return uploadImagem(dados);
    case 'criarUsuario': return criarUsuario(dados);
    case 'listarUsuarios': return listarUsuarios();
    case 'apagarUsuario': return apagarUsuarioFn(dados, sessao);
    case 'alterarMinhaSenha': return alterarMinhaSenha(dados, sessao);
  }
  throw new Error('Ação não implementada: ' + acao);
}

/* ================= AUTENTICAÇÃO ================= */
function propriedades(){ return PropertiesService.getScriptProperties(); }
function segredoToken(){
  const s = propriedades().getProperty('TOKEN_SECRET');
  if(!s) throw new Error('TOKEN_SECRET não configurado nas Propriedades do Script.');
  return s;
}
function idPastaImagens(){
  const id = propriedades().getProperty('PASTA_IMAGENS_ID');
  if(!id) throw new Error('PASTA_IMAGENS_ID não configurado nas Propriedades do Script.');
  return id;
}

function paraHex(bytes){ return bytes.map(b => (b<0?b+256:b).toString(16).padStart(2,'0')).join(''); }
function gerarSalt(){ return Utilities.getUuid(); }
function hashSenha(senha, salt){
  return paraHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, senha + '|' + salt));
}

function criarToken(usuario, papel){
  const payload = {usuario, papel, exp: Date.now() + 1000*60*60*24*30};
  const payloadB64 = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  const assinatura = paraHex(Utilities.computeHmacSha256Signature(payloadB64, segredoToken()));
  return payloadB64 + '.' + assinatura;
}
function verificarToken(token){
  if(!token) return null;
  const partes = String(token).split('.');
  if(partes.length !== 2) return null;
  const [payloadB64, assinatura] = partes;
  const esperada = paraHex(Utilities.computeHmacSha256Signature(payloadB64, segredoToken()));
  if(esperada !== assinatura) return null;
  let payload;
  try{ payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(payloadB64)).getDataAsString()); }
  catch(erro){ return null; }
  if(!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

function acaoLogin(dados){
  const usuarios = linhasComoObjetos('Usuarios');
  const u = usuarios.find(x => x.usuario === dados.usuario && Number(x.ativo) === 1);
  if(!u || hashSenha(dados.senha, u.salt) !== u.hash) return {erro:'Usuário ou senha inválidos.'};
  return {token: criarToken(u.usuario, u.papel), papel: u.papel, nome: u.nome, usuario: u.usuario};
}

/* ================= PLANILHA — HELPERS ================= */
function planilha(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function aba(nome){
  let sh = planilha().getSheetByName(nome);
  if(!sh) sh = planilha().insertSheet(nome);
  return sh;
}
function linhasComoObjetos(nome){
  const valores = aba(nome).getDataRange().getValues();
  if(valores.length < 2) return [];
  const cab = valores[0];
  return valores.slice(1).filter(l => l.some(c => c !== '')).map(l => {
    const o = {}; cab.forEach((c,i) => o[c] = l[i]); return o;
  });
}
/* setNumberFormat('@') + setValues na MESMA Range, na célula exata — appendRow() sozinho
   deixa o Sheets "adivinhar" datas/horas (ex. "19:30") e devolver objeto Date depois */
function gravarLinha(nomeAba, cabecalho, objeto){
  const sh = aba(nomeAba);
  const linha = sh.getLastRow() + 1;
  const valores = cabecalho.map(c => objeto[c] === undefined || objeto[c] === null ? '' : objeto[c]);
  const alvo = sh.getRange(linha, 1, 1, cabecalho.length);
  alvo.setNumberFormat('@');
  alvo.setValues([valores]);
}
function atualizarLinhaPorId(nomeAba, cabecalho, id, objeto){
  const sh = aba(nomeAba);
  const valores = sh.getDataRange().getValues();
  const idx = cabecalho.indexOf('id');
  for(let i=1;i<valores.length;i++){
    if(String(valores[i][idx]) === String(id)){
      const alvo = sh.getRange(i+1,1,1,cabecalho.length);
      alvo.setNumberFormat('@');
      alvo.setValues([cabecalho.map(c => objeto[c] === undefined || objeto[c] === null ? '' : objeto[c])]);
      return true;
    }
  }
  return false;
}
function apagarLinhaPorId(nomeAba, cabecalho, id){
  const sh = aba(nomeAba);
  const valores = sh.getDataRange().getValues();
  const idx = cabecalho.indexOf('id');
  for(let i=valores.length-1;i>=1;i--){
    if(String(valores[i][idx]) === String(id)){ sh.deleteRow(i+1); return true; }
  }
  return false;
}
function apagarLinhasOnde(nomeAba, cabecalho, condicao){
  const sh = aba(nomeAba);
  const valores = sh.getDataRange().getValues();
  for(let i=valores.length-1;i>=1;i--){
    const obj = {}; cabecalho.forEach((c,idx) => obj[c] = valores[i][idx]);
    if(condicao(obj)) sh.deleteRow(i+1);
  }
}
function limparAba(nome){
  const sh = aba(nome);
  if(sh.getLastRow() > 1) sh.getRange(2,1,sh.getLastRow()-1, sh.getLastColumn()).clearContent();
}

/* ================= CARREGAR TUDO ================= */
function carregarTudo(){
  const config = {};
  linhasComoObjetos('Config').forEach(l => config[l.chave] = l.valor);

  const ministerios = linhasComoObjetos('Ministerios').map(m => ({id:m.id, nome:m.nome, qtd:Number(m.qtd), cor:m.cor}));
  const cultos = linhasComoObjetos('Cultos').map(c => ({
    id:c.id, nome:c.nome, tipo:c.tipo, hora:c.hora,
    diaSemanai: c.diaSemanai !== '' && c.diaSemanai !== null ? Number(c.diaSemanai) : null,
    data: c.data || null
  }));
  const membros = linhasComoObjetos('Membros').map(m => ({
    id:m.id, nome:m.nome, telefone:m.telefone, foto:m.foto, nascimento:m.nascimento, conjuge:m.conjuge||'',
    endereco:m.endereco||'', email:m.email||'',
    ministerios: String(m.ministerios||'').split(',').map(s=>s.trim()).filter(Boolean),
    disponibilidade: String(m.disponibilidade||'').split(',').map(s=>s.trim()).filter(Boolean),
    ativo: Number(m.ativo) === 1, obs: m.obs
  }));

  const escalasBase = linhasComoObjetos('Escalas');
  const slotsBase = linhasComoObjetos('Slots');
  const escalas = {};
  escalasBase.forEach(e => {
    escalas[e.mes] = {
      mes: e.mes, geradaEm: e.geradaEm, folga: Number(e.folga),
      apertados: e.apertados ? JSON.parse(e.apertados) : [],
      slots: slotsBase.filter(s => s.mes === e.mes).map(s => ({
        id:s.id, data:s.data, hora:s.hora, ministerioId:s.ministerioId,
        membroId: s.membroId || null, forcado: Number(s.forcado) === 1
      }))
    };
  });

  const pastoreio = linhasComoObjetos('Pastoreio');
  const midia = linhasComoObjetos('Midia');
  return {config, ministerios, cultos, membros, escalas, pastoreio, midia};
}

/* ================= MEMBROS ================= */
function salvarMembro(dados){
  if(!dados.nome) throw new Error('Nome é obrigatório.');
  const registro = {
    id: dados.id || Utilities.getUuid(), nome: dados.nome, telefone: dados.telefone||'',
    foto: dados.foto||'', nascimento: dados.nascimento||'', conjuge: dados.conjuge||'',
    endereco: dados.endereco||'', email: dados.email||'',
    ministerios: (dados.ministerios||[]).join(','), disponibilidade: (dados.disponibilidade||[]).join(','),
    ativo: dados.ativo ? 1 : 0, obs: dados.obs||''
  };
  if(!dados.id || !atualizarLinhaPorId('Membros', CAB.Membros, dados.id, registro)) gravarLinha('Membros', CAB.Membros, registro);
  return carregarTudo();
}
function apagarMembro(dados){ apagarLinhaPorId('Membros', CAB.Membros, dados.id); return carregarTudo(); }

/* ================= AUTOCADASTRO PÚBLICO (cadastro.html) ================= */
/* dados não sensíveis pra montar o formulário sem exigir login: nome/foto da igreja, setores e cultos */
function opcoesPublicas(){
  const config = {};
  linhasComoObjetos('Config').forEach(l => config[l.chave] = l.valor);
  const ministerios = linhasComoObjetos('Ministerios').map(m => ({id:m.id, nome:m.nome, cor:m.cor}));
  const cultos = linhasComoObjetos('Cultos').map(c => ({id:c.id, nome:c.nome, tipo:c.tipo, hora:c.hora}));
  return {
    config: {nome:config.nome||'', lema:config.lema||'', capa:config.capa||'', logo:config.logo||''},
    ministerios, cultos
  };
}
/* grava direto na mesma aba Membros que o sistema interno usa — sempre cria (nunca edita).
   Quem NÃO quer servir entra ativo:1 (é só membro, nada pra aprovar). Quem MARCOU ministério(s)
   entra ativo:0 (pendente) — o gestor precisa habilitar manualmente antes de concorrer escala. */
function cadastroPublico(dados){
  if(!dados.nome) throw new Error('Informe seu nome completo.');
  if(!dados.telefone) throw new Error('Informe seu WhatsApp.');
  const ministerios = (Array.isArray(dados.ministerios) ? dados.ministerios : []).slice(0,3);
  const registro = {
    id: Utilities.getUuid(), nome: dados.nome, telefone: dados.telefone,
    foto:'', nascimento: dados.nascimento||'', conjuge: dados.conjuge||'',
    endereco: dados.endereco||'', email: dados.email||'',
    ministerios: ministerios.join(','), disponibilidade: '',
    ativo: ministerios.length ? 0 : 1,
    obs: 'Autocadastro pelo formulário público em ' + new Date().toISOString().slice(0,10)
  };
  gravarLinha('Membros', CAB.Membros, registro);
  return {nome: dados.nome, pendente: ministerios.length > 0};
}

/* ================= MINISTÉRIOS ================= */
function salvarMinisterio(dados){
  if(!dados.nome) throw new Error('Nome é obrigatório.');
  const registro = {id: dados.id || Utilities.getUuid(), nome:dados.nome, qtd:Math.max(1,Number(dados.qtd)||1), cor:dados.cor||'#8B5CF6'};
  if(!dados.id || !atualizarLinhaPorId('Ministerios', CAB.Ministerios, dados.id, registro)) gravarLinha('Ministerios', CAB.Ministerios, registro);
  return carregarTudo();
}
function apagarMinisterio(dados){
  apagarLinhaPorId('Ministerios', CAB.Ministerios, dados.id);
  const sh = aba('Membros');
  const valores = sh.getDataRange().getValues();
  const idx = CAB.Membros.indexOf('ministerios');
  for(let i=1;i<valores.length;i++){
    const lista = String(valores[i][idx]||'').split(',').map(s=>s.trim()).filter(x => x && x !== dados.id);
    sh.getRange(i+1, idx+1).setValue(lista.join(','));
  }
  return carregarTudo();
}

/* ================= CULTOS ================= */
function salvarCulto(dados){
  if(!dados.nome) throw new Error('Nome é obrigatório.');
  if(!dados.tipo || (dados.tipo !== 'Fixo' && dados.tipo !== 'Esporádico')) throw new Error('Tipo deve ser Fixo ou Esporádico.');
  const registro = {
    id: dados.id || Utilities.getUuid(), nome: dados.nome, tipo: dados.tipo,
    diaSemanai: dados.tipo === 'Fixo' ? (dados.diaSemanai === undefined || dados.diaSemanai === null || dados.diaSemanai === '' ? '' : dados.diaSemanai) : '',
    hora: dados.hora || '', data: dados.tipo === 'Esporádico' ? (dados.data || '') : ''
  };
  if(!dados.id || !atualizarLinhaPorId('Cultos', CAB.Cultos, dados.id, registro)) gravarLinha('Cultos', CAB.Cultos, registro);
  return carregarTudo();
}
function apagarCulto(dados){ apagarLinhaPorId('Cultos', CAB.Cultos, dados.id); return carregarTudo(); }

/* ================= CONFIG ================= */
function salvarCultosFn(dados){
  limparAba('Cultos');
  (dados.cultos||[]).forEach(c => gravarLinha('Cultos', CAB.Cultos, {dia:c.dia, hora:c.hora}));
  return carregarTudo();
}
function upsertConfig(chave, valor){
  const sh = aba('Config');
  const valores = sh.getDataRange().getValues();
  for(let i=1;i<valores.length;i++){
    if(valores[i][0] === chave){ sh.getRange(i+1,2).setValue(valor); return; }
  }
  sh.appendRow([chave, valor]);
}
function salvarConfigFn(dados){
  Object.keys(dados).forEach(k => upsertConfig(k, dados[k]));
  return carregarTudo();
}

/* ================= ESCALA ================= */
function apagarEscalaMes(mes){
  apagarLinhasOnde('Escalas', CAB.Escalas, l => l.mes === mes);
  apagarLinhasOnde('Slots', CAB.Slots, l => l.mes === mes);
}
function gerarEscalaFn(dados){
  if(!dados.mes || !Array.isArray(dados.slots)) throw new Error('Dados da escala incompletos.');
  apagarEscalaMes(dados.mes);
  gravarLinha('Escalas', CAB.Escalas, {mes:dados.mes, geradaEm:dados.geradaEm, folga:dados.folga, apertados: JSON.stringify(dados.apertados||[])});
  dados.slots.forEach(s => gravarLinha('Slots', CAB.Slots, {
    id:s.id, mes:dados.mes, data:s.data, hora:s.hora, ministerioId:s.ministerioId,
    membroId: s.membroId || '', forcado: s.forcado ? 1 : 0
  }));
  return carregarTudo();
}
function trocarSlotFn(dados){
  const sh = aba('Slots');
  const valores = sh.getDataRange().getValues();
  const idxId = CAB.Slots.indexOf('id'), idxMembro = CAB.Slots.indexOf('membroId'), idxForcado = CAB.Slots.indexOf('forcado');
  for(let i=1;i<valores.length;i++){
    if(String(valores[i][idxId]) === String(dados.slotId)){
      sh.getRange(i+1, idxMembro+1).setValue(dados.membroId||'');
      sh.getRange(i+1, idxForcado+1).setValue(0);
      break;
    }
  }
  return carregarTudo();
}
function apagarEscalaFn(dados){ apagarEscalaMes(dados.mes); return carregarTudo(); }

/* ================= PASTOREIO ================= */
function salvarPastoreio(dados){
  if(!dados.pessoa) throw new Error('Informe quem será visitado.');
  const registro = {
    id: dados.id || Utilities.getUuid(), pessoa:dados.pessoa, tipo:dados.tipo, data:dados.data, hora:dados.hora||'',
    responsavel:dados.responsavel||'', status:dados.status||'Agendado', assunto:dados.assunto||'', notas:dados.notas||''
  };
  if(!dados.id || !atualizarLinhaPorId('Pastoreio', CAB.Pastoreio, dados.id, registro)) gravarLinha('Pastoreio', CAB.Pastoreio, registro);
  return carregarTudo();
}
function apagarPastoreio(dados){ apagarLinhaPorId('Pastoreio', CAB.Pastoreio, dados.id); return carregarTudo(); }

/* ================= MÍDIA ================= */
function salvarMidia(dados){
  if(!dados.titulo) throw new Error('Dê um título para achar depois.');
  gravarLinha('Midia', CAB.Midia, {
    id: Utilities.getUuid(), titulo:dados.titulo, tipo:dados.tipo, tema:dados.tema||'', data:dados.data||'', url:dados.url||''
  });
  return carregarTudo();
}
function apagarMidia(dados){ apagarLinhaPorId('Midia', CAB.Midia, dados.id); return carregarTudo(); }

/* ================= UPLOAD DE IMAGEM (Drive) ================= */
function uploadImagem(dados){
  if(!dados.base64 || !dados.nomeArquivo) throw new Error('Arquivo inválido.');
  const pasta = DriveApp.getFolderById(idPastaImagens());
  const blob = Utilities.newBlob(Utilities.base64Decode(dados.base64), dados.tipoMime || 'image/jpeg', dados.nomeArquivo);
  const arquivo = pasta.createFile(blob);
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  /* "uc?export=view" não carrega de forma confiável como <img> embutido em página externa —
     o endpoint de thumbnail do Drive é o formato que o Google garante para hotlink */
  return {url: 'https://drive.google.com/thumbnail?id=' + arquivo.getId() + '&sz=w2000'};
}

/* ================= USUÁRIOS ================= */
function listarUsuarios(){
  return linhasComoObjetos('Usuarios').map(u => ({
    id:u.id, nome:u.nome, usuario:u.usuario, papel:u.papel, ativo:Number(u.ativo)===1, criadoEm:u.criadoEm
  }));
}
function criarUsuario(dados){
  if(!dados.usuario || !dados.senha || !dados.nome) throw new Error('Preencha nome, usuário e senha.');
  const usuarios = linhasComoObjetos('Usuarios');
  if(usuarios.some(u => u.usuario === dados.usuario)) throw new Error('Já existe um usuário com esse login.');
  const salt = gerarSalt();
  gravarLinha('Usuarios', CAB.Usuarios, {
    id: Utilities.getUuid(), nome:dados.nome, usuario:dados.usuario,
    hash: hashSenha(dados.senha, salt), salt, papel: dados.papel === 'gestor' ? 'gestor' : 'cadastro',
    ativo:1, criadoEm: new Date().toISOString()
  });
  return listarUsuarios();
}
function apagarUsuarioFn(dados, sessao){
  const usuarios = linhasComoObjetos('Usuarios');
  const alvo = usuarios.find(u => String(u.id) === String(dados.id));
  if(alvo && alvo.papel === 'gestor'){
    const outros = usuarios.filter(u => u.papel==='gestor' && String(u.id)!==String(dados.id) && Number(u.ativo)===1);
    if(!outros.length) throw new Error('Não é possível excluir o único gestor do sistema.');
  }
  apagarLinhaPorId('Usuarios', CAB.Usuarios, dados.id);
  return listarUsuarios();
}
function alterarMinhaSenha(dados, sessao){
  if(!dados.senhaNova || dados.senhaNova.length < 4) throw new Error('A nova senha deve ter pelo menos 4 caracteres.');
  const sh = aba('Usuarios');
  const valores = sh.getDataRange().getValues();
  const idxUsuario = CAB.Usuarios.indexOf('usuario'), idxHash = CAB.Usuarios.indexOf('hash'), idxSalt = CAB.Usuarios.indexOf('salt');
  for(let i=1;i<valores.length;i++){
    if(valores[i][idxUsuario] === sessao.usuario){
      if(valores[i][idxHash] !== hashSenha(dados.senhaAtual, valores[i][idxSalt])) throw new Error('Senha atual incorreta.');
      const novoSalt = gerarSalt();
      sh.getRange(i+1, idxHash+1).setValue(hashSenha(dados.senhaNova, novoSalt));
      sh.getRange(i+1, idxSalt+1).setValue(novoSalt);
      return {ok:true};
    }
  }
  throw new Error('Usuário não encontrado.');
}

/* ================= INSTALAÇÃO — rodar uma vez só ================= */
function configurarPlanilha(){
  Object.keys(CAB).forEach(nome => {
    const sh = aba(nome);
    if(sh.getLastRow() === 0){ sh.appendRow(CAB[nome]); sh.setFrozenRows(1); }
    /* força texto puro: sem isso o Sheets "adivinha" datas/horas (ex. "19:30") e
       devolve objeto Date em vez da string original quando o Apps Script lê de volta */
    sh.getRange(1, 1, 1000, CAB[nome].length).setNumberFormat('@');
  });
  SpreadsheetApp.flush(); /* garante que o formato de texto valha antes de gravar os dados abaixo */

  if(aba('Ministerios').getLastRow() <= 1){
    MINISTERIOS_PADRAO.forEach((m,i) => gravarLinha('Ministerios', CAB.Ministerios, {id:'m'+i, nome:m.nome, qtd:m.qtd, cor:m.cor}));
  }
  if(aba('Cultos').getLastRow() <= 1){
    gravarLinha('Cultos', CAB.Cultos, {id:Utilities.getUuid(), nome:'Domingo Matutino', tipo:'Fixo', diaSemanai:0, hora:'09:00', data:''});
    gravarLinha('Cultos', CAB.Cultos, {id:Utilities.getUuid(), nome:'Domingo Noturno', tipo:'Fixo', diaSemanai:0, hora:'19:00', data:''});
    gravarLinha('Cultos', CAB.Cultos, {id:Utilities.getUuid(), nome:'Sexta Profética', tipo:'Esporádico', diaSemanai:'', hora:'19:00', data:''});
    gravarLinha('Cultos', CAB.Cultos, {id:Utilities.getUuid(), nome:'Culto de Casais', tipo:'Esporádico', diaSemanai:'', hora:'19:00', data:''});
    gravarLinha('Cultos', CAB.Cultos, {id:Utilities.getUuid(), nome:'Encontro de Homens', tipo:'Esporádico', diaSemanai:'', hora:'07:00', data:''});
    gravarLinha('Cultos', CAB.Cultos, {id:Utilities.getUuid(), nome:'Restauração', tipo:'Esporádico', diaSemanai:'', hora:'19:00', data:''});
  }
  if(aba('Config').getLastRow() <= 1){
    upsertConfig('nome','Minha Igreja'); upsertConfig('lema','Casa de oração');
    upsertConfig('logo',''); upsertConfig('capa','');
  }
  if(aba('Usuarios').getLastRow() <= 1){
    const salt = gerarSalt();
    gravarLinha('Usuarios', CAB.Usuarios, {
      id: Utilities.getUuid(), nome:'Administrador', usuario:'gestor',
      hash: hashSenha('trocar123', salt), salt, papel:'gestor', ativo:1, criadoEm: new Date().toISOString()
    });
    Logger.log('Usuário inicial -> usuario: gestor | senha: trocar123 — troque assim que entrar (aba Dados > Alterar minha senha).');
  }
}
