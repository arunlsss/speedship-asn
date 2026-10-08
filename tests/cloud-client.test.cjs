const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {parseHTML}=require('linkedom');
const {webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..');
function harness(html,cloud){
  const {document,window}=parseHTML(html);
  window.ASNCloud=cloud;window.ASN_CONFIG={backend:'firebase'};window.scrollTo=()=>{};
  for(const select of document.querySelectorAll('select'))Object.defineProperty(select,'value',{value:select.querySelector('option')?.getAttribute('value') ?? select.querySelector('option')?.textContent ?? '',writable:true,configurable:true});
  const storage=new Map();
  const context=vm.createContext({window,document,console,crypto:webcrypto,Intl,Date,Uint8Array,AbortController,URLSearchParams,sessionStorage:{getItem:k=>storage.get(k) || null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setInterval:()=>1,setTimeout:(fn)=>{queueMicrotask(fn);return 1;},clearTimeout:()=>{},flatpickr:()=>{},XLSX:{}});
  return {context,document,window,storage};
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const inline=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(m=>!m[1].includes('src=')).map(m=>m[2]).join('\n');
test('all customer inline scripts and management script parse',()=>{new vm.Script(inline);new vm.Script(fs.readFileSync(path.join(root,'public/assets/management.js'),'utf8'));assert.equal(html.includes('script.google.com'),false);assert.equal(html.includes('gasPost('),false);});
test('customer submission waits for saved receipt, preserves ID and releases loading state',async()=>{
  const requests=[],auth={currentUser:{uid:'customer-test'}};
  const receipt={success:true,id:'a'.repeat(64),status:'saved',stage:'complete',fileName:'Example 2026-10-07 001',direction:'Inbound',lineStatus:'sent',emailStatus:'sent',hasSheets:true,hasPdf:true};
  const cloud={ready:Promise.resolve(auth),post:async p=>{requests.push(p);if(p.action==='submitASN')return {...receipt,status:'queued',stage:'received'};if(p.action==='getReceipt')return receipt;if(p.action==='mySubmissions')return {success:true,submissions:[receipt]};return {success:true};}};
  const h=harness(html,cloud);vm.runInContext(inline,h.context);
  h.context.validateForm=()=>null;h.context.getLines=()=>[{sku:'00123',name:'Example',qtyCarton:1,qtyPiece:12}];h.context.getEmails=()=>[];
  vm.runInContext("sessionToken='firebase';currentBrand='Example Brand'",h.context);h.document.getElementById('fDirection').value='Inbound';
  await h.context.doSubmit();assert.equal(h.document.getElementById('submitBtn').disabled,false);assert.equal(h.document.getElementById('asnPage').inert,false);assert.equal(h.document.getElementById('successAsnId').textContent,receipt.fileName);assert.ok(h.document.getElementById('successModal').classList.contains('show'));assert.equal(requests.filter(p=>p.action==='submitASN').length,1);assert.equal(h.storage.has('asn.attempt'),false);
});
test('network interruption retains submission ID and a retry uses that same ID',async()=>{
  const ids=[],auth={currentUser:{uid:'customer-test'}};let interrupted=true;
  const cloud={ready:Promise.resolve(auth),post:async p=>{if(p.action==='submitASN'){ids.push(p.requestId);if(interrupted)throw Error('Response interrupted');return {success:true,id:'b'.repeat(64),status:'saved',stage:'complete',fileName:'Existing ASN',direction:'Inbound'};}return {success:true,submissions:[]};}};
  const h=harness(html,cloud);vm.runInContext(inline,h.context);h.context.validateForm=()=>null;h.context.getLines=()=>[{sku:'00123',name:'Example',qtyCarton:1,qtyPiece:12}];h.context.getEmails=()=>[];vm.runInContext("sessionToken='firebase';currentBrand='Example Brand'",h.context);h.document.getElementById('fDirection').value='Inbound';
  await h.context.doSubmit();assert.ok(h.storage.has('asn.attempt'));assert.equal(h.document.getElementById('submitBtn').disabled,false);interrupted=false;await h.context.doSubmit();assert.equal(ids[0],ids[1]);assert.equal(h.storage.has('asn.attempt'),false);
});
test('customer preparation errors release loading state without sending a request',async()=>{
  const cloud={ready:Promise.resolve({currentUser:{uid:'test'}}),post:async()=>{throw Error('must not send')}};
  const h=harness(html,cloud);vm.runInContext(inline,h.context);h.context.validateForm=()=>null;h.context.getLines=()=>{throw Error('Preparation failed')};h.document.getElementById('fDirection').value='Inbound';await h.context.doSubmit();assert.equal(h.document.getElementById('submitBtn').disabled,false);assert.equal(h.document.getElementById('asnPage').inert,false);assert.equal(h.document.getElementById('formAlert').textContent,'Preparation failed');
});
test('management login, filters, counts and untrusted text render safely',async()=>{
  const rows=[{id:'a'.repeat(64),fileName:'<img src=x onerror=alert(1)>',customer:'Example',brand:'Brand A',poNumber:'PO-001',direction:'Inbound',status:'saved',stage:'complete',createdAt:Date.now(),lineStatus:'sent',emailStatus:'sent',hasPdf:true,hasSheets:true},{id:'b'.repeat(64),fileName:'Brand B ASN',customer:'Example',brand:'Brand B',poNumber:'PO-002',direction:'Outbound',status:'failed',stage:'creating_pdf',createdAt:Date.now(),lineStatus:'pending',emailStatus:'pending'}];
  const auth={currentUser:null};const cloud={ready:Promise.resolve(auth),adminLogin:async()=>auth.currentUser={uid:'admin'},logout:async()=>auth.currentUser=null,post:async p=>p.action==='session'?{success:true,admin:true}:{success:true,submissions:rows,next:null},download:async()=>{}};
  const h=harness(fs.readFileSync(path.join(root,'public/management.html'),'utf8'),cloud);vm.runInContext(fs.readFileSync(path.join(root,'public/assets/management.js'),'utf8'),h.context);
  await h.document.getElementById('signIn').onclick();assert.equal(h.document.getElementById('dashboard').hidden,false);assert.equal(h.document.getElementById('rows').children.length,2);assert.equal(h.document.getElementById('total').textContent,'2');assert.equal(h.document.getElementById('attention').textContent,'1');assert.equal(h.document.getElementById('rows').querySelectorAll('img').length,0);
  h.document.getElementById('search').value='PO-002';h.context.render();assert.equal(h.document.getElementById('rows').children.length,1);assert.match(h.document.getElementById('rows').textContent,/Brand B/);
});
function reviewHarness(handler,search=''){
  const row={success:true,id:'c'.repeat(64),fileName:'Review ASN',customer:'Example',brand:'Brand A',poNumber:'001',direction:'Inbound',status:'saved',stage:'complete',createdAt:Date.now(),hasSheets:true,hasPdf:true,reviewStatus:'pending',emailStatus:'sent',lineStatus:'sent',submission:{document:{poNumber:'001',senderCompany:'Example',remark:'<img src=x onerror=alert(1)>'},lines:[{sku:'00001',name:'<script>bad</script>',qtyCarton:1,qtyPiece:12}]}};
  const calls=[],auth={currentUser:null},cloud={ready:Promise.resolve(auth),adminLogin:async()=>auth.currentUser={uid:'admin'},post:async p=>{calls.push(p);if(p.action==='session')return {success:true,admin:true};if(p.action==='management')return {success:true,submissions:[row],next:null};if(p.action==='getSubmission')return row;if(p.action==='reviewASN')return handler(p,row);},download:async()=>{}};
  const h=harness(fs.readFileSync(path.join(root,'public/management.html'),'utf8'),cloud);h.window.location={search};vm.runInContext(fs.readFileSync(path.join(root,'public/assets/management.js'),'utf8'),h.context);return {...h,calls,row};
}
test('LINE links open the exact ASN only after manager sign-in and never auto-confirm',async()=>{
 const h=reviewHarness(async()=>{throw Error('No automatic decision allowed');},'?asn='+('c'.repeat(64))+'&review=confirmed');
 await Promise.resolve();assert.equal(h.calls.filter(p=>p.action==='getSubmission').length,0);
 await h.document.getElementById('signIn').onclick();
 assert.equal(h.document.getElementById('reviewOverlay').hidden,false);assert.equal(h.calls.find(p=>p.action==='getSubmission').id,h.row.id);
 assert.equal(h.calls.filter(p=>p.action==='reviewASN').length,0);assert.match(h.document.getElementById('reviewDecision').textContent,/กดยืนยัน/);
});
test('LINE reject links require a reason and stale links show the existing decision',async()=>{
 const h=reviewHarness(async(p,r)=>({...r,reviewStatus:p.decision,reviewReason:p.reason}),'?asn='+('c'.repeat(64))+'&review=rejected');
 await h.document.getElementById('signIn').onclick();assert.match(h.document.getElementById('reviewDecision').textContent,/ระบุเหตุผล/);
 await h.document.getElementById('rejectASN').onclick();assert.equal(h.calls.filter(p=>p.action==='reviewASN').length,0);
 h.document.getElementById('reviewReason').value='Incorrect quantity';await h.document.getElementById('rejectASN').onclick();
 h.row.reviewStatus='rejected';h.row.reviewReason='Incorrect quantity';await h.context.openReview(h.row,'confirmed');
 assert.equal(h.document.getElementById('confirmASN').disabled,true);assert.match(h.document.getElementById('reviewDecision').textContent,/Incorrect quantity/);
});
test('management reviews details safely and persists confirmation with visible audit',async()=>{
  const h=reviewHarness(async(p,r)=>({...r,reviewStatus:p.decision,reviewReason:p.reason,reviewedBy:'manager@example.test',reviewedAt:Date.now()}));
  await h.document.getElementById('signIn').onclick();await h.context.openReview(h.row,'confirmed');assert.equal(h.document.getElementById('reviewItems').querySelectorAll('script').length,0);assert.equal(h.document.getElementById('reviewSummary').querySelectorAll('img').length,0);assert.equal(h.document.getElementById('confirmASN').disabled,false);
  await h.document.getElementById('confirmASN').onclick();assert.match(h.document.getElementById('reviewDecision').textContent,/ยืนยันแล้ว/);assert.match(h.document.getElementById('reviewDecision').textContent,/manager@example.test/);assert.equal(h.document.getElementById('confirmASN').disabled,true);assert.equal(h.document.getElementById('awaitingReview').textContent,'0');
  h.document.getElementById('reviewStatus').value='confirmed';h.context.render();assert.equal(h.document.getElementById('rows').children.length,1);h.document.getElementById('reviewStatus').value='pending';h.context.render();assert.equal(h.document.getElementById('rows').children.length,0);
});
test('management rejection requires a reason before writing the decision',async()=>{
  const h=reviewHarness(async(p,r)=>({...r,reviewStatus:p.decision,reviewReason:p.reason,reviewedAt:Date.now()}));await h.document.getElementById('signIn').onclick();await h.context.openReview(h.row,'rejected');await h.document.getElementById('rejectASN').onclick();assert.equal(h.calls.filter(p=>p.action==='reviewASN').length,0);assert.match(h.document.getElementById('reviewError').textContent,/เหตุผล/);
  h.document.getElementById('reviewReason').value='Wrong arrival date';await h.document.getElementById('rejectASN').onclick();assert.match(h.document.getElementById('reviewDecision').textContent,/Wrong arrival date/);assert.equal(h.document.getElementById('rejectASN').disabled,true);
});
test('management retries a lost response with the same review ID and unchanged decision',async()=>{
  let first=true;const h=reviewHarness(async(p,r)=>{if(first){first=false;throw Error('Lost response');}return {...r,reviewStatus:p.decision,reviewReason:p.reason,reviewedAt:Date.now()};});await h.document.getElementById('signIn').onclick();await h.context.openReview(h.row,'confirmed');await h.document.getElementById('confirmASN').onclick();assert.equal(h.document.getElementById('reviewReason').disabled,true);assert.equal(h.document.getElementById('rejectASN').disabled,true);await h.document.getElementById('confirmASN').onclick();const calls=h.calls.filter(p=>p.action==='reviewASN');assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.match(h.document.getElementById('reviewDecision').textContent,/ยืนยันแล้ว/);
});
test('customer receipt history displays review results and reasons safely',()=>{
  const h=harness(html,{ready:Promise.resolve({currentUser:null})});vm.runInContext(inline,h.context);h.context.renderReceipts([{id:'d'.repeat(64),fileName:'ASN',direction:'Inbound',status:'saved',stage:'complete',reviewStatus:'rejected',reviewReason:'<img src=x> Missing lot',lineStatus:'sent'}]);assert.match(h.document.getElementById('receiptList').textContent,/ปฏิเสธ/);assert.match(h.document.getElementById('receiptList').textContent,/Missing lot/);assert.equal(h.document.getElementById('receiptList').querySelectorAll('img').length,0);
});
