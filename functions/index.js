'use strict';
const {onRequest}=require('firebase-functions/v2/https');
const {onDocumentWritten}=require('firebase-functions/v2/firestore');
const {defineSecret,defineString}=require('firebase-functions/params');
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');
const {createWorkspace}=require('./lib/workspace');
const {createStore}=require('./lib/store');
const {processSubmission,createLine}=require('./lib/worker');
const {resolveIdentity,requireOwned}=require('./lib/authz');
const {AppError,fail,text,hash,uidFor,samePassword,authorize,validate,receipt,bangkokDate,submissionKey}=require('./lib/core');
initializeApp();
const db=getFirestore(),auth=getAuth(),store=createStore(db);
const workspaceOAuth=defineSecret('ASN_WORKSPACE_OAUTH');
const lineToken=defineSecret('ASN_LINE_TOKEN');
const databaseId=defineString('ASN_DATABASE_ID',{default:'1Kgy8JoioazRK3jlWBqhu5XH0F-MhAmmtIq2O6Z4zZpM'});
const archiveFolderId=defineString('ASN_ARCHIVE_FOLDER_ID',{default:'1MjEjuz758C27CzLQeZwxCUTbDbTpanzB'});
const adminEmails=defineString('ASN_ADMIN_EMAILS',{default:'arun.l@speedshipsolution.com'});
const lineTarget=defineString('ASN_LINE_TARGET_ID',{default:''});
const emailEnabled=defineString('ASN_EMAIL_ENABLED',{default:'false'});
const lineEnabled=defineString('ASN_LINE_ENABLED',{default:'false'});
const runtimeServiceAccount=defineString('ASN_SERVICE_ACCOUNT',{default:'asn-runtime@speedship-asn-cloud.iam.gserviceaccount.com'});
const region='asia-southeast1';
const workspace=()=>createWorkspace({databaseId:databaseId.value(),archiveFolderId:archiveFolderId.value(),template:'ASN_raw_format'},workspaceOAuth.value());
async function identity(req) {
  return resolveIdentity(req.get('authorization'),{auth,workspace:workspace(),adminEmails:adminEmails.value().split(',')});
}
async function owned(id,user) {
  if(!/^[a-f0-9]{64}$/.test(id || ''))fail('NOT_FOUND','ไม่พบรายการ',404);
  const snap=await store.refFor(id).get();if(!snap.exists)fail('NOT_FOUND','ไม่พบรายการ',404);
  const job=snap.data();
  return requireOwned(job,user);
}
function failure(res,err) {
  const safe=err instanceof AppError;
  if(!safe)console.error(JSON.stringify({event:'api_failed',code:'REQUEST_FAILED'}));
  res.status(safe?err.status:503).json({success:false,code:safe?err.code:'REQUEST_FAILED',message:safe?err.message:'ไม่สามารถดำเนินการได้ กรุณาลองใหม่หรือติดต่อ Speedship'});
}
// Domain-restricted sharing disallows allUsers IAM bindings. The deployment
// configures public transport with Cloud Run's invoker IAM check setting;
// every protected action below still requires a verified Firebase identity.
exports.asnApi=onRequest({region,invoker:'private',timeoutSeconds:120,memory:'512MiB',maxInstances:5,serviceAccount:runtimeServiceAccount,secrets:[workspaceOAuth],cors:false},async(req,res)=>{
  res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');
  try {
    const path=req.path.replace(/^\/api/,'');
    if(req.method==='GET' && path==='/health')return res.json({success:true,service:'Speedship ASN',version:3});
    if(req.method==='GET' && path==='/download'){
      const user=await identity(req),job=await owned(req.query.id,user),pdf=req.query.type==='pdf',file=pdf?job.pdfId:job.sheetId;
      if(!file || (!pdf && !job.rendered))fail('NOT_READY','ไฟล์ยังไม่พร้อม',409);
      const mime=pdf?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',bytes=await workspace().download(file,mime);
      res.set('Content-Type',mime);res.set('Content-Disposition',`attachment; filename="ASN.${pdf?'pdf':'xlsx'}"; filename*=UTF-8''${encodeURIComponent(job.fileName)}.${pdf?'pdf':'xlsx'}`);return res.send(bytes);
    }
    if(req.method!=='POST')fail('METHOD_NOT_ALLOWED','Method not allowed',405);
    let p;
    try {p=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch(_){fail('VALIDATION','Invalid JSON');}
    if(!p || Buffer.byteLength(JSON.stringify(p))>500000)fail('VALIDATION','Invalid request size');
    const action=p.action;
    if(action==='login') {
      const username=text(p.username,100),password=text(p.password,200);
      if(!username || !password)fail('LOGIN_FAILED','Username หรือ Password ไม่ถูกต้อง',401);
      await store.loginLimit('user:'+username);await store.loginLimit('ip:'+hash(req.ip || 'unknown'));
      const master=await workspace().masters(),customer=master.customers.find(u=>u.active && u.username===username && samePassword(password,u.password));
      if(!customer)fail('LOGIN_FAILED','Username หรือ Password ไม่ถูกต้อง',401);
      const brands=customer.brands.filter(b=>Object.hasOwn(master.rules,b));
      if(!brands.length)fail('FORBIDDEN','บัญชีนี้ยังไม่ได้รับสิทธิ์ Brand',403);
      const customToken=await auth.createCustomToken(uidFor(username));
      return res.json({success:true,customToken,customer:customer.customer,brands,requirementsByBrand:Object.fromEntries(brands.map(b=>[b,master.rules[b]]))});
    }
    const user=await identity(req);
    if(action==='logout')return res.json({success:true});
    if(action==='session') {
      if(user.admin)return res.json({success:true,admin:true});
      const brands=user.customer.brands.filter(b=>Object.hasOwn(user.rules,b));
      return res.json({success:true,customer:user.customer.customer,brands,requirementsByBrand:Object.fromEntries(brands.map(b=>[b,user.rules[b]]))});
    }
    if(action==='getSKUs') {if(user.admin)fail('FORBIDDEN','ใช้บัญชีลูกค้าสำหรับ ASN',403);authorize(user.customer,p.brand,user.rules);return res.json({success:true,skus:await workspace().skus(p.brand)});}
    if(action==='submitASN') {
      if(user.admin)fail('FORBIDDEN','ใช้บัญชีลูกค้าสำหรับ ASN',403);
      authorize(user.customer,p.brand,user.rules);const data=validate(p,user.rules[p.brand]);
      require('./lib/core').emails([...user.customer.fixedEmails,...data.emails]);
      const existing=await store.refFor(submissionKey(user.uid,p.requestId)).get();
      const floor=existing.exists?0:await workspace().sequenceFloor(data.brand,data.direction,bangkokDate());
      return res.status(202).json(await store.accept(user.uid,p.requestId,data,user.customer,floor));
    }
    if(action==='getReceipt')return res.json(receipt(p.id,await owned(p.id,user)));
    if(action==='retryASN') {await owned(p.id,user);return res.json(await store.retry(p.id));}
    if(action==='mySubmissions' || action==='management') {
      if(action==='management' && !user.admin)fail('FORBIDDEN','เฉพาะผู้ดูแล',403);
      const limit=Math.min(Math.max(Number(p.limit)||50,1),100);
      let query=db.collection('submissions').orderBy('createdAt','desc');
      if(action==='mySubmissions')query=query.where('ownerUid','==',user.uid);
      if(p.before){const cursor=await store.refFor(p.before).get();if(cursor.exists)query=query.startAfter(cursor);}
      const snapshots=await query.limit(limit).get();
      const rows=snapshots.docs.filter(s=>user.admin || user.customer.brands.includes(s.data().brand)).map(s=>receipt(s.id,s.data()));
      return res.json({success:true,submissions:rows,next:snapshots.size===limit?snapshots.docs.at(-1).id:null});
    }
    if(action==='checkConfiguration') {if(!user.admin)fail('FORBIDDEN','เฉพาะผู้ดูแล',403);const check=await workspace().preflight();await workspace().masters();return res.json({success:true,archiveFolder:check.folder.name,driveMode:check.folder.driveId?'shared_drive':'user_oauth',emailEnabled:emailEnabled.value()==='true',lineEnabled:lineEnabled.value()==='true'});}
    fail('VALIDATION','Unknown action');
  } catch(err){failure(res,err);}
});
exports.processAsn=onDocumentWritten({document:'submissions/{id}',region,timeoutSeconds:540,memory:'1GiB',maxInstances:1,concurrency:1,retry:true,serviceAccount:runtimeServiceAccount,secrets:[workspaceOAuth,lineToken]},async event=>{
  const after=event.data?.after;if(!after?.exists || after.data().status!=='queued')return;
  await processSubmission(event.params.id,after.data().generation,{store,workspace:workspace(),line:createLine(lineToken.value(),lineTarget.value()),emailEnabled:emailEnabled.value()==='true',lineEnabled:lineEnabled.value()==='true'});
});
