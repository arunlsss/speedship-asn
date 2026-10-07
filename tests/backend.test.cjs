// Offline contract and failure-recovery tests. No Google writes or notifications.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const crypto=require('node:crypto');
const source=fs.readFileSync(require('node:path').join(__dirname,'../backend/Code.gs'),'utf8');
const DB='1Kgy8JoioazRK3jlWBqhu5XH0F-MhAmmtIq2O6Z4zZpM';
const ROOT='1MjEjuz758C27CzLQeZwxCUTbDbTpanzB';
function harness() {
  const files=new Map(),books=new Map(),folders=new Map(),cache=new Map(),props=new Map();
  let now='2026-10-07', pdfFails=0, folderDenied=false, busy=false, mails=0, lineCalls=0, masterWrites=0, failFinalCommit=false;
  const iterator=arr=>{let i=0; return {hasNext:()=>i<arr.length,next:()=>arr[i++]};};
  class File {
    constructor(name,id=crypto.randomUUID(),blob=null){this.id=id;this.name=name;this.description='';this.blob=blob;this.trashed=false;files.set(id,this);}
    getId(){return this.id;} getName(){return this.name;} getDescription(){return this.description;}
    setDescription(s){if(failFinalCommit && JSON.parse(s).status==='complete'){failFinalCommit=false;throw Error('interrupted commit');}this.description=s;return this;}
    moveTo(f){if(this.folder)this.folder.files=this.folder.files.filter(x=>x!==this);this.folder=f;f.files.push(this);return this;}
    setTrashed(v){this.trashed=v;return this;}getUrl(){return 'https://drive.google.com/file/d/'+this.id;}getBlob(){return this.blob;}
  }
  class Folder {
    constructor(name,id=crypto.randomUUID()){this.name=name;this.id=id;this.children=[];this.files=[];folders.set(id,this);}
    getName(){return this.name;}getFoldersByName(n){return iterator(this.children.filter(x=>x.name===n));}
    createFolder(n){const f=new Folder(n);this.children.push(f);return f;}
    getFiles(){return iterator(this.files.filter(x=>!x.trashed));}
    getFilesByName(n){return iterator(this.files.filter(x=>x.name===n&&!x.trashed));}
    createFile(blob){const f=new File(blob.name,undefined,blob);f.moveTo(this);return f;}
  }
  class Range {
    constructor(sheet,a1){this.sheet=sheet;this.a1=a1;}
    mutate(v){if(this.sheet.master)masterWrites++;this.sheet.values[this.a1]=v;return this;}
    setValue(v){return this.mutate(v);}setValues(v){return this.mutate(v);}clearContent(){return this.mutate(null);}
    setNumberFormat(){return this;}setWrap(){return this;}merge(){return this;}
    getDisplayValues(){return this.a1==='G20:G23'?[['Warehouse'],['Warehouse address'],['Warehouse contact'],['Warehouse phone']]:this.sheet.rows;}
  }
  class Sheet {
    constructor(name,rows=[],master=false){this.name=name;this.rows=rows;this.master=master;this.values={};this.id=crypto.randomUUID();this.maxRows=1021;this.maxCols=26;}
    getDataRange(){return {getDisplayValues:()=>this.rows.map(r=>r.slice())};}
    getRange(...args){return new Range(this,args.length===1?args[0]:args.join(','));}
    getSheetId(){return this.id;}setName(n){this.name=n;return this;}
    copyTo(book){const s=new Sheet('Copy '+this.name);book.sheets.push(s);return s;}
    deleteRows(_,n){assert.equal(this.master,false);this.maxRows-=n;}
    deleteColumns(_,n){assert.equal(this.master,false);this.maxCols-=n;}
    getMaxRows(){return this.maxRows;}getMaxColumns(){return this.maxCols;}
    hideRows(){}hideColumns(){}setHiddenGridlines(){}hideSheet(){this.hidden=true;}
  }
  class Book {
    constructor(name,id=crypto.randomUUID()){this.id=id;this.name=name;this.sheets=[new Sheet('Sheet1')];books.set(id,this);new File(name,id);}
    getName(){return this.name;}getId(){return this.id;}getSheetByName(n){return this.sheets.find(s=>s.name===n);}
    getSheets(){return this.sheets.slice();}insertSheet(n){const s=new Sheet(n);this.sheets.push(s);return s;}
    deleteSheet(s){assert.equal(this.id===DB,false);this.sheets=this.sheets.filter(x=>x!==s);}
    setSpreadsheetTimeZone(t){assert.equal(t,'Asia/Bangkok');}
  }
  const db=new Book('Fixture masters',DB);
  const ruleHeaders=['Brand','required_หมายเลข PO','required_วันเวลาที่จะมาถึง','required_ชื่อบริษัทผู้ส่ง','required_ที่อยู่บริษัทผู้ส่ง','required_ชื่อผู้ส่ง','required_เบอร์โทรศัพท์ผู้ส่ง','required_หมายเหตุ(ASN)','required_เลข SKU','required_ชื่อสินค้า','required_เลขล็อต','required_วันหมดอายุ','required_ความกว้างลัง','required_ความยาวลัง','required_ความสูงลัง','required_จำนวนลัง','required_จำนวนชิ้น','required_หมายเหตุ(Lines)'];
  db.sheets=[new Sheet('Customer',[['Customer','Username','Password','IsActive','Brands','Fixed_Emails'],['Example','demo','fixture-password','TRUE','Example Brand','ops@example.test'],['Other','other','fixture-password','TRUE','Other Brand','']],true),new Sheet('Brand',[ruleHeaders,['Example Brand',...Array(17).fill('FALSE')],['Other Brand',...Array(17).fill('FALSE')]],true),new Sheet('SKU',[['SKU','Brand','Name','ความกว้างลัง (cm)','ความยาวลัง (cm)','ความสูงลัง (cm)'],['00123','Example Brand','Example product','10','20','30']],true),new Sheet('ASN_raw_format',[],true)];
  const root=new Folder('Archive',ROOT);
  const context=vm.createContext({console,Date,JSON,Set,Map,Number,String,Object,Array,Error,
    ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})},
    SpreadsheetApp:{openById:id=>{if(!books.has(id))throw Error('Missing book');return books.get(id);},create:n=>new Book(n),flush(){}},
    DriveApp:{getFolderById:id=>{if(folderDenied)throw Error('Forbidden');return folders.get(id);},getFileById:id=>files.get(id)},
    CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
    LockService:{getScriptLock:()=>({tryLock:()=>!busy,releaseLock(){}})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)})},
    ScriptApp:{getOAuthToken:()=> 'fixture-oauth'},MailApp:{sendEmail(){mails++;}},
    Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest()),formatDate:(_,tz,format)=>{assert.equal(tz,'Asia/Bangkok');assert.equal(format,'yyyy-MM-dd');return now;},sleep(){}},
    UrlFetchApp:{fetch:(url)=>{
      if(url.includes('api.line.me')){lineCalls++;return {getResponseCode:()=>200};}
      const fail=pdfFails-->0;
      const blob={name:'export.pdf',getBytes:()=>Array.from(Buffer.from(fail?'not a PDF':'%PDF fixture')),setName(n){this.name=n;return this;}};
      return {getResponseCode:()=>fail?503:200,getBlob:()=>blob};
    }}
  });
  vm.runInContext(source,context);
  const api=p=>context.doPost({postData:{contents:JSON.stringify(p)}});
  const login=()=>api({action:'login',username:'demo',password:'fixture-password'});
  const payload=(token,direction='Inbound')=>({action:'submitASN',sessionToken:token,requestId:crypto.randomUUID(),brand:'Example Brand',direction,document:{poNumber:'PO-1',expectedArrival:'2026-10-07T12:00',senderCompany:'Customer',senderAddress:'Address',senderName:'Person',senderPhone:'123',remark:'Note'},lines:[{sku:'00123',name:'Example product',lot:'01',expiryDate:'N/A',width:'10',length:'20',height:'30',qtyCarton:'1',qtyPiece:'12',remark:''}],respondEmail:'receipt@example.test'});
  return {api,login,payload,root,books,files,props,cache,db,context,setPdfFails:n=>pdfFails=n,deny:()=>folderDenied=true,setBusy:b=>busy=b,nextDay:()=>now='2026-10-08',failCommit:()=>failFinalCommit=true,counts:()=>({mails,lineCalls,masterWrites}),archives:()=>Array.from(files.values()).filter(f=>!f.trashed && f.id!==DB),metadata:f=>JSON.parse(f.getDescription())};
}
test('login and SKU lookup preserve leading zeros, require a session, enforce grants',()=>{
  const h=harness(),l=h.login();assert.equal(l.success,true);assert.equal(l.sessionToken.length,72);assert.deepEqual(l.brands,['Example Brand']);assert.equal(l.password,undefined);
  assert.equal(h.api({action:'getSKUs',brand:'Example Brand'}).code,'AUTH_EXPIRED');
  assert.equal(h.api({action:'getSKUs',sessionToken:l.sessionToken,brand:'Other Brand'}).code,'FORBIDDEN');
  assert.equal(h.api({action:'getSKUs',sessionToken:l.sessionToken,brand:'Example Brand'}).skus[0].sku,'00123');
  h.db.getSheetByName('Customer').rows[1][3]='FALSE';assert.equal(h.api({action:'getSKUs',sessionToken:l.sessionToken,brand:'Example Brand'}).code,'AUTH_EXPIRED');
});
test('separate inbound/outbound/day counts, two archive files, no master writes or messages',()=>{
  const h=harness(),token=h.login().sessionToken;
  assert.equal(h.api(h.payload(token)).fileName,'Example Brand 2026-10-07 001');
  assert.equal(h.api(h.payload(token)).fileName,'Example Brand 2026-10-07 002');
  assert.equal(h.api(h.payload(token,'Outbound')).fileName,'Example Brand 2026-10-07 001');
  h.nextDay();assert.equal(h.api(h.payload(token)).fileName,'Example Brand 2026-10-08 001');
  const folders=h.root.children[0].children;assert.deepEqual(folders.map(f=>f.name),['Inbound','Outbound']);
  assert.equal(h.archives().length,8);assert.deepEqual(h.counts(),{mails:0,lineCalls:0,masterWrites:0});
});
test('retry and retry after midnight return the existing archive without duplicate files',()=>{
  const h=harness(),p=h.payload(h.login().sessionToken),first=h.api(p);
  assert.equal(first.success,true);h.nextDay();assert.deepEqual(h.api(p),first);assert.equal(h.archives().length,2);
  p.lines[0].qtyPiece='13';assert.equal(h.api(p).code,'REQUEST_CONFLICT');assert.equal(h.archives().length,2);
});
test('PDF failure retains Sheets and retry completes the same numbered archive',()=>{
  const h=harness(),p=h.payload(h.login().sessionToken);h.setPdfFails(3);
  assert.equal(h.api(p).code,'PDF_PENDING');assert.equal(h.archives().length,1);assert.equal(h.metadata(h.archives()[0]).status,'pending');
  const result=h.api(p);assert.equal(result.fileName,'Example Brand 2026-10-07 001');assert.equal(h.archives().length,2);
});
test('PDF created before interrupted commit is reused on retry',()=>{
  const h=harness(),p=h.payload(h.login().sessionToken);h.failCommit();assert.equal(h.api(p).success,false);assert.equal(h.archives().length,2);
  assert.equal(h.api(p).success,true);assert.equal(h.archives().length,2);
});
test('invalid inputs and missing Drive access fail without writing history',()=>{
  const h=harness(),p=h.payload(h.login().sessionToken);
  p.lines[0].qtyPiece='-1';assert.equal(h.api(p).success,false);
  p.lines[0].qtyPiece='NaN';assert.equal(h.api(p).success,false);
  p.lines[0].qtyPiece='1';p.lines[0].expiryDate='31/02/2026';assert.equal(h.api(p).success,false);
  p.lines[0].expiryDate='N/A';p.respondEmail='bad-email';assert.equal(h.api(p).success,false);
  p.respondEmail='';p.direction='Invalid';assert.equal(h.api(p).success,false);
  p.direction='Inbound';h.setBusy(true);assert.equal(h.api(p).code,'BUSY');h.setBusy(false);h.deny();assert.equal(h.api(p).code,'ARCHIVE_ACCESS');assert.equal(h.archives().length,0);
});
test('multi-page sheets preserve every line and swap warehouse/recipient for outbound',()=>{
  const h=harness(),p=h.payload(h.login().sessionToken,'Outbound');
  p.lines=Array.from({length:47},(_,i)=>({...p.lines[0],sku:'SKU-'+i,lot:'L-'+i}));
  const r=h.api(p);assert.equal(r.success,true);
  const sheet=h.archives().find(f=>h.metadata(f).kind==='sheet');const tabs=h.books.get(sheet.id).getSheets();
  assert.deepEqual(tabs.map(s=>s.name),['Page 1','Page 2','Page 3','Submission_Data']);
  assert.equal(tabs[0].values.B20,'Warehouse');assert.equal(tabs[0].values.G20,'ชื่อบริษัท: Customer');
  assert.equal(tabs[2].values['B26:B32'][6][0],47);assert.equal(tabs[3].hidden,true);assert.equal(h.counts().masterWrites,0);
});
test('formula-like text is stored literally; client username/fixed emails cannot override server grants',()=>{
  const h=harness(),p=h.payload(h.login().sessionToken);p.document.poNumber='=IMPORTXML("https://invalid.test","//x")';p.username='other';p.fixedEmails=['attacker@example.test'];
  const r=h.api(p);assert.equal(r.success,true);const sheet=h.archives().find(f=>h.metadata(f).kind==='sheet');const page=h.books.get(sheet.id).getSheets()[0];assert.ok(page.values.F16.startsWith("'="));
  assert.equal(h.metadata(sheet).owner,h.context.hash_('demo'));
});
test('notifications require explicit opt-in and duplicate retries do not resend',()=>{
  const h=harness();h.props.set('EMAIL_ENABLED','true');h.props.set('LINE_ENABLED','true');h.props.set('LINE_CHANNEL_ACCESS_TOKEN','fixture-token');h.props.set('LINE_TARGET_ID','fixture-target');
  const p=h.payload(h.login().sessionToken),r=h.api(p);assert.equal(r.emailStatus,'sent');assert.equal(r.lineStatus,'sent');h.api(p);assert.deepEqual(h.counts(),{mails:1,lineCalls:1,masterWrites:0});
});
