'use strict';
const {fail,uidFor,authorize}=require('./core');
function isAdmin(decoded,emails) {
  return decoded.email_verified===true && decoded.firebase?.sign_in_provider!=='custom' && emails.map(s=>s.trim().toLowerCase()).includes(String(decoded.email || '').toLowerCase());
}
async function resolveIdentity(bearer,{auth,workspace,adminEmails}) {
  if(!bearer?.startsWith('Bearer '))fail('AUTH_EXPIRED','กรุณาเข้าสู่ระบบใหม่',401);
  let decoded;try{decoded=await auth.verifyIdToken(bearer.slice(7),true);}catch(_){fail('AUTH_EXPIRED','กรุณาเข้าสู่ระบบใหม่',401);}
  if(isAdmin(decoded,adminEmails))return {uid:decoded.uid,admin:true};
  const masters=await workspace.masters(),customer=masters.customers.find(u=>u.active && uidFor(u.username)===decoded.uid);
  if(!customer)fail('AUTH_EXPIRED','กรุณาเข้าสู่ระบบใหม่',401);
  return {uid:decoded.uid,admin:false,customer,rules:masters.rules};
}
function requireOwned(job,user) {
  if(!user.admin){if(job.ownerUid!==user.uid)fail('NOT_FOUND','ไม่พบรายการ',404);authorize(user.customer,job.brand,user.rules);}
  return job;
}
module.exports={isAdmin,resolveIdentity,requireOwned};
