// User-operated secret handoff. Never echo LINE credentials or send messages.
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
const project='speedship-asn-cloud',account='arun.l@speedshipsolution.com';
const runtime='asn-runtime@speedship-asn-cloud.iam.gserviceaccount.com';
let stage='checking_terminal';
async function command(args,input) {
  return new Promise((resolve,reject)=>{
    const child=spawn('gcloud',[...args,'--project='+project,'--account='+account,'--quiet'],{stdio:['pipe','ignore','ignore']});
    child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('Cloud command failed')));child.stdin.on('error',()=>{});child.stdin.end(input ?? '');
  });
}
async function hidden(prompt) {
  if(!process.stdin.isTTY || !process.stdin.setRawMode)throw Error('Run this script in your own Terminal');
  return new Promise((resolve,reject)=>{
    const input=process.stdin,wasRaw=Boolean(input.isRaw);let value='';
    const finish=(err)=>{input.removeListener('data',onData);input.setRawMode(wasRaw);input.pause();process.stdout.write('\n');err?reject(err):resolve(value.trim());};
    const onData=chunk=>{
      for(const c of chunk.toString('utf8').replace(/\x1b\[(?:200|201)~/g,'')) {
        if(c==='\x03')return finish(Error('Cancelled'));
        if(c==='\r' || c==='\n')return finish();
        if(c==='\x7f' || c==='\b'){value=value.slice(0,-1);continue;}
        if(c.charCodeAt(0)>=32)value+=c;
        if(value.length>5000)return finish(Error('Input too long'));
      }
    };
    process.stdout.write(prompt+' (input hidden): ');input.setRawMode(true);input.on('data',onData);input.resume();
  });
}
async function save(name,value) {
  try{await command(['secrets','describe',name]);}
  catch(_){await command(['secrets','create',name,'--replication-policy=automatic']);}
  await command(['secrets','versions','add',name,'--data-file=-'],value);
  await command(['secrets','add-iam-policy-binding',name,'--member=serviceAccount:'+runtime,'--role=roles/secretmanager.secretAccessor']);
}
async function main() {
  if(!process.stdin.isTTY)throw Error('Run this script in your own Terminal');
  stage='checking_cloud_sign_in';await command(['auth','print-access-token']);
  console.log('Use your own LINE Messaging API channel access token and the intended user/group/room ID.');
  console.log('The token and destination go directly to ASN Secret Manager, never to chat or files. No LINE message will be sent.');
  stage='reading_line_token';const token=await hidden('Paste the LINE channel access token');
  stage='reading_destination';const target=await hidden('Paste the destination LINE user/group/room ID');
  if(!token || token.length<20 || /\s/.test(token) || !/^[UCR][a-f0-9]{32}$/.test(target))throw Error('Invalid LINE credentials');
  const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const check=async(path,body)=>{const response=await fetch('https://api.line.me'+path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('LINE access check failed');};
  stage='verifying_line_account';await check('/v2/bot/info');
  stage='verifying_destination';
  const destination=target.startsWith('C')?'/v2/bot/group/'+target+'/summary':target.startsWith('R')?'/v2/bot/room/'+target+'/members/count':'/v2/bot/profile/'+target;
  await check(destination);
  stage='validating_message_format';await check('/v2/bot/message/validate/push',{messages:[{type:'text',text:'ASN connection validation'}]});
  console.log('LINE account, destination access and message format verified. No message sent.');
  stage='saving_line_token';await save('ASN_LINE_TOKEN',token);
  stage='saving_destination';await save('ASN_LINE_TARGET_ID',target);
  stage='enabling_configuration';const path=new URL('../functions/.env.speedship-asn-cloud',import.meta.url),env=await readFile(path,'utf8');
  if(!/^ASN_LINE_ENABLED=(true|false)$/m.test(env))throw Error('LINE configuration missing');
  await writeFile(path,env.replace(/^ASN_LINE_ENABLED=(true|false)$/m,'ASN_LINE_ENABLED=true').replace(/^ASN_LINE_TARGET_ID=.*\n?/m,''));
  console.log('LINE connection saved securely. Reply "LINE connected" in Codex so the worker can be redeployed.');
}
main().catch(()=>{console.error('LINE setup stopped at '+stage+'. Credentials were not printed. Check that step before retrying.');process.exitCode=1;});
