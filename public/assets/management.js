'use strict';
const labels={queued:'รับรายการแล้ว',processing:'กำลังจัดทำไฟล์',saved:'บันทึกเรียบร้อย',failed:'ต้องดำเนินการต่อ'};
const stages={received:'รับรายการแล้ว',creating_sheets:'กำลังสร้าง Sheets',creating_pdf:'กำลังสร้าง PDF',notifying:'กำลังแจ้งเตือน',complete:'พร้อมใช้งาน'};
const notification={sent:'ส่งแล้ว',disabled:'ยังไม่เปิดใช้งาน',pending:'รอดำเนินการ',unknown:'ยังยืนยันไม่ได้',failed:'ไม่สำเร็จ',not_requested:'ไม่ต้องส่ง'};
const reviewLabels={pending:'รอตรวจสอบ',confirmed:'ยืนยันแล้ว',rejected:'ปฏิเสธ'};
let records=[],next=null,active=false,refreshing=false,reviewRecord=null,reviewAttempt=null,reviewBusy=false,reviewLoad=0,reviewFocus=null,linkedReviewOpened=false;
const el=id=>document.getElementById(id);
const error=err=>{el('notice').textContent=err.message || 'โหลดข้อมูลไม่สำเร็จ';};
function cell(text){const td=document.createElement('td');td.textContent=text;return td;}
function twoLines(first,second){const td=document.createElement('td'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=first;small.textContent=second;td.append(strong,small);return td;}
function render(){
  const query=el('search').value.trim().toLowerCase(),direction=el('direction').value,status=el('status').value,reviewStatus=el('reviewStatus').value;
  const rows=records.filter(r=>(!direction || r.direction===direction) && (!status || r.status===status) && (!reviewStatus || (r.reviewStatus || 'pending')===reviewStatus) && (!query || [r.brand,r.fileName,r.poNumber,r.customer,r.asnId].join(' ').toLowerCase().includes(query)));
  el('total').textContent=records.length;el('pending').textContent=records.filter(r=>['queued','processing'].includes(r.status)).length;el('saved').textContent=records.filter(r=>r.status==='saved').length;el('awaitingReview').textContent=records.filter(r=>r.status==='saved' && (r.reviewStatus || 'pending')==='pending').length;el('attention').textContent=records.filter(r=>r.status==='failed' || ['unknown','failed'].includes(r.lineStatus) || ['unknown','failed'].includes(r.emailStatus)).length;
  el('rows').replaceChildren();el('empty').hidden=rows.length>0;el('count').textContent=`แสดง ${rows.length} จาก ${records.length} รายการที่โหลด`;
  for(const r of rows){
    const tr=document.createElement('tr');tr.append(twoLines(r.fileName,r.customer+' · '+new Intl.DateTimeFormat('th-TH',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(r.createdAt))),twoLines(r.brand,r.poNumber?'PO '+r.poNumber:'—'));
    const directionCell=cell(''),directionBadge=document.createElement('span');directionBadge.className='badge '+(r.direction==='Outbound'?'outbound':'');directionBadge.textContent=r.direction;directionCell.append(directionBadge);tr.append(directionCell);
    const statusCell=cell(''),badge=document.createElement('span');badge.className='badge '+r.status;badge.textContent=labels[r.status];statusCell.append(badge);const stage=document.createElement('small');stage.textContent=r.message || stages[r.stage];statusCell.append(stage);
    if(r.status==='failed'){const retry=document.createElement('button');retry.className='retry';retry.textContent='ดำเนินการต่อ →';retry.onclick=async()=>{retry.disabled=true;try{const result=await window.ASNCloud.post({action:'retryASN',id:r.id});if(!result.success)throw Error(result.message);await refresh();}catch(err){error(err);}finally{retry.disabled=false;}};statusCell.append(retry);}tr.append(statusCell);
    const reviewCell=cell(''),reviewBadge=document.createElement('span');reviewBadge.className='badge '+(r.reviewStatus || 'pending');reviewBadge.textContent=reviewLabels[r.reviewStatus || 'pending'];reviewCell.append(reviewBadge);
    if(r.reviewReason){const note=document.createElement('small');note.className='review-status-note';note.textContent=r.reviewReason;reviewCell.append(note);}
    if(r.reviewedAt){const audit=document.createElement('small');audit.className='review-status-note';audit.textContent=(r.reviewedBy || '')+' · '+new Date(r.reviewedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'});reviewCell.append(audit);}
    const reviewButtons=document.createElement('div');reviewButtons.className='review-buttons';
    for(const [label,decision,className] of [['ดูรายละเอียด',null,'secondary'],...(r.status==='saved' && (r.reviewStatus || 'pending')==='pending'?[['Confirm','confirmed','primary'],['Reject','rejected','reject-button']]:[])]){const button=document.createElement('button');button.textContent=label;button.className=className;button.onclick=()=>openReview(r,decision);reviewButtons.append(button);}
    reviewCell.append(reviewButtons);tr.append(reviewCell);
    tr.append(twoLines('LINE · '+(notification[r.lineStatus] || r.lineStatus),'อีเมล · '+(notification[r.emailStatus] || r.emailStatus)));
    const downloadCell=cell(''),wrap=document.createElement('div');wrap.className='downloads';
    for(const [type,label,ready] of [['pdf','PDF',r.hasPdf],['xlsx','Excel',r.hasSheets]]){if(!ready)continue;const button=document.createElement('button');button.textContent=label;button.onclick=async()=>{button.disabled=true;try{await window.ASNCloud.download(r.id,type,r.fileName);}catch(err){error(err);}finally{button.disabled=false;}};wrap.append(button);}
    if(!wrap.childNodes.length)wrap.textContent='—';downloadCell.append(wrap);tr.append(downloadCell);el('rows').append(tr);
  }
  el('more').hidden=!next;el('scope').textContent=`${records.length?records.length+' รายการล่าสุด':'100 รายการล่าสุด'}ในระบบใหม่`;
}
async function refresh(append=false){
  if(!active || refreshing)return;refreshing=true;el('refresh').disabled=true;el('more').disabled=true;
  try{const result=await window.ASNCloud.post({action:'management',limit:100,...(append && next?{before:next}:{})});if(!result.success)throw Error(result.message || 'ไม่มีสิทธิ์เข้าถึง');records=append?[...records,...result.submissions]:result.submissions;next=result.next;el('notice').textContent='';el('updated').textContent='อัปเดต '+new Date().toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'});render();}
  finally{refreshing=false;el('refresh').disabled=false;el('more').disabled=false;}
}
async function enter(){const result=await window.ASNCloud.post({action:'session'});if(!result.success || !result.admin)throw Error('บัญชีนี้ไม่มีสิทธิ์ผู้ดูแล ASN');active=true;el('login').hidden=true;el('dashboard').hidden=false;el('signOut').hidden=false;await refresh();await openLinkedReview();}
async function openLinkedReview(){
  if(!active || linkedReviewOpened)return;
  const query=new URLSearchParams(window.location?.search || ''),id=query.get('asn');
  if(!/^[a-f0-9]{64}$/.test(id || ''))return;
  linkedReviewOpened=true;const decision=['confirmed','rejected'].includes(query.get('review'))?query.get('review'):null;
  await openReview({id,fileName:'รายละเอียด ASN'},decision);
}
el('signIn').onclick=async()=>{el('signIn').disabled=true;el('loginError').textContent='';try{await window.ASNCloud.adminLogin();await enter();}catch(err){el('loginError').textContent=err.message;}finally{el('signIn').disabled=false;}};
el('signOut').onclick=async()=>{closeReview();active=false;linkedReviewOpened=false;await window.ASNCloud.logout();records=[];el('dashboard').hidden=true;el('login').hidden=false;el('signOut').hidden=true;};
el('refresh').onclick=()=>refresh().catch(error);el('more').onclick=()=>refresh(true).catch(error);
for(const id of ['search','direction','status','reviewStatus'])el(id).addEventListener('input',render);
el('checkConfig').onclick=async()=>{try{const result=await window.ASNCloud.post({action:'checkConfiguration'});if(!result.success)throw Error(result.message);el('notice').textContent=`เชื่อมต่อโฟลเดอร์ ${result.archiveFolder} เรียบร้อย · LINE ${result.lineEnabled?'เปิดใช้งาน':'ยังไม่เปิดใช้งาน'} · อีเมล ${result.emailEnabled?'เปิดใช้งาน':'ยังไม่เปิดใช้งาน'}`;}catch(err){error(err);}};
window.ASNCloud.ready.then(auth=>{if(auth.currentUser)return enter();}).catch(err=>el('loginError').textContent=err.message);
setInterval(()=>{if(active)refresh().catch(error);},15000);

function reviewReady(r){return r?.status==='saved' && r.hasSheets && r.hasPdf && (r.reviewStatus || 'pending')==='pending';}
function reviewControls(){
  const ready=reviewReady(reviewRecord),attempt=reviewAttempt;
  el('confirmASN').disabled=reviewBusy || !ready || (attempt && attempt.decision!=='confirmed');
  el('rejectASN').disabled=reviewBusy || !ready || (attempt && attempt.decision!=='rejected');
  el('confirmASN').textContent=attempt?.decision==='confirmed'?'ลองส่ง Confirm อีกครั้ง':'Confirm';
  el('rejectASN').textContent=attempt?.decision==='rejected'?'ลองส่ง Reject อีกครั้ง':'Reject';
  el('reviewReason').disabled=reviewBusy || !ready || Boolean(attempt);
  el('closeReview').disabled=reviewBusy;el('cancelReview').disabled=reviewBusy;
}
function closeReview(){
  if(reviewBusy)return;
  reviewLoad++;el('reviewOverlay').hidden=true;el('dashboard').inert=false;document.querySelector('header').inert=false;document.body.style.overflow='';reviewRecord=null;reviewAttempt=null;reviewFocus?.focus?.();
}
function displayReview(r){
  reviewRecord=r;el('reviewFile').textContent=r.fileName;el('reviewSummary').replaceChildren();
  const doc=r.submission.document;
  for(const [label,value] of [['ลูกค้า',r.customer],['Brand / ประเภท',r.brand+' · '+r.direction],['PO',doc.poNumber],['วัน-เวลาที่คาดว่าจะมาถึง / ส่งออก',doc.expectedArrival?.replace('T',' ')],['บริษัทผู้ส่ง',doc.senderCompany],['ที่อยู่บริษัท',doc.senderAddress],['ผู้ติดต่อ',doc.senderName],['โทรศัพท์',doc.senderPhone],['หมายเหตุ ASN',doc.remark]]){const group=document.createElement('dl'),title=document.createElement('dt'),valueEl=document.createElement('dd');title.textContent=label;valueEl.textContent=value || '—';group.append(title,valueEl);el('reviewSummary').append(group);}
  el('reviewItems').replaceChildren();r.submission.lines.forEach((line,i)=>{const tr=document.createElement('tr');for(const value of [i+1,line.sku,line.name,line.lot,line.expiryDate,[line.width,line.length,line.height].join(' × '),line.qtyCarton,line.qtyPiece,line.remark])tr.append(cell(String(value ?? '')));el('reviewItems').append(tr);});
  el('reviewDecision').textContent=(r.reviewStatus || 'pending')==='pending'?(r.status==='saved'?'รอผู้ดูแลตรวจสอบ':'รอให้ไฟล์พร้อมก่อน Confirm / Reject'):[reviewLabels[r.reviewStatus],r.reviewedBy?'โดย '+r.reviewedBy:'',r.reviewedAt?new Date(r.reviewedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'',r.reviewReason].filter(Boolean).join(' · ');
  el('reviewDownloads').replaceChildren();for(const [type,label,ready] of [['pdf','เปิด PDF',r.hasPdf],['xlsx','ดาวน์โหลด Excel',r.hasSheets]]){if(!ready)continue;const button=document.createElement('button');button.textContent=label;button.onclick=async()=>{button.disabled=true;try{await window.ASNCloud.download(r.id,type,r.fileName);}catch(err){el('reviewError').textContent=err.message;}finally{button.disabled=false;}};el('reviewDownloads').append(button);}
  el('reviewReasonLabel').hidden=(r.reviewStatus || 'pending')!=='pending';el('reviewContent').hidden=false;reviewControls();
}
async function openReview(row,decision){
  const load=++reviewLoad;reviewFocus=document.activeElement;reviewRecord=null;reviewAttempt=null;el('reviewReason').value='';el('reviewError').textContent='';el('reviewContent').hidden=true;el('reviewLoading').hidden=false;el('reviewFile').textContent=row.fileName;el('reviewOverlay').hidden=false;el('dashboard').inert=true;document.querySelector('header').inert=true;document.body.style.overflow='hidden';reviewControls();el('closeReview').focus?.();
  try{const result=await window.ASNCloud.post({action:'getSubmission',id:row.id});if(load!==reviewLoad)return;if(!result.success)throw Error(result.message || 'โหลดรายละเอียดไม่สำเร็จ');displayReview(result);if(reviewReady(result)){if(decision==='rejected'){el('reviewDecision').textContent='ระบุเหตุผล แล้วกดปฏิเสธ ASN เพื่อบันทึกผล';el('reviewReason').focus?.();}else if(decision==='confirmed'){el('reviewDecision').textContent='ตรวจสอบรายละเอียด แล้วกดยืนยัน ASN เพื่อบันทึกผล';el('confirmASN').focus?.();}}}
  catch(err){if(load===reviewLoad)el('reviewError').textContent=err.message;}
  finally{if(load===reviewLoad)el('reviewLoading').hidden=true;}
}
async function submitReview(decision){
  if(reviewBusy || !reviewReady(reviewRecord))return;
  const reason=el('reviewReason').value.trim();if(decision==='rejected' && !reason){el('reviewError').textContent='กรุณาระบุเหตุผลที่ปฏิเสธ';el('reviewReason').focus?.();return;}
  if(reviewAttempt && reviewAttempt.decision!==decision)return;
  const attempt=reviewAttempt || {action:'reviewASN',id:reviewRecord.id,decision,reason,requestId:crypto.randomUUID()};reviewAttempt=attempt;reviewBusy=true;reviewControls();el('reviewError').textContent='';
  try{
    const result=await window.ASNCloud.post(attempt);
    if(!result.success){reviewAttempt=null;if(result.code==='ALREADY_REVIEWED'){const latest=await window.ASNCloud.post({action:'getSubmission',id:attempt.id});if(latest.success)displayReview(latest);}throw Error(result.message || 'บันทึกผลการตรวจสอบไม่สำเร็จ');}
    records=records.map(r=>r.id===result.id?{...r,...result}:r);reviewAttempt=null;displayReview({...reviewRecord,...result});render();
  }catch(err){el('reviewError').textContent=err.message+(reviewAttempt?' · ยังยืนยันผลไม่ได้ คุณสามารถลองส่งการตัดสินใจเดิมอีกครั้งได้':'');}
  finally{reviewBusy=false;reviewControls();}
}
el('closeReview').onclick=closeReview;el('cancelReview').onclick=closeReview;el('confirmASN').onclick=()=>submitReview('confirmed');el('rejectASN').onclick=()=>submitReview('rejected');
document.addEventListener('keydown',event=>{
  if(el('reviewOverlay').hidden)return;
  if(event.key==='Escape'){event.preventDefault();closeReview();}
  if(event.key==='Tab'){const focusable=[...el('reviewDialog').querySelectorAll('button,textarea')].filter(node=>!node.disabled && !node.closest('[hidden]'));if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(event.shiftKey && (document.activeElement===first || !el('reviewDialog').contains(document.activeElement))){event.preventDefault();last.focus?.();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus?.();}}
});
