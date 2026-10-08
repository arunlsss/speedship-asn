import {initializeApp} from 'firebase/app';
import {getAuth,setPersistence,browserSessionPersistence,signInWithCustomToken,signInWithPopup,GoogleAuthProvider,signOut} from 'firebase/auth';
import {downloadFilename} from './download-name.mjs';
const config=window.ASN_CONFIG || {};
const ready=(async()=>{
  const firebaseConfig=config.firebaseConfig || await (await fetch('/__/firebase/init.json',{signal:AbortSignal.timeout(15000)})).json();
  const auth=getAuth(initializeApp(firebaseConfig));
  await setPersistence(auth,browserSessionPersistence);await auth.authStateReady();
  return auth;
})();
async function request(payload) {
  const auth=await ready,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try {
    const token=auth.currentUser?await auth.currentUser.getIdToken():'';
    const response=await fetch('/api/',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(payload),signal:controller.signal});
    const result=await response.json();
    if(!response.ok && !result.message)throw Error('การเชื่อมต่อไม่สำเร็จ กรุณาลองใหม่');
    if(result.code==='AUTH_EXPIRED')await signOut(auth);
    return result;
  } catch(err){if(err.name==='AbortError')throw Error('การเชื่อมต่อใช้เวลานานเกินไป กรุณาตรวจสอบสถานะรายการเดิมก่อนส่งใหม่');throw err;}
  finally{clearTimeout(timer);}
}
window.ASNCloud={ready,post:request,
  login:async(username,password)=>{const result=await request({action:'login',username,password});if(result.success)await signInWithCustomToken(await ready,result.customToken);delete result.customToken;return result;},
  adminLogin:async()=>signInWithPopup(await ready,new GoogleAuthProvider()),
  logout:async()=>signOut(await ready),
  download:async(id,type)=>{const auth=await ready,token=await auth.currentUser?.getIdToken();if(!token)throw Error('กรุณาเข้าสู่ระบบใหม่');const response=await fetch(`/api/download?id=${encodeURIComponent(id)}&type=${type}`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});if(!response.ok){const result=await response.json();throw Error(result.message || 'ดาวน์โหลดไม่สำเร็จ');}const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=downloadFilename(response.headers.get('Content-Disposition'),type);link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
};
