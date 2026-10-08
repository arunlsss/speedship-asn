'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const core=require('../lib/core');
const {isAdmin,resolveIdentity,requireOwned}=require('../lib/authz');
const {createStore}=require('../lib/store');
const {processSubmission}=require('../lib/worker');
const payload=(extra={})=>({brand:'Example Brand',direction:'Inbound',requestId:randomUUID(),document:{poNumber:'00001',expectedArrival:'2026-10-07T18:30',senderCompany:'Example',senderAddress:'Address',senderName:'Contact',senderPhone:'012345',remark:''},lines:[{sku:'00123',name:'Example item',lot:'01',expiryDate:'N/A',width:10,length:20,height:30,qtyCarton:1,qtyPiece:12,remark:''}],respondEmail:'receipt@example.test',...extra});
const customer={active:true,username:'demo',customer:'Example',brands:['Example Brand'],fixedEmails:['ops@example.test']};
const rules={'Example Brand':{}};
function memoryDb(){
  const docs=new Map();let queue=Promise.resolve();
  const ref=path=>({path,get:async()=>snapshot(path)});
  const snapshot=path=>({exists:docs.has(path),data:()=>docs.get(path)?structuredClone(docs.get(path)):undefined});
  const db={collection:name=>({doc:id=>ref(name+'/'+id)}),runTransaction:callback=>{
    const task=queue.then(async()=>{const writes=[];const result=await callback({get:async r=>snapshot(r.path),set:(r,d)=>writes.push(()=>docs.set(r.path,structuredClone(d))),create:(r,d)=>writes.push(()=>{assert.equal(docs.has(r.path),false);docs.set(r.path,structuredClone(d));}),update:(r,d)=>writes.push(()=>{assert.ok(docs.has(r.path));docs.set(r.path,{...docs.get(r.path),...structuredClone(d)});})});writes.forEach(fn=>fn());return result;});queue=task.catch(()=>{});return task;
  }};return {db,docs};
}
test('validation preserves leading zeros, rejects malformed dates, quantities and duplicate lines',()=>{
  const p=payload(),data=core.validate(p,{});assert.equal(data.lines[0].sku,'00123');assert.equal(data.document.poNumber,'00001');
  for(const invalid of ['31/02/2026','29/02/2025','2026-10-07']){p.lines[0].expiryDate=invalid;assert.throws(()=>core.validate(p,{}),{code:'VALIDATION'});}
  p.lines[0].expiryDate='N/A';p.lines[0].qtyPiece=-1;assert.throws(()=>core.validate(p,{}));p.lines[0].qtyPiece=1.5;assert.throws(()=>core.validate(p,{}));p.lines[0].qtyPiece=12;p.lines.push({...p.lines[0]});assert.throws(()=>core.validate(p,{}));
});
test('required brand fields, invalid payload shapes, overlong fields and invalid recipients are rejected',()=>{
  const p=payload();p.document.poNumber='';assert.throws(()=>core.validate(p,{doc_po:true}));
  assert.throws(()=>core.validate(payload({lines:Array(201).fill({})}),{}));assert.throws(()=>core.validate(payload({respondEmail:'bad'}),{}));assert.throws(()=>core.validate(payload({document:{senderName:{evil:'object'}}}),{}));assert.throws(()=>core.validate(payload({direction:'Export'}),{}));
});
test('customer grants are rechecked and admin identity cannot be forged through custom tokens',async()=>{
  assert.equal(isAdmin({email:'admin@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'}},['admin@example.test']),true);
  assert.equal(isAdmin({email:'admin@example.test',email_verified:true,firebase:{sign_in_provider:'custom'}},['admin@example.test']),false);
  assert.equal(isAdmin({email:'admin@example.test',email_verified:false,firebase:{sign_in_provider:'google.com'}},['admin@example.test']),false);
  const auth={verifyIdToken:async(token,checkRevoked)=>{assert.equal(checkRevoked,true);return {uid:core.uidFor('demo'),firebase:{sign_in_provider:'custom'}};}};
  const workspace={masters:async()=>({customers:[customer],rules})};const user=await resolveIdentity('Bearer example',{auth,workspace,adminEmails:[]});assert.equal(user.customer.username,'demo');
  await assert.rejects(resolveIdentity('',{auth,workspace,adminEmails:[]}),{code:'AUTH_EXPIRED'});
  workspace.masters=async()=>({customers:[{...customer,active:false}],rules});await assert.rejects(resolveIdentity('Bearer example',{auth,workspace,adminEmails:[]}),{code:'AUTH_EXPIRED'});
});
test('receipt and download authorization rejects other owners and revoked brand grants',()=>{
  const job={ownerUid:core.uidFor('demo'),brand:'Example Brand'},user={uid:job.ownerUid,admin:false,customer,rules};assert.equal(requireOwned(job,user),job);
  assert.throws(()=>requireOwned(job,{...user,uid:core.uidFor('other')}),{code:'NOT_FOUND'});assert.throws(()=>requireOwned(job,{...user,customer:{...customer,brands:[]}}),{code:'FORBIDDEN'});assert.equal(requireOwned(job,{uid:'admin',admin:true}),job);
});
test('Bangkok day boundaries are independent of the server time zone',()=>{
  assert.equal(core.bangkokDate(new Date('2026-10-07T16:59:59Z')),'2026-10-07');assert.equal(core.bangkokDate(new Date('2026-10-07T17:00:00Z')),'2026-10-08');
});
test('concurrent repeated submissions have one receipt, reject changed data, and reserve unique sequences',async()=>{
  const {db,docs}=memoryDb(),store=createStore(db),uid=core.uidFor('demo'),p=payload(),data=core.validate(p,{});
  const repeats=await Promise.all(Array.from({length:8},()=>store.accept(uid,p.requestId,data,customer,12)));assert.equal(new Set(repeats.map(r=>r.id)).size,1);assert.equal(repeats[0].fileName.endsWith('013'),true);assert.equal([...docs.keys()].filter(k=>k.startsWith('submissions/')).length,1);
  await assert.rejects(store.accept(uid,p.requestId,{...data,emails:[]},customer),{code:'REQUEST_CONFLICT'});
  const distinct=await Promise.all(Array.from({length:10},()=>store.accept(uid,randomUUID(),data,customer)));assert.equal(new Set(distinct.map(r=>r.fileName)).size,10);
  const out=await store.accept(uid,randomUUID(),{...data,direction:'Outbound'},customer);assert.ok(out.fileName.endsWith('001'));
});
test('worker leases block duplicate workers, stale generations, and stale writes',async()=>{
  const {db,docs}=memoryDb(),store=createStore(db),p=payload(),r=await store.accept(core.uidFor('demo'),p.requestId,core.validate(p,{}),customer);
  const lease=await store.claim(r.id,1);assert.ok(lease);await assert.rejects(store.claim(r.id,1),{code:'LEASE_BUSY'});await assert.rejects(store.update(r.id,'wrong',{status:'saved'}),{code:'LEASE_LOST'});
  await store.update(r.id,lease.leaseToken,{status:'failed',leaseUntil:0});const retried=await store.retry(r.id);assert.equal(retried.status,'queued');assert.equal(await store.claim(r.id,1),null);assert.ok(await store.claim(r.id,2));
  docs.get('submissions/'+r.id).leaseUntil=Date.now()-1;assert.ok(await store.claim(r.id,2));
});
function workerFixture(){
  const {db,docs}=memoryDb(),store=createStore(db),files=new Map(),counts={render:0,pdf:0,email:0,line:0};let failPdf=false,failEmail=false,failLine=false;
  const workspace={masters:async()=>({customers:[customer],rules}),preflight:async()=>({templateSheetId:1}),archiveFolder:async()=> 'folder',ensureFile:async(job,folder,kind)=>{const key=job.id+':'+kind;if(!files.has(key))files.set(key,kind+'-'+randomUUID());return files.get(key);},render:async()=>counts.render++,exportPdf:async()=>{counts.pdf++;if(failPdf)core.fail('PDF_PENDING','PDF not ready');return Buffer.from('%PDF fake');},download:async()=>Buffer.from('%PDF fake'),sendEmail:async()=>{counts.email++;if(failEmail)throw Error('Email response lost');}};
  const line={send:async()=>{counts.line++;if(failLine)throw Error('LINE response lost');}};
  return {store,docs,workspace,files,counts,deps:{store,workspace,line,emailEnabled:true,lineEnabled:true},setPdfFail:v=>failPdf=v,setEmailFail:v=>failEmail=v,setLineFail:v=>failLine=v,accept:async()=>{const p=payload();return store.accept(core.uidFor('demo'),p.requestId,core.validate(p,{}),customer);}};
}
test('worker saves Sheets/PDF before notifications and replay does not create files or send twice',async()=>{
  const h=workerFixture(),r=await h.accept();await processSubmission(r.id,1,h.deps);let job=h.docs.get('submissions/'+r.id);assert.equal(job.status,'saved');assert.equal(job.lineStatus,'sent');assert.equal(job.emailStatus,'sent');assert.equal(h.files.size,2);await processSubmission(r.id,1,h.deps);assert.deepEqual(h.counts,{render:1,pdf:1,email:1,line:1});
});
test('PDF failure preserves the Sheet, retry reuses it and completes the original receipt',async()=>{
  const h=workerFixture(),r=await h.accept();h.setPdfFail(true);await processSubmission(r.id,1,h.deps);const before=h.docs.get('submissions/'+r.id);assert.equal(before.status,'failed');assert.equal(h.files.size,1);assert.equal(h.counts.email,0);h.setPdfFail(false);await h.store.retry(r.id);await processSubmission(r.id,2,h.deps);const after=h.docs.get('submissions/'+r.id);assert.equal(after.status,'saved');assert.equal(after.sheetId,before.sheetId);assert.equal(after.fileName,before.fileName);assert.equal(h.files.size,2);assert.equal(h.counts.render,1);
});
test('notification failures preserve saved files and do not claim confirmed delivery',async()=>{
  const h=workerFixture(),r=await h.accept();h.setEmailFail(true);h.setLineFail(true);await processSubmission(r.id,1,h.deps);const job=h.docs.get('submissions/'+r.id);assert.equal(job.status,'saved');assert.equal(job.emailStatus,'unknown');assert.equal(job.lineStatus,'unknown');assert.equal(h.files.size,2);
});
test('receipt response never includes payload, owner, fingerprint, lease or authentication material',async()=>{
  const h=workerFixture(),r=await h.accept();const record=h.docs.get('submissions/'+r.id);const publicReceipt=core.receipt(r.id,record);for(const key of ['submission','ownerUid','fingerprint','leaseToken','lineRetryKey','password','fixedEmails'])assert.equal(Object.hasOwn(publicReceipt,key),false);
});
test('login limiter rejects the eleventh request in its time window',async()=>{const {db}=memoryDb(),store=createStore(db);for(let i=0;i<10;i++)await store.loginLimit('example');await assert.rejects(store.loginLimit('example'),{code:'RATE_LIMIT'});});
const manager={uid:'manager-1',email:'manager@example.test',admin:true};
async function reviewFixture({legacy=false,ready=true}={}){
  const {db,docs}=memoryDb(),store=createStore(db),p=payload();
  const accepted=await store.accept(core.uidFor('demo'),p.requestId,core.validate(p,{}),customer);
  const d=docs.get('submissions/'+accepted.id);Object.assign(d,{status:ready?'saved':'processing',rendered:ready,sheetId:ready?'sheet-1':null,pdfId:ready?'pdf-1':null,emailStatus:'sent',lineStatus:'sent'});if(legacy)delete d.reviewStatus;
  return {store,docs,id:accepted.id};
}
test('ASN review requires an administrator, valid decision/request and a rejection reason',async()=>{
  const h=await reviewFixture(),before=structuredClone(h.docs.get('submissions/'+h.id));
  for(const [actor,decision,reason,requestId,code] of [[{uid:'customer',admin:false},'confirmed','',randomUUID(),'FORBIDDEN'],[manager,'invalid','',randomUUID(),'VALIDATION'],[manager,'confirmed','','bad','VALIDATION'],[manager,'rejected','  ',randomUUID(),'VALIDATION'],[manager,'rejected','x'.repeat(1001),randomUUID(),'VALIDATION']])await assert.rejects(h.store.review(h.id,actor,decision,reason,requestId),{code});
  assert.deepEqual(h.docs.get('submissions/'+h.id),before);
});
test('ASN review waits for ready files and treats older saved records as pending',async()=>{
  const busy=await reviewFixture({ready:false});await assert.rejects(busy.store.review(busy.id,manager,'confirmed','',randomUUID()),{code:'NOT_READY'});
  const legacy=await reviewFixture({legacy:true}),r=await legacy.store.review(legacy.id,manager,'confirmed','Checked',randomUUID());
  assert.equal(r.reviewStatus,'confirmed');assert.equal(r.status,'saved');assert.equal(r.reviewedBy,manager.email);assert.ok(r.reviewedAt);assert.equal(r.hasPdf,true);assert.equal(r.hasSheets,true);assert.equal(r.reviewedByUid,undefined);assert.equal(r.reviewRequestId,undefined);
});
test('rejection preserves files and delivery state and exposes the reason in the receipt',async()=>{
  const h=await reviewFixture(),r=await h.store.review(h.id,manager,'rejected','  Delivery date needs correction  ',randomUUID());
  assert.equal(r.reviewStatus,'rejected');assert.equal(r.reviewReason,'Delivery date needs correction');assert.equal(r.emailStatus,'sent');assert.equal(r.lineStatus,'sent');assert.equal(r.status,'saved');assert.equal(h.docs.get('submissions/'+h.id).pdfId,'pdf-1');
});
test('lost review responses replay the same decision without changing its audit record',async()=>{
  const h=await reviewFixture(),requestId=randomUUID(),first=await h.store.review(h.id,manager,'confirmed','Checked',requestId);
  const retry=await h.store.review(h.id,manager,'confirmed','Checked',requestId);assert.deepEqual(retry,first);
  await assert.rejects(h.store.review(h.id,manager,'rejected','Changed',randomUUID()),{code:'ALREADY_REVIEWED'});
  await assert.rejects(h.store.review(h.id,{...manager,uid:'manager-2'},'confirmed','Checked',requestId),{code:'ALREADY_REVIEWED'});
  assert.equal(h.docs.get('submissions/'+h.id).reviewedByUid,manager.uid);
});
test('concurrent managers cannot overwrite each other\'s ASN decision',async()=>{
  const h=await reviewFixture(),results=await Promise.allSettled([h.store.review(h.id,manager,'confirmed','',randomUUID()),h.store.review(h.id,{...manager,uid:'manager-2'},'rejected','Mismatch',randomUUID())]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'ALREADY_REVIEWED');
});
const {receiveGroupConnection}=require('../lib/line-groups');
const {createHmac}=require('node:crypto');
const channelSecret='fixture-secret-only',connectionCode='1'.repeat(32),groupId='C'+'2'.repeat(32);
function signedGroupEvent(overrides={}){const body=Buffer.from(JSON.stringify({events:[{type:'message',timestamp:Date.now(),source:{type:'group',groupId},message:{type:'text',text:'ASN-CONNECT '+connectionCode},...overrides}]}));return {body,signature:createHmac('sha256',channelSecret).update(body).digest('base64')};}
test('group connection refuses unsigned or tampered webhook events',async()=>{
  const {db,docs}=memoryDb(),{body,signature}=signedGroupEvent();await assert.rejects(receiveGroupConnection(body,'bad',channelSecret,db),{code:'WEBHOOK_SIGNATURE'});await assert.rejects(receiveGroupConnection(Buffer.concat([body,Buffer.from(' ')]),signature,channelSecret,db),{code:'WEBHOOK_SIGNATURE'});assert.equal(docs.size,0);
});
test('group connection accepts LINE verification and ignores ordinary messages without storing chat',async()=>{
  const {db,docs}=memoryDb(),empty=Buffer.from('{"events":[]}');assert.deepEqual(await receiveGroupConnection(empty,createHmac('sha256',channelSecret).update(empty).digest('base64'),channelSecret,db),{success:true});const {body,signature}=signedGroupEvent({message:{type:'text',text:'ordinary private conversation'}});await receiveGroupConnection(body,signature,channelSecret,db);assert.equal(docs.size,0);
});
test('signed group setup binds only the pending one-time connection and preserves the first group',async()=>{
  const {db,docs}=memoryDb(),path='lineGroupConnections/'+core.hash(connectionCode);docs.set(path,{state:'pending',expiresAt:Date.now()+60000});const event=signedGroupEvent();await receiveGroupConnection(event.body,event.signature,channelSecret,db);assert.equal(docs.get(path).groupId,groupId);assert.equal(docs.get(path).state,'captured');assert.equal(docs.get(path).message,undefined);
  const second=signedGroupEvent({source:{type:'group',groupId:'C'+'3'.repeat(32)}});await receiveGroupConnection(second.body,second.signature,channelSecret,db);assert.equal(docs.get(path).groupId,groupId);
});
test('expired registrations, old events and direct-account messages cannot connect a group',async()=>{
  const {db,docs}=memoryDb(),path='lineGroupConnections/'+core.hash(connectionCode);docs.set(path,{state:'pending',expiresAt:Date.now()-1});const event=signedGroupEvent();await receiveGroupConnection(event.body,event.signature,channelSecret,db);assert.equal(docs.get(path).state,'pending');docs.set(path,{state:'pending',expiresAt:Date.now()+60000});
  for(const overrides of [{timestamp:Date.now()-10*60*1000},{source:{type:'user',userId:'U'+'2'.repeat(32)}}]){const e=signedGroupEvent(overrides);await receiveGroupConnection(e.body,e.signature,channelSecret,db);assert.equal(docs.get(path).state,'pending');}
});
