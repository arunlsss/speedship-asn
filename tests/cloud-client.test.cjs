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
  const context=vm.createContext({window,document,console,crypto:webcrypto,Intl,Date,Uint8Array,AbortController,sessionStorage:{getItem:k=>storage.get(k) || null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setInterval:()=>1,setTimeout:(fn)=>{queueMicrotask(fn);return 1;},clearTimeout:()=>{},flatpickr:()=>{},XLSX:{}});
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
