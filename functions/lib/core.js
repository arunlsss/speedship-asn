'use strict';
const { createHash, timingSafeEqual } = require('node:crypto');
class AppError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new AppError(code, message, status); };
const hash = s => createHash('sha256').update(String(s)).digest('hex');
const uidFor = username => 'customer-' + hash(username);
const text = (value, max = 1000) => {
  if (value != null && !['string', 'number'].includes(typeof value)) fail('VALIDATION', 'ข้อมูลไม่ถูกต้อง');
  const s = String(value ?? '').trim();
  if (s.length > max) fail('VALIDATION', 'ข้อมูลยาวเกินกำหนด');
  return s;
};
const truth = value => /^(true|1|yes|y|active)$/i.test(String(value).trim());
const split = value => String(value || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
function samePassword(a, b) { const x = Buffer.from(hash(a)); const y = Buffer.from(hash(b)); return timingSafeEqual(x, y); }
function emails(raw) {
  if (!Array.isArray(raw) && typeof raw !== 'string' && raw != null) fail('VALIDATION', 'อีเมลไม่ถูกต้อง');
  const list = [...new Set((Array.isArray(raw) ? raw : split(raw)).map(s => text(s, 254).toLowerCase()))];
  if (list.length > 20 || list.some(s => !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s))) fail('VALIDATION', 'กรุณาตรวจสอบอีเมล (สูงสุด 20 อีเมล)');
  return list;
}
const DOC_NAMES = ['poNumber','expectedArrival','senderCompany','senderAddress','senderName','senderPhone','remark'];
const DOC_KEYS = ['doc_po','doc_arrival','doc_sender_company','doc_sender_address','doc_sender_name','doc_sender_phone','doc_remark'];
const LINE_NAMES = ['sku','name','lot','expiryDate','width','length','height','qtyCarton','qtyPiece','remark'];
const LINE_KEYS = ['line_sku','line_name','line_lot','line_expiry','line_width','line_length','line_height','line_qty_carton','line_qty_piece','line_remark'];
const BRAND_HEADERS = ['Brand','required_หมายเลข PO','required_วันเวลาที่จะมาถึง','required_ชื่อบริษัทผู้ส่ง','required_ที่อยู่บริษัทผู้ส่ง','required_ชื่อผู้ส่ง','required_เบอร์โทรศัพท์ผู้ส่ง','required_หมายเหตุ(ASN)','required_เลข SKU','required_ชื่อสินค้า','required_เลขล็อต','required_วันหมดอายุ','required_ความกว้างลัง','required_ความยาวลัง','required_ความสูงลัง','required_จำนวนลัง','required_จำนวนชิ้น','required_หมายเหตุ(Lines)'];
function columns(headers, names) {
  const out = names.map(n => headers.indexOf(n));
  if (out.includes(-1)) fail('MASTER_SCHEMA', 'รูปแบบข้อมูลหลักเปลี่ยน กรุณาติดต่อ Speedship', 503);
  return out;
}
function customerRows(rows) {
  const [headers = [], ...body] = rows;
  const c = columns(headers, ['Customer','Username','Password','IsActive','Brands','Fixed_Emails']);
  return body.filter(r => r[c[1]]).map(r => ({customer:r[c[0]] || '', username:String(r[c[1]]).trim(), password:String(r[c[2]] || ''), active:truth(r[c[3]]), brands:split(r[c[4]]), fixedEmails:split(r[c[5]])}));
}
function ruleRows(rows) {
  const [headers = [], ...body] = rows;
  if (BRAND_HEADERS.some((h,i) => headers[i] !== h)) fail('MASTER_SCHEMA', 'รูปแบบ Brand เปลี่ยน กรุณาติดต่อ Speedship', 503);
  return Object.fromEntries(body.filter(r => r[0]).map(r => [r[0], Object.fromEntries([...DOC_KEYS, ...LINE_KEYS].map((k,i) => [k, truth(r[i+1])]))]));
}
function skuRows(rows, brand) {
  const [headers = [], ...body] = rows;
  const c = columns(headers, ['SKU','Brand','Name','ความกว้างลัง (cm)','ความยาวลัง (cm)','ความสูงลัง (cm)']);
  return body.filter(r => r[c[1]] === brand && r[c[0]]).map(r => ({sku:r[c[0]], name:r[c[2]] || '', width:r[c[3]] || '', length:r[c[4]] || '', height:r[c[5]] || '', dimension:[r[c[3]],r[c[4]],r[c[5]]].join(' × ')}));
}
function validDate(s, time) {
  const m = time ? s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/) : s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const y=Number(time?m[1]:m[3]), mo=Number(m[2]), d=Number(time?m[3]:m[1]), dt=new Date(Date.UTC(y,mo-1,d));
  return y>=1900 && y<=2200 && dt.getUTCFullYear()===y && dt.getUTCMonth()===mo-1 && dt.getUTCDate()===d && (!time || (+m[4]<24 && +m[5]<60));
}
function validate(p, rule) {
  if (!rule) fail('FORBIDDEN', 'ไม่มีสิทธิ์ใช้งาน Brand นี้', 403);
  if (!['Inbound','Outbound'].includes(p.direction)) fail('VALIDATION', 'กรุณาเลือก Inbound หรือ Outbound');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(p.requestId || ''))) fail('VALIDATION', 'Invalid submission ID');
  const document = {};
  DOC_NAMES.forEach((key,i) => { document[key]=text((p.document || {})[key]); if (rule[DOC_KEYS[i]] && !document[key]) fail('VALIDATION','กรุณากรอกข้อมูลเอกสารให้ครบถ้วน'); });
  if (document.expectedArrival && !validDate(document.expectedArrival,true)) fail('VALIDATION','วันและเวลาไม่ถูกต้อง');
  if (!Array.isArray(p.lines) || !p.lines.length || p.lines.length>200) fail('VALIDATION','กรุณาเพิ่มรายการสินค้า 1–200 รายการ');
  const seen = new Set();
  const lines = p.lines.map((input,idx) => {
    const line = {};
    LINE_NAMES.forEach((key,i) => {
      line[key] = text((input || {})[key]);
      if (i>=4 && i<=8) {
        const n = Number(line[key] || 0);
        if (!Number.isFinite(n) || n<0 || n>1e9 || (i>=7 && !Number.isInteger(n))) fail('VALIDATION','จำนวนและขนาดไม่ถูกต้อง');
        if (rule[LINE_KEYS[i]] && n<=0) fail('VALIDATION','กรุณากรอกจำนวนและขนาดที่จำเป็นให้มากกว่า 0');
        line[key]=n;
      } else if (rule[LINE_KEYS[i]] && !line[key]) fail('VALIDATION',`รายการที่ ${idx+1}: กรุณากรอกข้อมูลให้ครบ`);
    });
    if (!line.sku || !line.name || !(line.qtyCarton>0 || line.qtyPiece>0)) fail('VALIDATION','แต่ละรายการต้องมี SKU ชื่อสินค้า และจำนวนมากกว่า 0');
    if (line.expiryDate && line.expiryDate!=='N/A' && !validDate(line.expiryDate,false)) fail('VALIDATION','วันหมดอายุไม่ถูกต้อง');
    const key=JSON.stringify([line.sku,line.name,line.lot]);
    if (seen.has(key)) fail('VALIDATION','รายการสินค้าซ้ำกัน');
    seen.add(key); return line;
  });
  return {brand:text(p.brand,120), direction:p.direction, document, lines, emails:emails(p.respondEmail)};
}
function authorize(user, brand, rules) {
  if (!user || !user.active) fail('AUTH_EXPIRED','กรุณาเข้าสู่ระบบใหม่',401);
  if (!user.brands.includes(brand) || !Object.hasOwn(rules,brand)) fail('FORBIDDEN','ไม่มีสิทธิ์ใช้งาน Brand นี้',403);
}
function bangkokDate(now = new Date()) { const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now); const p = Object.fromEntries(parts.map(x=>[x.type,x.value])); return `${p.year}-${p.month}-${p.day}`; }
const submissionKey = (uid,requestId) => hash(uid+':'+requestId);
const sequenceKey = (brand,direction,date) => hash(JSON.stringify([brand,direction,date]));
function receipt(id, d) {
  return {success:true,id,requestId:d.requestId,status:d.status,stage:d.stage,fileName:d.fileName,asnId:d.asnId,brand:d.brand,direction:d.direction,poNumber:d.poNumber,customer:d.customer,createdAt:d.createdAt,updatedAt:d.updatedAt,errorCode:d.errorCode || '',message:d.message || '',hasSheets:Boolean(d.sheetId && d.rendered),hasPdf:Boolean(d.pdfId),emailStatus:d.emailStatus || 'pending',lineStatus:d.lineStatus || 'pending',itemCount:d.itemCount};
}
module.exports = {AppError,fail,hash,uidFor,text,truth,split,samePassword,emails,customerRows,ruleRows,skuRows,validate,authorize,bangkokDate,submissionKey,sequenceKey,receipt,BRAND_HEADERS};
