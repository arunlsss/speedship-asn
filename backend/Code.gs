/** Speedship ASN: read-only masters, separate native Sheets/PDF archives. */
const ASN = Object.freeze({
  databaseId: '1Kgy8JoioazRK3jlWBqhu5XH0F-MhAmmtIq2O6Z4zZpM',
  archiveFolderId: '1MjEjuz758C27CzLQeZwxCUTbDbTpanzB',
  timeZone: 'Asia/Bangkok', template: 'ASN_raw_format', pageLines: 20,
  maxLines: 200, sessionSeconds: 21600, marker: 'speedship-asn-v2'
});
const DOC_KEYS = ['doc_po','doc_arrival','doc_sender_company','doc_sender_address','doc_sender_name','doc_sender_phone','doc_remark'];
const DOC_NAMES = ['poNumber','expectedArrival','senderCompany','senderAddress','senderName','senderPhone','remark'];
const LINE_KEYS = ['line_sku','line_name','line_lot','line_expiry','line_width','line_length','line_height','line_qty_carton','line_qty_piece','line_remark'];
const LINE_NAMES = ['sku','name','lot','expiryDate','width','length','height','qtyCarton','qtyPiece','remark'];

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 500000) throw new Error('Invalid request size');
    const p = JSON.parse(raw);
    let result;
    if (p.action === 'login') result = login_(p);
    else {
      const user = authenticate_(p.sessionToken);
      if (p.action === 'logout') {
        CacheService.getScriptCache().remove('session:' + p.sessionToken);
        result = { success: true };
      } else if (p.action === 'getSKUs') {
        authorizeBrand_(user, p.brand);
        result = { success: true, skus: skus_(p.brand) };
      } else if (p.action === 'submitASN') result = submit_(p, user);
      else throw new Error('Unknown action');
    }
    return json_(result);
  } catch (err) {
    // No credentials, tokens or submitted customer data in logs/responses.
    return json_({ success: false, message: err.safeMessage || 'ไม่สามารถดำเนินการได้ กรุณาตรวจสอบข้อมูลหรือติดต่อ Speedship', code: err.code || 'REQUEST_FAILED' });
  }
}
function doGet() { return json_({ success: true, service: 'Speedship ASN', version: 2 }); }
function json_(v) { return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON); }
function fail_(message, code) { const e = new Error(message); e.safeMessage = message; e.code = code || 'VALIDATION'; throw e; }
function text_(v, max) { const s = String(v == null ? '' : v).trim(); if (s.length > (max || 1000)) fail_('ข้อมูลยาวเกินกำหนด'); return s; }
function truth_(v) { return /^(true|1|yes|y|active)$/i.test(String(v).trim()); }
function split_(v) { return String(v || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean); }
function hash_(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s).map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join(''); }
function read_(name) {
  const sheet = SpreadsheetApp.openById(ASN.databaseId).getSheetByName(name);
  if (!sheet) throw new Error('Missing master sheet');
  return sheet.getDataRange().getDisplayValues();
}
function customers_() {
  const rows = read_('Customer'), headers = rows.shift();
  const col = name => { const n = headers.indexOf(name); if (n < 0) throw new Error('Missing customer column'); return n; };
  const c = ['Customer','Username','Password','IsActive','Brands','Fixed_Emails'].map(col);
  return rows.filter(r => r[c[1]]).map(r => ({ customer:r[c[0]], username:r[c[1]].trim(), password:r[c[2]], active:truth_(r[c[3]]), brands:split_(r[c[4]]), fixedEmails:split_(r[c[5]]) }));
}
function rules_() {
  const rows = read_('Brand');
  const headers = rows.shift();
  const expected = ['Brand','required_หมายเลข PO','required_วันเวลาที่จะมาถึง','required_ชื่อบริษัทผู้ส่ง','required_ที่อยู่บริษัทผู้ส่ง','required_ชื่อผู้ส่ง','required_เบอร์โทรศัพท์ผู้ส่ง','required_หมายเหตุ(ASN)','required_เลข SKU','required_ชื่อสินค้า','required_เลขล็อต','required_วันหมดอายุ','required_ความกว้างลัง','required_ความยาวลัง','required_ความสูงลัง','required_จำนวนลัง','required_จำนวนชิ้น','required_หมายเหตุ(Lines)'];
  if (expected.some((h,i) => headers[i] !== h)) throw new Error('Brand master headers changed');
  const keys = DOC_KEYS.concat(LINE_KEYS), out = {};
  rows.forEach(r => { if (r[0]) { const rule = {}; keys.forEach((k,i) => rule[k] = truth_(r[i+1])); out[r[0]] = rule; } });
  return out;
}
function login_(p) {
  const username = text_(p.username, 100), password = text_(p.password, 200);
  const cache = CacheService.getScriptCache(), key = 'attempt:' + hash_(username);
  if (Number(cache.get(key) || 0) >= 10) fail_('กรุณารอ 15 นาที ก่อนลองเข้าสู่ระบบใหม่', 'RATE_LIMIT');
  const user = customers_().find(u => u.active && u.username === username && u.password === password);
  if (!user) { cache.put(key, String(Number(cache.get(key) || 0) + 1), 900); fail_('Username หรือ Password ไม่ถูกต้อง', 'LOGIN_FAILED'); }
  cache.remove(key);
  const allRules = rules_(), brands = user.brands.filter(b => Object.prototype.hasOwnProperty.call(allRules,b));
  if (!brands.length) fail_('บัญชีนี้ยังไม่ได้รับสิทธิ์ Brand');
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('session:' + token, JSON.stringify({ username, expires:Date.now() + ASN.sessionSeconds * 1000 }), ASN.sessionSeconds);
  const requirementsByBrand = {};
  brands.forEach(b => requirementsByBrand[b] = allRules[b]);
  return { success:true, sessionToken:token, brands, customer:user.customer, requirementsByBrand };
}
function authenticate_(token) {
  if (typeof token !== 'string' || !/^[a-f0-9-]{72}$/i.test(token)) fail_('กรุณาเข้าสู่ระบบใหม่', 'AUTH_EXPIRED');
  const raw = CacheService.getScriptCache().get('session:' + token);
  if (!raw) fail_('กรุณาเข้าสู่ระบบใหม่', 'AUTH_EXPIRED');
  const session = JSON.parse(raw);
  if (session.expires < Date.now()) fail_('กรุณาเข้าสู่ระบบใหม่', 'AUTH_EXPIRED');
  // Re-read grants so disabling an account or revoking a brand applies immediately.
  const user = customers_().find(u => u.active && u.username === session.username);
  if (!user) fail_('กรุณาเข้าสู่ระบบใหม่', 'AUTH_EXPIRED');
  return user;
}
function authorizeBrand_(user, brand) {
  if (!user.brands.includes(brand) || !Object.prototype.hasOwnProperty.call(rules_(),brand)) fail_('ไม่มีสิทธิ์ใช้งาน Brand นี้', 'FORBIDDEN');
}
function skus_(brand) {
  const rows = read_('SKU'), h = rows.shift(), names = ['SKU','Brand','Name','ความกว้างลัง (cm)','ความยาวลัง (cm)','ความสูงลัง (cm)'];
  const c = names.map(n => h.indexOf(n));
  if (c.some(n => n < 0)) throw new Error('SKU master headers changed');
  return rows.filter(r => r[c[1]] === brand && r[c[0]]).map(r => ({ sku:r[c[0]], name:r[c[2]], width:r[c[3]], length:r[c[4]], height:r[c[5]], dimension:[r[c[3]],r[c[4]],r[c[5]]].join(' × ') }));
}
function emails_(raw) {
  const list = Array.from(new Set((Array.isArray(raw) ? raw : split_(raw)).map(v => text_(v,254).toLowerCase())));
  if (list.length > 20 || list.some(v => !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v))) fail_('กรุณาตรวจสอบอีเมล (สูงสุด 20 อีเมล)');
  return list;
}
function validate_(p, rule) {
  if (!['Inbound','Outbound'].includes(p.direction)) fail_('กรุณาเลือก Inbound หรือ Outbound');
  if (!/^[a-f0-9-]{36}$/i.test(String(p.requestId || ''))) fail_('Invalid submission ID');
  const doc = {};
  DOC_NAMES.forEach((n,i) => { doc[n] = text_((p.document || {})[n]); if (rule[DOC_KEYS[i]] && !doc[n]) fail_('กรุณากรอกข้อมูลเอกสารให้ครบถ้วน'); });
  if (doc.expectedArrival && !validDate_(doc.expectedArrival, true)) fail_('วันและเวลาไม่ถูกต้อง');
  if (!Array.isArray(p.lines) || !p.lines.length || p.lines.length > ASN.maxLines) fail_('กรุณาเพิ่มรายการสินค้า 1–200 รายการ');
  const seen = new Set();
  const lines = p.lines.map((input,idx) => {
    const l = {};
    LINE_NAMES.forEach((n,i) => {
      l[n] = text_((input || {})[n]);
      if (i >= 4 && i <= 8) {
        const num = Number(l[n] || 0);
        if (!Number.isFinite(num) || num < 0 || num > 1000000000) fail_('จำนวนและขนาดต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
        if (rule[LINE_KEYS[i]] && num <= 0) fail_('กรุณากรอกจำนวนและขนาดที่จำเป็นให้มากกว่า 0');
        l[n] = num;
      } else if (rule[LINE_KEYS[i]] && !l[n]) fail_('รายการที่ ' + (idx+1) + ': กรุณากรอกข้อมูลให้ครบ');
    });
    if (!l.sku || !l.name || !(l.qtyCarton > 0 || l.qtyPiece > 0)) fail_('แต่ละรายการต้องมี SKU ชื่อสินค้า และจำนวนมากกว่า 0');
    if (l.expiryDate && l.expiryDate !== 'N/A' && !validDate_(l.expiryDate,false)) fail_('วันหมดอายุไม่ถูกต้อง');
    const key = JSON.stringify([l.sku,l.name,l.lot]);
    if (seen.has(key)) fail_('รายการสินค้าซ้ำกัน');
    seen.add(key); return l;
  });
  return { brand:text_(p.brand,120), direction:p.direction, document:doc, lines, emails:emails_(p.respondEmail) };
}
function validDate_(s, time) {
  const m = time ? s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/) : s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const y=Number(time?m[1]:m[3]), mo=Number(m[2]), d=Number(time?m[3]:m[1]);
  const dt = new Date(Date.UTC(y,mo-1,d));
  return y >= 1900 && y <= 2200 && dt.getUTCFullYear()===y && dt.getUTCMonth()===mo-1 && dt.getUTCDate()===d && (!time || (Number(m[4]) < 24 && Number(m[5]) < 60));
}
function childFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  if (!it.hasNext()) return parent.createFolder(name);
  const folder = it.next();
  if (it.hasNext()) throw new Error('Ambiguous archive folders');
  return folder;
}
function metadata_(file) {
  try { const m=JSON.parse(file.getDescription() || '{}'); return m.marker===ASN.marker ? m : null; } catch (_) { return null; }
}
function scan_(folder, requestId, date) {
  const files=folder.getFiles(); let found=null, count=0;
  while (files.hasNext()) {
    const f=files.next(), m=metadata_(f);
    if (m && m.kind==='sheet') {
      if (m.date===date) count=Math.max(count, Number(m.sequence)||0);
      if (m.requestId===requestId) found={file:f, meta:m};
    }
    // Existing imported/manual names also reserve a number for this day.
    const escaped=date.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const match=f.getName().match(new RegExp(' '+escaped+' (\\d+)(?:\\.pdf)?$'));
    if (match) count=Math.max(count,Number(match[1]));
  }
  return { found, sequence:count+1 };
}
function submit_(p,user) {
  authorizeBrand_(user,p.brand);
  const data=validate_(p,rules_()[p.brand]), fingerprint=hash_(JSON.stringify(data));
  emails_(user.fixedEmails.concat(data.emails));
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(1000)) fail_('ระบบกำลังบันทึกข้อมูล กรุณาลองส่งอีกครั้ง', 'BUSY');
  let sheetFile, meta, pdfFile;
  try {
    let root;
    try { root=DriveApp.getFolderById(ASN.archiveFolderId); root.getName(); } catch (_) { fail_('บัญชีผู้ดูแลยังไม่มีสิทธิ์เข้าถึงโฟลเดอร์จัดเก็บ กรุณาติดต่อ Speedship', 'ARCHIVE_ACCESS'); }
    const folder=childFolder_(childFolder_(root,data.brand),data.direction);
    const date=Utilities.formatDate(new Date(),ASN.timeZone,'yyyy-MM-dd');
    const state=scan_(folder,p.requestId,date);
    if (state.found) {
      sheetFile=state.found.file; meta=state.found.meta;
      if (meta.owner!==hash_(user.username) || meta.fingerprint!==fingerprint) fail_('ข้อมูลถูกเปลี่ยนหลังส่ง กรุณาเริ่มรายการใหม่', 'REQUEST_CONFLICT');
      if (meta.status==='complete') return receipt_(meta);
    } else {
      const name=data.brand+' '+date+' '+String(state.sequence).padStart(3,'0');
      const book=SpreadsheetApp.create(name);
      sheetFile=DriveApp.getFileById(book.getId());
      meta={ marker:ASN.marker,kind:'sheet',requestId:p.requestId,owner:hash_(user.username),fingerprint,brand:data.brand,direction:data.direction,date,sequence:state.sequence,name,asnId:data.direction.toUpperCase()+'-'+date.replace(/-/g,'')+'-'+hash_(data.brand).slice(0,8)+'-'+String(state.sequence).padStart(3,'0'),status:'pending',sheetId:book.getId() };
      try { sheetFile.setDescription(JSON.stringify(meta)); sheetFile.moveTo(folder); }
      catch (err) { sheetFile.setTrashed(true); throw err; }
    }
    if (!meta.rendered) {
      fillArchive_(meta.sheetId,data,meta);
      meta.rendered=true; sheetFile.setDescription(JSON.stringify(meta));
    }
    // Recover the PDF if the response or final metadata write failed after creation.
    const pdfs=folder.getFilesByName(meta.name+'.pdf');
    while (pdfs.hasNext()) { const f=pdfs.next(), m=metadata_(f); if (m && m.requestId===p.requestId && m.kind==='pdf') { pdfFile=f; break; } }
    if (!pdfFile) {
      const blob=exportPdf_(meta.sheetId,meta.name);
      pdfFile=folder.createFile(blob);
      try { pdfFile.setDescription(JSON.stringify({marker:ASN.marker,kind:'pdf',requestId:p.requestId,sheetId:meta.sheetId})); }
      catch (err) { pdfFile.setTrashed(true); throw err; }
    }
    meta.pdfId=pdfFile.getId(); meta.status='complete';
    // Commit both files before notifications; a notification failure cannot undo an ASN.
    sheetFile.setDescription(JSON.stringify(meta));
    notify_(meta,sheetFile,pdfFile,data,user);
    return receipt_(meta);
  } finally { lock.releaseLock(); }
}
function receipt_(meta) {
  return { success:true,asnId:meta.asnId,fileName:meta.name,direction:meta.direction,emailStatus:meta.emailStatus || 'not_requested',lineStatus:meta.lineStatus || 'disabled' };
}
function literal_(s) { const v=String(s==null?'':s); return /^[=+\-@]/.test(v) ? "'"+v : v; }
function fillArchive_(id,data,meta) {
  if(id===ASN.databaseId) throw new Error('Refusing to modify master database');
  const book=SpreadsheetApp.openById(id), source=SpreadsheetApp.openById(ASN.databaseId).getSheetByName(ASN.template);
  if (!source) throw new Error('Missing ASN template');
  book.setSpreadsheetTimeZone(ASN.timeZone);
  // Keep a placeholder while replacing our own partial archive tabs on a retry.
  const placeholder=book.insertSheet('_building_'+Utilities.getUuid().slice(0,8));
  book.getSheets().filter(s=>s.getSheetId()!==placeholder.getSheetId()).forEach(s=>book.deleteSheet(s));
  for (let offset=0; offset<data.lines.length; offset+=ASN.pageLines) {
    const lines=data.lines.slice(offset,offset+ASN.pageLines), page=source.copyTo(book).setName('Page '+(1+offset/ASN.pageLines));
    const doc=data.document, outbound=data.direction==='Outbound';
    page.getRange('B11').setValue(outbound?'Outbound Shipping Notice':'Advance Shipping Notice');
    page.getRange('B12').setValue(literal_(meta.name+' | '+data.direction));
    page.getRange('B15').setValue(outbound?'วัน-เวลาที่คาดว่าจะส่งออก:':'วัน-เวลาที่คาดว่าจะมาถึง:');
    page.getRange('B16').setValue(literal_(doc.expectedArrival.replace('T',' ')+' (Bangkok)'));
    page.getRange('F16').setNumberFormat('@').setValue(literal_(doc.poNumber));
    page.getRange('I16').setValue(literal_(data.brand));
    // Swap the template's existing warehouse contact block for outbound recipients.
    const warehouse=page.getRange('G20:G23').getDisplayValues().map(r=>r[0]);
    const customer=['ชื่อบริษัท: '+doc.senderCompany,'ที่อยู่บริษัท: '+doc.senderAddress,(outbound?'ชื่อผู้รับ: ':'ชื่อผู้ส่ง: ')+doc.senderName,'เบอร์โทรศัพท์: '+doc.senderPhone];
    ['B20','B21','B22','B23'].forEach((a,i)=>page.getRange(a).setValue(literal_(outbound?warehouse[i]:customer[i])));
    if(outbound) ['G20','G21','G22','G23'].forEach((a,i)=>page.getRange(a).setValue(literal_(customer[i])));
    // Verified source layout: D:F is the product name, B:L the items area.
    page.getRange('B26:L72').clearContent();
    const cols=['B','C','D','G','H','I','J','K','L'];
    const values=lines.map((l,i)=>[offset+i+1,literal_(l.sku),literal_(l.name),literal_(l.lot),literal_(l.expiryDate),[l.width,l.length,l.height].join(' × '),l.qtyCarton,l.qtyPiece,literal_(l.remark)]);
    cols.forEach((c,i)=>{
      const range=page.getRange(c+'26:'+c+(25+lines.length));
      if(['C','G','H'].includes(c)) range.setNumberFormat('@');
      range.setValues(values.map(r=>[r[i]]));
    });
    const unused=47-lines.length;
    if(unused>0) page.deleteRows(26+lines.length,unused);
    const totalRow=73-unused, signatureRow=75-unused;
    page.getRange('J'+totalRow).setValue(lines.reduce((a,l)=>a+l.qtyCarton,0));
    page.getRange('K'+totalRow).setValue(lines.reduce((a,l)=>a+l.qtyPiece,0));
    page.getRange('B'+(signatureRow+2)+':L'+(signatureRow+2)).merge().setValue(literal_('หมายเหตุ: '+doc.remark)).setWrap(true);
    const lastRow=signatureRow+2;
    if(page.getMaxRows()>lastRow) page.deleteRows(lastRow+1,page.getMaxRows()-lastRow);
    if(page.getMaxColumns()>12) page.deleteColumns(13,page.getMaxColumns()-12);
    page.hideRows(1,4); page.hideColumns(1); page.setHiddenGridlines(true);
  }
  book.deleteSheet(placeholder);
  const record=book.insertSheet('Submission_Data');
  record.getRange(1,1,1,2).setValues([['Schema','speedship-asn-v2']]);
  const raw=JSON.stringify({requestId:meta.requestId,submittedDate:meta.date,sequence:meta.sequence,submission:data});
  const chunks=raw.match(/[\s\S]{1,40000}/g) || [''];
  record.getRange(2,1,chunks.length,1).setNumberFormat('@').setValues(chunks.map(s=>[literal_(s)]));
  record.hideSheet(); SpreadsheetApp.flush();
}
function exportPdf_(id,name) {
  if(id===ASN.databaseId) throw new Error('Refusing to export master database');
  SpreadsheetApp.flush();
  const url='https://docs.google.com/spreadsheets/d/'+encodeURIComponent(id)+'/export?format=pdf&size=A4&portrait=true&fitw=true&sheetnames=false&printtitle=false&pagenum=UNDEFINED&gridlines=false&fzr=false&top_margin=0.25&bottom_margin=0.25&left_margin=0.25&right_margin=0.25';
  for(let attempt=0;attempt<3;attempt++) {
    const response=UrlFetchApp.fetch(url,{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true});
    const blob=response.getBlob(), bytes=blob.getBytes();
    if(response.getResponseCode()===200 && bytes.length>4 && bytes.slice(0,4).map(b=>String.fromCharCode((b+256)%256)).join('')==='%PDF') return blob.setName(name+'.pdf');
    if(attempt<2) Utilities.sleep(1000*(attempt+1));
  }
  fail_('บันทึก Sheets แล้ว แต่สร้าง PDF ยังไม่สำเร็จ กรุณากดส่งอีกครั้งเพื่อดำเนินการต่อ', 'PDF_PENDING');
}
function notify_(meta,file,pdf,data,user) {
  const props=PropertiesService.getScriptProperties(), addresses=emails_(user.fixedEmails.concat(data.emails));
  meta.emailStatus=addresses.length?'disabled':'not_requested'; meta.lineStatus='disabled';
  const summary=[data.direction+' ASN',meta.name,'PO: '+data.document.poNumber,'Items: '+data.lines.length,'Sheets: '+file.getUrl(),'PDF: '+pdf.getUrl()].join('\n');
  // Explicit operator opt-in. Never enable these during migration smoke tests.
  if(addresses.length && props.getProperty('EMAIL_ENABLED')==='true') {
    meta.emailStatus='unknown'; file.setDescription(JSON.stringify(meta));
    try { MailApp.sendEmail({to:addresses.join(','),subject:'Speedship '+meta.name,body:summary,attachments:[pdf.getBlob()]}); meta.emailStatus='sent'; }
    catch(_) { meta.emailStatus='failed'; }
  }
  const token=props.getProperty('LINE_CHANNEL_ACCESS_TOKEN'), target=props.getProperty('LINE_TARGET_ID');
  if(props.getProperty('LINE_ENABLED')==='true' && token && target) {
    meta.lineStatus='unknown'; file.setDescription(JSON.stringify(meta));
    try {
      const r=UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+token,'X-Line-Retry-Key':Utilities.getUuid()},payload:JSON.stringify({to:target,messages:[{type:'text',text:summary}]}),muteHttpExceptions:true});
      meta.lineStatus=r.getResponseCode()===200?'sent':'failed';
    } catch(_) { meta.lineStatus='failed'; }
  }
  file.setDescription(JSON.stringify(meta));
}
/** Run manually once as the deployment owner. No writes, emails or LINE messages. */
function checkConfiguration() {
  const masters=['Customer','Brand','SKU',ASN.template];
  const db=SpreadsheetApp.openById(ASN.databaseId);
  masters.forEach(n=>{if(!db.getSheetByName(n)) throw new Error('Missing '+n);});
  rules_();
  const folder=DriveApp.getFolderById(ASN.archiveFolderId);
  console.log(JSON.stringify({database:db.getName(),archiveFolder:folder.getName(),timeZone:ASN.timeZone,checkDoesNotSendNotifications:true}));
}
