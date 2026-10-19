'use strict';
const {emails,authorize,fail} = require('./core');
const {asnMessage}=require('./line-message');
async function processSubmission(id,generation,{store,workspace,line,emailEnabled,lineEnabled}) {
  const job=await store.claim(id,generation);if(!job)return;
  const token=job.leaseToken;
  const save=async changes=>{await store.update(id,token,changes);Object.assign(job,changes);};
  try {
    const master=await workspace.masters(),user=master.customers.find(u=>u.active && require('./core').uidFor(u.username)===job.ownerUid);
    authorize(user,job.brand,master.rules);
    const preflight=await workspace.preflight();
    const folder=job.folderId || await workspace.archiveFolder(job.brand,job.direction);await save({folderId:folder});
    if(!job.sheetId)await save({sheetId:await workspace.ensureFile(job,folder,'sheet')});
    if(!job.rendered){await save({stage:'creating_sheets'});await workspace.render(job.sheetId,job.submission,job,preflight.templateSheetId);await save({rendered:true});}
    if(!job.pdfId){await save({stage:'creating_pdf'});const pdf=await workspace.exportPdf(job.sheetId);await save({pdfId:await workspace.ensureFile(job,folder,'pdf',pdf)});}
    await save({stage:'notifying'});
    const summary=[job.direction+' ASN',job.fileName,'PO: '+job.poNumber,'Items: '+job.itemCount,`Sheets: https://docs.google.com/spreadsheets/d/${job.sheetId}/edit`,`PDF: https://drive.google.com/file/d/${job.pdfId}/view`].join('\n');
    const recipients=emails([...user.fixedEmails,...job.submission.emails]);
    if(job.emailStatus==='pending') {
      if(!recipients.length)await save({emailStatus:'not_requested'});
      else if(!emailEnabled)await save({emailStatus:'disabled'});
      else {
        // Record ambiguous delivery before sending. A crash must never resend an email silently.
        await save({emailStatus:'unknown'});
        try {await workspace.sendEmail(recipients,'Speedship '+job.fileName,summary,await workspace.download(job.pdfId,'application/pdf'),job.fileName);await save({emailStatus:'sent'});}
        catch(_){await save({emailStatus:'unknown'});}
      }
    }
    if(job.lineStatus==='pending' || job.lineStatus==='unknown') {
      if(!lineEnabled)await save({lineStatus:'disabled'});
      else {
        if(!line)fail('LINE_CONFIG','ตั้งค่าการแจ้งเตือน LINE ไม่ครบ',503);
        const validRetry = Date.now()-(job.lineStartedAt || Date.now())<23*60*60*1000;
        if(validRetry) {
          await save({lineStatus:'unknown',lineStartedAt:job.lineStartedAt || Date.now()});
          try {await line.send(asnMessage(job),job.lineRetryKey);await save({lineStatus:'sent'});}catch(_){await save({lineStatus:'unknown'});}
        }
      }
    }
    await save({status:'saved',stage:'complete',leaseUntil:0,message:'',errorCode:''});
  } catch(err) {
    const safeCodes=['FORBIDDEN','AUTH_EXPIRED','ARCHIVE_ACCESS','ARCHIVE_AMBIGUOUS','WORKSPACE_OAUTH_REQUIRED','WORKSPACE_CONFIG','MASTER_SCHEMA','PDF_PENDING','LINE_CONFIG'];
    const code=safeCodes.includes(err.code)?err.code:'PROCESSING_FAILED';
    await save({status:'failed',leaseUntil:0,errorCode:code,message:safeCodes.includes(err.code)?err.message:'ดำเนินการไม่สำเร็จ กรุณาติดต่อ Speedship หรือดำเนินการต่อจากรายการเดิม'});
    // Log stage and safe code only; never log Google requests, credentials, or customer fields.
    console.error(JSON.stringify({event:'asn_failed',id,stage:job.stage,code}));
  }
}
function createLine(token,target) {
  if(!token || !target)return null;
  return {send:async(message,retryKey)=>{
    const response=await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'X-Line-Retry-Key':retryKey},body:JSON.stringify({to:target,messages:[typeof message==='string'?{type:'text',text:message}:message]}),signal:AbortSignal.timeout(30000)});
    // LINE 409 with an accepted request ID means the same retry key was already accepted.
    if(response.ok || (response.status===409 && response.headers.get('x-line-accepted-request-id')))return;
    throw Error('LINE delivery unconfirmed');
  }};
}
module.exports={processSubmission,createLine};
