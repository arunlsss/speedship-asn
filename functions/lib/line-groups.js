'use strict';
const {createHmac,timingSafeEqual}=require('node:crypto');
const {fail,hash}=require('./core');
async function receiveGroupConnection(rawBody,signature,secret,db,now=Date.now()) {
  if(!secret || !Buffer.isBuffer(rawBody) || rawBody.length>500000)fail('WEBHOOK_INVALID','Invalid webhook',400);
  const expected=createHmac('sha256',secret).update(rawBody).digest(),actual=Buffer.from(String(signature || ''),'base64');
  if(actual.length!==expected.length || !timingSafeEqual(actual,expected))fail('WEBHOOK_SIGNATURE','Invalid webhook signature',403);
  let body;try{body=JSON.parse(rawBody.toString('utf8'));}catch(_){fail('WEBHOOK_INVALID','Invalid webhook',400);}
  if(!Array.isArray(body?.events) || body.events.length>100)fail('WEBHOOK_INVALID','Invalid webhook',400);
  for(const event of body.events){
    if(event?.type!=='message' || event.message?.type!=='text' || event.source?.type!=='group' || !/^C[a-f0-9]{32}$/.test(event.source.groupId || ''))continue;
    const match=/^ASN-CONNECT ([a-f0-9]{32})$/.exec(event.message.text || '');if(!match || !Number.isFinite(event.timestamp) || Math.abs(now-event.timestamp)>5*60*1000)continue;
    const ref=db.collection('lineGroupConnections').doc(hash(match[1]));
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);if(!snap.exists)return;const registration=snap.data();
      if(registration.state!=='pending' || registration.expiresAt<=now)return;
      tx.update(ref,{state:'captured',groupId:event.source.groupId,capturedAt:now});
    });
  }
  // Never reply, change the live destination, or retain ordinary chat messages.
  return {success:true};
}
module.exports={receiveGroupConnection};
