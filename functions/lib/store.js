'use strict';
const { hash, submissionKey, sequenceKey, bangkokDate, fail, receipt } = require('./core');
const { randomUUID } = require('node:crypto');
function createStore(db) {
  const refFor = id => db.collection('submissions').doc(id);
  async function accept(uid, requestId, data, customer, sequenceFloor=0) {
    const id=submissionKey(uid,requestId), ref=refFor(id), fingerprint=hash(JSON.stringify(data)), date=bangkokDate();
    return db.runTransaction(async tx => {
      const existing=await tx.get(ref);
      if (existing.exists) {
        const d=existing.data();
        if (d.ownerUid!==uid || d.fingerprint!==fingerprint) fail('REQUEST_CONFLICT','ข้อมูลถูกเปลี่ยนหลังส่ง กรุณาตรวจสอบรายการเดิม',409);
        return receipt(id,d);
      }
      const counter=db.collection('sequences').doc(sequenceKey(data.brand,data.direction,date)), c=await tx.get(counter);
      const sequence=Math.max(c.data()?.value || 0,sequenceFloor)+1, fileName=`${data.brand} ${date} ${String(sequence).padStart(3,'0')}`;
      const now=Date.now(), d={ownerUid:uid,requestId,fingerprint,brand:data.brand,direction:data.direction,date,sequence,fileName,asnId:`${data.direction.toUpperCase()}-${date.replaceAll('-','')}-${hash(data.brand).slice(0,8)}-${String(sequence).padStart(3,'0')}`,customer:customer.customer,poNumber:data.document.poNumber,itemCount:data.lines.length,status:'queued',stage:'received',createdAt:now,updatedAt:now,attempt:0,generation:1,lineRetryKey:randomUUID(),emailStatus:'pending',lineStatus:'pending',submission:data};
      tx.set(counter,{value:sequence}); tx.create(ref,d); return receipt(id,d);
    });
  }
  async function claim(id,generation) {
    const ref=refFor(id), token=randomUUID();
    return db.runTransaction(async tx => {
      const snap=await tx.get(ref); if (!snap.exists) return null;
      const d=snap.data();
      if(d.generation!==generation || ['saved','failed'].includes(d.status)) return null;
      if(d.leaseUntil>Date.now()) fail('LEASE_BUSY','Worker lease active',503);
      const changes={status:'processing',stage:d.stage==='received'?'creating_sheets':d.stage,leaseToken:token,leaseUntil:Date.now()+11*60*1000,attempt:d.attempt+1,updatedAt:Date.now()};
      tx.update(ref,changes); return {...d,...changes,id};
    });
  }
  async function update(id,token,changes) {
    return db.runTransaction(async tx=>{const ref=refFor(id), snap=await tx.get(ref);if(!snap.exists || snap.data().leaseToken!==token) fail('LEASE_LOST','Worker lease lost',409);tx.update(ref,{...changes,updatedAt:Date.now()});});
  }
  async function retry(id) {
    return db.runTransaction(async tx=>{const ref=refFor(id),snap=await tx.get(ref);if(!snap.exists)fail('NOT_FOUND','ไม่พบรายการ',404);const d=snap.data();if(d.status!=='failed')return receipt(id,d);const changes={status:'queued',generation:d.generation+1,stage:d.pdfId?'notifying':d.rendered?'creating_pdf':'creating_sheets',message:'',errorCode:'',leaseUntil:0,updatedAt:Date.now()};tx.update(ref,changes);return receipt(id,{...d,...changes});});
  }
  async function loginLimit(key) {
    const ref=db.collection('loginLimits').doc(hash(key));
    await db.runTransaction(async tx=>{const snap=await tx.get(ref),d=snap.data(),now=Date.now(),within=d && d.until>now;if(within && d.count>=10)fail('RATE_LIMIT','กรุณารอ 15 นาที ก่อนลองเข้าสู่ระบบใหม่',429);tx.set(ref,{count:within?d.count+1:1,until:within?d.until:now+15*60000});});
  }
  return {accept,claim,update,retry,loginLimit,refFor};
}
module.exports={createStore};
