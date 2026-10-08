'use strict';
const labels={queued:'รับรายการแล้ว',processing:'กำลังจัดทำไฟล์',saved:'บันทึกเรียบร้อย',failed:'ต้องดำเนินการต่อ'};
const stages={received:'รับรายการแล้ว',creating_sheets:'กำลังสร้าง Sheets',creating_pdf:'กำลังสร้าง PDF',notifying:'กำลังแจ้งเตือน',complete:'พร้อมใช้งาน'};
const notification={sent:'ส่งแล้ว',disabled:'ยังไม่เปิดใช้งาน',pending:'รอดำเนินการ',unknown:'ยังยืนยันไม่ได้',failed:'ไม่สำเร็จ',not_requested:'ไม่ต้องส่ง'};
let records=[],next=null,active=false,refreshing=false;
const el=id=>document.getElementById(id);
const error=err=>{el('notice').textContent=err.message || 'โหลดข้อมูลไม่สำเร็จ';};
function cell(text){const td=document.createElement('td');td.textContent=text;return td;}
function twoLines(first,second){const td=document.createElement('td'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=first;small.textContent=second;td.append(strong,small);return td;}
function render(){
  const query=el('search').value.trim().toLowerCase(),direction=el('direction').value,status=el('status').value;
  const rows=records.filter(r=>(!direction || r.direction===direction) && (!status || r.status===status) && (!query || [r.brand,r.fileName,r.poNumber,r.customer,r.asnId].join(' ').toLowerCase().includes(query)));
  el('total').textContent=records.length;el('pending').textContent=records.filter(r=>['queued','processing'].includes(r.status)).length;el('saved').textContent=records.filter(r=>r.status==='saved').length;el('attention').textContent=records.filter(r=>r.status==='failed' || ['unknown','failed'].includes(r.lineStatus) || ['unknown','failed'].includes(r.emailStatus)).length;
  el('rows').replaceChildren();el('empty').hidden=rows.length>0;el('count').textContent=`แสดง ${rows.length} จาก ${records.length} รายการที่โหลด`;
  for(const r of rows){
    const tr=document.createElement('tr');tr.append(twoLines(r.fileName,r.customer+' · '+new Intl.DateTimeFormat('th-TH',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(r.createdAt))),twoLines(r.brand,r.poNumber?'PO '+r.poNumber:'—'));
    const directionCell=cell(''),directionBadge=document.createElement('span');directionBadge.className='badge '+(r.direction==='Outbound'?'outbound':'');directionBadge.textContent=r.direction;directionCell.append(directionBadge);tr.append(directionCell);
    const statusCell=cell(''),badge=document.createElement('span');badge.className='badge '+r.status;badge.textContent=labels[r.status];statusCell.append(badge);const stage=document.createElement('small');stage.textContent=r.message || stages[r.stage];statusCell.append(stage);
    if(r.status==='failed'){const retry=document.createElement('button');retry.className='retry';retry.textContent='ดำเนินการต่อ →';retry.onclick=async()=>{retry.disabled=true;try{const result=await window.ASNCloud.post({action:'retryASN',id:r.id});if(!result.success)throw Error(result.message);await refresh();}catch(err){error(err);}finally{retry.disabled=false;}};statusCell.append(retry);}tr.append(statusCell);
    tr.append(twoLines('LINE · '+(notification[r.lineStatus] || r.lineStatus),'อีเมล · '+(notification[r.emailStatus] || r.emailStatus)));
    const downloadCell=cell(''),wrap=document.createElement('div');wrap.className='downloads';
    for(const [type,label,ready] of [['pdf','PDF',r.hasPdf],['xlsx','Excel',r.hasSheets]]){if(!ready)continue;const button=document.createElement('button');button.textContent=label;button.onclick=async()=>{button.disabled=true;try{await window.ASNCloud.download(r.id,type);}catch(err){error(err);}finally{button.disabled=false;}};wrap.append(button);}
    if(!wrap.childNodes.length)wrap.textContent='—';downloadCell.append(wrap);tr.append(downloadCell);el('rows').append(tr);
  }
  el('more').hidden=!next;el('scope').textContent=`${records.length?records.length+' รายการล่าสุด':'100 รายการล่าสุด'}ในระบบใหม่`;
}
async function refresh(append=false){
  if(!active || refreshing)return;refreshing=true;el('refresh').disabled=true;el('more').disabled=true;
  try{const result=await window.ASNCloud.post({action:'management',limit:100,...(append && next?{before:next}:{})});if(!result.success)throw Error(result.message || 'ไม่มีสิทธิ์เข้าถึง');records=append?[...records,...result.submissions]:result.submissions;next=result.next;el('notice').textContent='';el('updated').textContent='อัปเดต '+new Date().toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'});render();}
  finally{refreshing=false;el('refresh').disabled=false;el('more').disabled=false;}
}
async function enter(){const result=await window.ASNCloud.post({action:'session'});if(!result.success || !result.admin)throw Error('บัญชีนี้ไม่มีสิทธิ์ผู้ดูแล ASN');active=true;el('login').hidden=true;el('dashboard').hidden=false;el('signOut').hidden=false;await refresh();}
el('signIn').onclick=async()=>{el('signIn').disabled=true;el('loginError').textContent='';try{await window.ASNCloud.adminLogin();await enter();}catch(err){el('loginError').textContent=err.message;}finally{el('signIn').disabled=false;}};
el('signOut').onclick=async()=>{active=false;await window.ASNCloud.logout();records=[];el('dashboard').hidden=true;el('login').hidden=false;el('signOut').hidden=true;};
el('refresh').onclick=()=>refresh().catch(error);el('more').onclick=()=>refresh(true).catch(error);
for(const id of ['search','direction','status'])el(id).addEventListener('input',render);
el('checkConfig').onclick=async()=>{try{const result=await window.ASNCloud.post({action:'checkConfiguration'});if(!result.success)throw Error(result.message);el('notice').textContent=`เชื่อมต่อโฟลเดอร์ ${result.archiveFolder} เรียบร้อย · LINE ${result.lineEnabled?'เปิดใช้งาน':'ยังไม่เปิดใช้งาน'} · อีเมล ${result.emailEnabled?'เปิดใช้งาน':'ยังไม่เปิดใช้งาน'}`;}catch(err){error(err);}};
window.ASNCloud.ready.then(auth=>{if(auth.currentUser)return enter();}).catch(err=>el('loginError').textContent=err.message);
setInterval(()=>{if(active)refresh().catch(error);},15000);
