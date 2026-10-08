#!/usr/bin/env node
// User-operated, signed group setup. Never send a LINE message or print credentials.
import {spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
const project='speedship-asn-cloud',account='arun.l@speedshipsolution.com',runtime='asn-runtime@speedship-asn-cloud.iam.gserviceaccount.com';
let stage='checking_terminal',registrationUrl,cloudToken;
async function command(args,input){
 return new Promise((resolve,reject)=>{const child=spawn('gcloud',[...args,'--project='+project,'--account='+account,'--quiet'],{stdio:['pipe','pipe','ignore']});const chunks=[];child.stdout.on('data',c=>chunks.push(c));child.once('error',reject);child.once('close',code=>code===0?resolve(Buffer.concat(chunks).toString('utf8').trim()):reject(Error('Cloud command failed')));child.stdin.on('error',()=>{});child.stdin.end(input ?? '');});
}
async function hidden(prompt){
 if(!process.stdin.isTTY || !process.stdin.setRawMode)throw Error('Use your own Terminal');
 return new Promise((resolve,reject)=>{const input=process.stdin,wasRaw=Boolean(input.isRaw);let value='';const finish=err=>{input.removeListener('data',onData);input.setRawMode(wasRaw);input.pause();process.stdout.write('\n');err?reject(err):resolve(value.trim());};const onData=chunk=>{for(const c of chunk.toString('utf8').replace(/\x1b\[(?:200|201)~/g,'')){if(c==='\x03')return finish(Error('Cancelled'));if(c==='\r'||c==='\n')return finish();if(c==='\x7f'||c==='\b'){value=value.slice(0,-1);continue;}if(c.charCodeAt(0)>=32)value+=c;if(value.length>200)return finish(Error('Input too long'));}};process.stdout.write(prompt+' (input hidden): ');input.setRawMode(true);input.on('data',onData);input.resume();});
}
async function save(name,value){try{await command(['secrets','describe',name]);}catch(_){await command(['secrets','create',name,'--replication-policy=automatic']);}await command(['secrets','versions','add',name,'--data-file=-'],value);await command(['secrets','add-iam-policy-binding',name,'--member=serviceAccount:'+runtime,'--role=roles/secretmanager.secretAccessor']);}
const sleep=()=>new Promise(resolve=>setTimeout(resolve,5000));
async function db(method,url,body){const r=await fetch(url,{method,headers:{Authorization:'Bearer '+cloudToken,'Content-Type':'application/json','x-goog-user-project':project},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Connection record failed');return method==='DELETE'?null:r.json();}
async function main(){
 if(!process.stdin.isTTY)throw Error('Use your own Terminal');
 stage='checking_cloud_sign_in';cloudToken=await command(['auth','print-access-token']);
 stage='reading_existing_oa';const token=await command(['secrets','versions','access','latest','--secret=ASN_LINE_TOKEN']);
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const check=async(path,body)=>{const r=await fetch('https://api.line.me'+path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('LINE check failed');return r.json();};
 const bot=await check('/v2/bot/info');console.log('Connect the LINE OA: '+bot.displayName);
 console.log('Find its Channel secret under LINE Developers > your OA channel > Basic settings. Do not use the access token.');
 stage='reading_channel_secret';const secret=await hidden('Paste this OA channel secret');if(!/^[a-f0-9]{32}$/i.test(secret))throw Error('Invalid channel secret');
 stage='saving_channel_secret';await save('ASN_LINE_CHANNEL_SECRET',secret);
 console.log('LINE group credential saved. Tell Codex: "LINE group credential saved". Keep this Terminal open while the signed connection endpoint is deployed.');
 stage='waiting_for_endpoint';const deadline=Date.now()+20*60*1000;let ready=false;
 while(Date.now()<deadline){try{const r=await fetch('https://speedship-asn-cloud.web.app/api/health',{signal:AbortSignal.timeout(15000)});const data=await r.json();if(r.ok && data.lineGroupSetup===true){ready=true;break;}}catch(_){}await sleep();}if(!ready)throw Error('Endpoint not ready');
 const code=randomBytes(16).toString('hex'),id=createHash('sha256').update(code).digest('hex');registrationUrl=`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/lineGroupConnections/${id}`;
 stage='preparing_group_registration';await db('PATCH',registrationUrl+'?currentDocument.exists=false',{fields:{state:{stringValue:'pending'},expiresAt:{integerValue:String(Date.now()+15*60*1000)}}});
 console.log('In the same OA Messaging API settings, set Webhook URL to: https://asn.speedshipsolution.com/api/line-webhook');
 console.log('Click Verify and enable Use webhook. Then send this exact setup message yourself in the intended group (expires in 15 minutes):');
 console.log('ASN-CONNECT '+code);
 stage='waiting_for_group';const until=Date.now()+15*60*1000;let target;
 while(Date.now()<until){const record=await db('GET',registrationUrl);if(record.fields?.state?.stringValue==='captured'){target=record.fields.groupId?.stringValue;break;}await sleep();}if(!/^C[a-f0-9]{32}$/.test(target || ''))throw Error('No signed group event received');
 stage='verifying_group';const group=await check('/v2/bot/group/'+target+'/summary');await check('/v2/bot/message/validate/push',{messages:[{type:'text',text:'ASN group connection validation'}]});
 stage='saving_group_destination';await save('ASN_LINE_TARGET_ID',target);
 console.log('LINE destination saved for group: '+group.groupName+'. No message sent. Tell Codex "LINE group connected" so the notification worker can be redeployed.');
}
try{await main();}catch(_){console.error('LINE group setup stopped at '+stage+'. Credentials were not printed.');process.exitCode=1;}finally{if(registrationUrl){try{await db('DELETE',registrationUrl);}catch(_){console.log('The temporary connection record could not be removed; it expires automatically for connection use.');}}}
