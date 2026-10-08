import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {downloadFilename} from '../assets/download-name.mjs';
const require=createRequire(import.meta.url),{disposition}=require('../functions/lib/filenames');
test('browser downloads use receipt names for PDF and Excel, including Thai brands',()=>{
 for(const stem of ['Nakama 2026-10-08 001','แบรนด์ไทย 2026-10-08 002'])for(const type of ['pdf','xlsx'])assert.equal(downloadFilename(disposition(stem,type),type),`${stem}.${type}`);
 assert.equal(downloadFilename('attachment; filename="Nakama 2026-10-08 001.xlsx"','xlsx'),'Nakama 2026-10-08 001.xlsx');
 assert.equal(downloadFilename('attachment; filename="Named.pdf"; filename*=UTF-8\'\'%XX','pdf'),'Named.pdf');
 assert.equal(downloadFilename(null,'xlsx'),'ASN.xlsx');
});
test('attachment names strip paths and header-breaking characters',()=>{
 const header=disposition('Brand/Name\\bad\r\n"test 001','pdf');
 assert.equal(header.includes('\r'),false);assert.equal(header.includes('\n'),false);
 assert.equal(downloadFilename(header,'pdf'),'Brand_Name_bad___test 001.pdf');
});
test('portal download links use the server filename instead of a hardcoded ASN name',async()=>{
 const source=readFileSync(new URL('../assets/cloud-client.js',import.meta.url),'utf8').replace(/^import .*;$/gm,''),links=[];
 const auth={authStateReady:async()=>{},currentUser:{getIdToken:async()=> 'synthetic-token'}},window={ASN_CONFIG:{firebaseConfig:{}}};let type='pdf';
 const context=vm.createContext({window,initializeApp:v=>v,getAuth:()=>auth,setPersistence:async()=>{},browserSessionPersistence:'session',downloadFilename,AbortSignal,AbortController,setTimeout:()=>1,clearTimeout:()=>{},URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL:()=>{}},document:{createElement:()=>{const link={click:()=>links.push(link.download)};return link;}},fetch:async()=>({ok:true,headers:new Headers({'Content-Disposition':disposition('Nakama 2026-10-08 001',type)}),blob:async()=>new Blob(['synthetic'])})});
 vm.runInContext(source,context);await window.ASNCloud.ready;
 await window.ASNCloud.download('id','pdf');type='xlsx';await window.ASNCloud.download('id','xlsx');
 assert.deepEqual(links,['Nakama 2026-10-08 001.pdf','Nakama 2026-10-08 001.xlsx']);
});
