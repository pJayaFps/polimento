const express = require('express');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const router = express.Router();
const { db } = require('../database/database');

const auth = (req, res, next) => req.session.user ? next() : res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
router.use(auth);
const clean = (v, max = 300) => typeof v === 'string' ? v.trim().replace(/[<>]/g, '').slice(0, max) : '';
const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v + 'T12:00:00').valueOf());
function validate(body) {
  const p = { data: clean(body.data, 10), hora: clean(body.hora, 5), chassi: clean(body.chassi, 40).toUpperCase(), carro: clean(body.carro, 80), modelo: clean(body.modelo, 100), cor: clean(body.cor, 100), tipo_polimento: clean(body.tipo_polimento, 12), observacoes: clean(body.observacoes, 1000), responsavel: clean(body.responsavel, 100) };
  if (!validDate(p.data)) return { error: 'Informe uma data válida.' };
  if (!/^\d{2}:\d{2}$/.test(p.hora)) p.hora = new Date().toTimeString().slice(0, 5);
  if (!p.chassi) return { error: 'Informe o chassi do veículo.' };
  if (!p.carro) return { error: 'Informe o carro.' };
  if (['H6', 'ORA 03'].includes(p.carro) && !p.modelo) return { error: 'Informe o modelo/versão.' };
  if (!p.modelo) p.modelo = 'Não se aplica';
  if (!p.cor) return { error: 'Informe a cor.' };
  if (!['COMPLETO', 'PARCIAL'].includes(p.tipo_polimento)) return { error: 'Selecione o tipo de polimento.' };
  return { p };
}
function filters(q) {
  const where = [], params = [];
  if (validDate(q.inicio)) { where.push('data >= ?'); params.push(q.inicio); }
  if (validDate(q.fim)) { where.push('data <= ?'); params.push(q.fim); }
  ['carro','modelo','cor','tipo_polimento'].forEach(k => { if (q[k]) { where.push(`${k} = ?`); params.push(clean(q[k], 100)); } });
  if (q.chassi) { where.push('chassi LIKE ?'); params.push(`%${clean(q.chassi, 40).toUpperCase()}%`); }
  return { where: where.length ? ' WHERE ' + where.join(' AND ') : '', params };
}
function records(q) { const f=filters(q); return db.prepare('SELECT * FROM polimentos'+f.where+' ORDER BY data DESC, hora DESC, id DESC').all(...f.params); }
function requestChange(req, action, polimentoId, data) {
  return db.prepare('INSERT INTO solicitacoes (acao,polimento_id,dados,solicitante_id,solicitante_nome,criado_em) VALUES (?,?,?,?,?,?)')
    .run(action, polimentoId || null, JSON.stringify(data || {}), req.session.user.id, req.session.user.nome, new Date().toISOString());
}
function leaderOnly(req,res,next){ return req.session.user.papel==='lider' ? next() : res.status(403).json({error:'Acesso exclusivo do Líder.'}); }
router.get('/', (req,res) => res.json(records(req.query)));
router.get('/estatisticas', (req,res) => { const f=filters(req.query); const rows=db.prepare('SELECT carro, cor, tipo_polimento FROM polimentos'+f.where).all(...f.params); res.json({ total:rows.length, completos:rows.filter(r=>r.tipo_polimento==='COMPLETO').length, parciais:rows.filter(r=>r.tipo_polimento==='PARCIAL').length, porCarro:group(rows,'carro'), porCor:group(rows,'cor') }); });
function group(rows,key) { return Object.entries(rows.reduce((a,r)=>{a[r[key]]=(a[r[key]]||0)+1;return a},{})).map(([nome,quantidade])=>({nome,quantidade})).sort((a,b)=>b.quantidade-a.quantidade); }
router.get('/solicitacoes', leaderOnly, (req,res) => res.json(db.prepare("SELECT * FROM solicitacoes WHERE status='PENDENTE' ORDER BY criado_em ASC").all().map(r=>({...r,dados:JSON.parse(r.dados||'{}'),atual:r.polimento_id?db.prepare('SELECT * FROM polimentos WHERE id=?').get(r.polimento_id):null}))));
router.post('/solicitacoes/:id/aprovar', leaderOnly, (req,res) => { const s=db.prepare("SELECT * FROM solicitacoes WHERE id=? AND status='PENDENTE'").get(Number(req.params.id)); if(!s)return res.status(404).json({error:'Solicitação não encontrada ou já decidida.'}); const p=JSON.parse(s.dados||'{}'); const run=db.transaction(()=>{if(s.acao==='CRIAR') db.prepare('INSERT INTO polimentos (data,hora,chassi,carro,modelo,cor,tipo_polimento,observacoes,responsavel,criado_em) VALUES (@data,@hora,@chassi,@carro,@modelo,@cor,@tipo_polimento,@observacoes,@responsavel,@criado_em)').run({...p,criado_em:new Date().toISOString()}); if(s.acao==='EDITAR'){const info=db.prepare('UPDATE polimentos SET data=@data,hora=@hora,chassi=@chassi,carro=@carro,modelo=@modelo,cor=@cor,tipo_polimento=@tipo_polimento,observacoes=@observacoes,responsavel=@responsavel,atualizado_em=@atualizado_em WHERE id=@id').run({...p,id:s.polimento_id,atualizado_em:new Date().toISOString()});if(!info.changes)throw Error('Registro original não encontrado.');} if(s.acao==='EXCLUIR'){const info=db.prepare('DELETE FROM polimentos WHERE id=?').run(s.polimento_id);if(!info.changes)throw Error('Registro original não encontrado.');}db.prepare("UPDATE solicitacoes SET status='APROVADO',decidido_em=?,decidido_por=? WHERE id=?").run(new Date().toISOString(),req.session.user.nome,s.id);});try{run();res.json({ok:true});}catch(e){res.status(400).json({error:e.message||'Não foi possível aprovar.'});}});
router.post('/solicitacoes/:id/rejeitar', leaderOnly, (req,res) => { const info=db.prepare("UPDATE solicitacoes SET status='REJEITADO',decidido_em=?,decidido_por=? WHERE id=? AND status='PENDENTE'").run(new Date().toISOString(),req.session.user.nome,Number(req.params.id));info.changes?res.json({ok:true}):res.status(404).json({error:'Solicitação não encontrada ou já decidida.'}); });
router.get('/:id(\\d+)', (req,res) => { const r=db.prepare('SELECT * FROM polimentos WHERE id=?').get(Number(req.params.id)); r ? res.json(r) : res.status(404).json({error:'Registro não encontrado.'}); });
router.post('/', (req,res) => { const v=validate(req.body); if(v.error)return res.status(400).json(v); if(req.session.user.papel==='polidor'){requestChange(req,'CRIAR',null,v.p);return res.status(202).json({pendente:true,message:'Solicitação enviada para aprovação do Líder.'});} const now=new Date().toISOString(); const info=db.prepare('INSERT INTO polimentos (data,hora,chassi,carro,modelo,cor,tipo_polimento,observacoes,responsavel,criado_em) VALUES (@data,@hora,@chassi,@carro,@modelo,@cor,@tipo_polimento,@observacoes,@responsavel,@criado_em)').run({...v.p,criado_em:now}); res.status(201).json(db.prepare('SELECT * FROM polimentos WHERE id=?').get(info.lastInsertRowid)); });
router.put('/:id(\\d+)', (req,res) => { const v=validate(req.body); if(v.error)return res.status(400).json(v); if(req.session.user.papel==='polidor'){if(!db.prepare('SELECT id FROM polimentos WHERE id=?').get(Number(req.params.id)))return res.status(404).json({error:'Registro não encontrado.'});requestChange(req,'EDITAR',Number(req.params.id),v.p);return res.status(202).json({pendente:true,message:'Alteração enviada para aprovação do Líder.'});} const info=db.prepare('UPDATE polimentos SET data=@data,hora=@hora,chassi=@chassi,carro=@carro,modelo=@modelo,cor=@cor,tipo_polimento=@tipo_polimento,observacoes=@observacoes,responsavel=@responsavel,atualizado_em=@atualizado_em WHERE id=@id').run({...v.p,id:Number(req.params.id),atualizado_em:new Date().toISOString()}); info.changes ? res.json(db.prepare('SELECT * FROM polimentos WHERE id=?').get(Number(req.params.id))) : res.status(404).json({error:'Registro não encontrado.'}); });
router.delete('/:id(\\d+)', (req,res) => { const id=Number(req.params.id);if(req.session.user.papel==='polidor'){if(!db.prepare('SELECT id FROM polimentos WHERE id=?').get(id))return res.status(404).json({error:'Registro não encontrado.'});requestChange(req,'EXCLUIR',id,{});return res.status(202).json({pendente:true,message:'Exclusão enviada para aprovação do Líder.'});} const info=db.prepare('DELETE FROM polimentos WHERE id=?').run(id); info.changes ? res.json({ok:true}) : res.status(404).json({error:'Registro não encontrado.'}); });
router.get('/export/excel', (req,res) => { const rs=records(req.query).map(r=>({Data:r.data.split('-').reverse().join('/'),Hora:r.hora,Chassi:r.chassi,Carro:r.carro,'Modelo/Versão':r.modelo,Cor:r.cor,Tipo:r.tipo_polimento,Observações:r.observacoes||'',Responsável:r.responsavel||''})); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rs),'Polimentos'); const out=XLSX.write(wb,{type:'buffer',bookType:'xlsx'}); res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="relatorio-polimentos.xlsx"'}).send(out); });
router.get('/export/pdf', (req,res) => { const rs=records(req.query), c=rs.filter(r=>r.tipo_polimento==='COMPLETO').length; const doc=new PDFDocument({margin:35,size:'A4',layout:'landscape'}); res.set({'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="relatorio-polimentos.pdf"'}); doc.pipe(res); doc.fontSize(18).text('RELATÓRIO DE POLIMENTOS'); doc.moveDown(.3).fontSize(10).text(`Período: ${req.query.inicio||'Início'} a ${req.query.fim||'Hoje'}`); doc.moveDown(); const xs=[35,95,220,300,400,530], heads=['Data','Chassi','Carro','Modelo','Cor','Tipo']; doc.font('Helvetica-Bold'); heads.forEach((h,i)=>doc.text(h,xs[i],100,{width:i===5?100:90})); let y=120; doc.font('Helvetica'); rs.forEach((r,i)=>{if(y>520){doc.addPage();y=50;} [r.data.split('-').reverse().join('/'),r.chassi,r.carro,r.modelo,r.cor,r.tipo_polimento].forEach((v,j)=>doc.text(String(v),xs[j],y,{width:j===5?100:90}));y+=20;}); doc.font('Helvetica-Bold').text(`Total de polimentos: ${rs.length}   |   Completos: ${c}   |   Parciais: ${rs.length-c}`,35,y+15); doc.end(); });
module.exports = router;
