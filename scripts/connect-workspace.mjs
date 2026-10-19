// User-operated OAuth handoff. Credentials go straight to Secret Manager, never to stdout.
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {google}=require('googleapis');
const {createWorkspace}=require('./lib/workspace');
let connectionStage='checking_cloud_sign_in';
async function main() {
const args=process.argv.slice(2),clientPath=args[args.indexOf('--client')+1];
if(!args.includes('--client') || !clientPath){console.log('Run: node scripts/connect-workspace.mjs --client /path/to/your-desktop-oauth-client.json');process.exit(1);}
const json=JSON.parse(await readFile(clientPath,'utf8')),client=json.installed;
if(!client?.client_id || !client.client_secret)throw Error('Use a Google OAuth Desktop app client JSON file.');
await new Promise((resolve,reject)=>{
  const check=spawn('gcloud',['auth','print-access-token','--account=arun.l@speedshipsolution.com'],{stdio:'ignore'});
  check.once('error',reject);check.once('close',code=>code===0?resolve():reject(Error('Cloud sign-in needs renewal.')));
});
const includeEmail=args.includes('--email');
const scopes=['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/spreadsheets',...(includeEmail?['https://www.googleapis.com/auth/gmail.send']:[])];
console.log('Connect the Google account that owns the existing ASN archive.');
console.log('This grants the ASN backend Google Drive/Sheets access'+(includeEmail?' and permission to send receipts through Gmail.':'. Email remains disabled.'));
console.log('Credentials will be stored only in project speedship-asn-cloud, secret ASN_WORKSPACE_OAUTH.');
const state=randomBytes(24).toString('hex'),verifier=randomBytes(48).toString('base64url');
let resolveCode,rejectCode;
const callback=new Promise((resolve,reject)=>{resolveCode=resolve;rejectCode=reject;});
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname!=='/callback' || url.searchParams.get('state')!==state){res.writeHead(400);res.end('Invalid callback.');return;}
  if(url.searchParams.get('error') || !url.searchParams.get('code')){res.writeHead(400);res.end('Google authorization was not completed.');rejectCode(Error('Authorization not completed.'));return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<h2>Google approval received</h2><p>The ASN setup is verifying and saving the connection. Please wait for the result in Codex before closing the setup.</p>');resolveCode(url.searchParams.get('code'));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const redirect=`http://127.0.0.1:${server.address().port}/callback`,oauth=new google.auth.OAuth2(client.client_id,client.client_secret,redirect);
connectionStage='waiting_for_google_approval';
console.log('\nOpen this Google consent link in your browser:\n'+oauth.generateAuthUrl({access_type:'offline',prompt:'consent',scope:scopes,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}));
const timeout=setTimeout(()=>rejectCode(Error('Authorization timed out. Run the setup again.')),900000);
try {
  const code=await callback;
  connectionStage='exchanging_google_approval';
  const {tokens}=await oauth.getToken({code,codeVerifier:verifier});
  if(!tokens.refresh_token)throw Error('Google did not issue an offline credential. Repeat with consent.');
  connectionStage='verifying_google_account';oauth.setCredentials(tokens);
  const about=await google.drive({version:'v3',auth:oauth}).about.get({fields:'user(emailAddress)'},{timeout:45000});
  if(about.data.user?.emailAddress?.toLowerCase()!=='arun.l@speedshipsolution.com')throw Error('Use the approved archive owner account.');
  const credential={client_id:client.client_id,client_secret:client.client_secret,refresh_token:tokens.refresh_token};
  connectionStage='saving_connection';
  await new Promise((resolve,reject)=>{const command=spawn('gcloud',['secrets','versions','add','ASN_WORKSPACE_OAUTH','--project=speedship-asn-cloud','--account=arun.l@speedshipsolution.com','--data-file=-','--quiet'],{stdio:['pipe','ignore','ignore']});command.once('error',reject);command.once('close',code=>code===0?resolve():reject(Error('Could not save the credential to Secret Manager. Check Google Cloud login.')));command.stdin.end(JSON.stringify(credential));});
  console.log('Approved owner connection saved securely.');
  const workspace=createWorkspace({databaseId:'1Kgy8JoioazRK3jlWBqhu5XH0F-MhAmmtIq2O6Z4zZpM',archiveFolderId:'1MjEjuz758C27CzLQeZwxCUTbDbTpanzB',template:'ASN_raw_format'},JSON.stringify(credential));
  connectionStage='verifying_archive';
  const check=await workspace.preflight();
  connectionStage='verifying_master_sheet';await workspace.masters();
  console.log('Archive access verified: '+check.folder.name+'. Credential saved securely.');
  console.log('Redeploy the ASN functions to load the new secret version.');
} finally {clearTimeout(timeout);server.close();}

}
main().catch(err=>{
  const code=typeof err?.code==='string' && /^[A-Z_]{1,50}$/.test(err.code)?' ('+err.code+')':'';
  const status=Number.isInteger(err?.response?.status)?' HTTP '+err.response.status:'';
  console.error('Workspace connection stopped at '+connectionStage+code+status+'. Check that step and retry. Credentials were not printed.');process.exitCode=1;
});
