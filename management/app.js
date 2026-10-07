'use strict';
const $ = id => document.getElementById(id);
const messages = {
  en: {
    management:'MANAGEMENT',signInTitle:'Every shipment, in one place.',signInNote:'Sign in with your management account.',username:'Username',password:'Password',signIn:'Sign in',signingIn:'Signing in…',backSubmission:'Back to ASN submission',
    workspace:'WORKSPACE',overview:'Overview',newASN:'New ASN',archive:'Drive archive',bangkokNote:'All dates use Bangkok time',overviewTitle:'ASN overview',overviewNote:'Review inbound, outbound and notification activity.',signOut:'Sign out',thisMonth:'This month',today:'Today',allDates:'All dates',refresh:'Refresh',
    fromDate:'From date',toDate:'To date',brand:'Brand',direction:'Direction',allBrands:'All brands',allDirections:'Inbound & outbound',inbound:'Inbound',outbound:'Outbound',search:'Search documents',searchPlaceholder:'Document name, ASN ID or PO',
    totalDocuments:'Total documents',filteredNote:'For the selected filters',attention:'Needs attention',attentionNote:'Pending files or failed / unconfirmed notifications',dailyActivity:'Daily activity',notifications:'Notifications',email:'Email',emailConfiguration:'Document copies to configured recipients',notificationNote:'Per-document status is shown below. Enabling notifications applies to new submissions.',
    documents:'Documents',document:'Document',date:'Submitted date',files:'Files',details:'Details',export:'Export CSV',noDocuments:'No documents found',emptyNote:'Try another date range, brand or search.',previous:'Previous',next:'Next',storageNote:'Archives are stored in Drive by brand and direction.',
    documentDetails:'DOCUMENT DETAILS',loading:'Loading…',updated:'Updated',results:'documents',page:'Page',of:'of',chartNote:'Last 14 days within the selected period',complete:'Complete',pending:'Pending',sent:'Accepted',disabled:'Disabled',failed:'Failed',unknown:'Unconfirmed',not_requested:'Not requested',enabled:'Enabled',missingConfiguration:'Setup needed',lineConfiguration:'Messaging API push notifications',lineUnavailable:'Channel token or destination is missing',view:'View',po:'PO number',expectedArrival:'Expected arrival / dispatch',company:'Company',address:'Address',contact:'Contact',phone:'Phone',remark:'Remarks',sku:'SKU',product:'Product',lot:'Lot',expiry:'Expiry',cartons:'Cartons',pieces:'Pieces',items:'Items',archivePath:'Archive location',dateOrder:'The start date must be on or before the end date.',
    networkError:'Could not connect. Check your connection and try again.',backendUpdate:'The website is ready, but Apps Script needs the management update. Replace Code.gs and deploy a new version of the existing web app.',MANAGEMENT_SETUP:'Management login is not configured. Add MANAGEMENT_USERNAME and MANAGEMENT_PASSWORD (at least 12 characters) in Apps Script Project Settings → Script Properties.',LOGIN_FAILED:'The management username or password is incorrect.',RATE_LIMIT:'Too many attempts. Please wait 15 minutes.',MANAGEMENT_AUTH_EXPIRED:'Your management session expired. Please sign in again.',BUSY:'The system is busy. Please try again shortly.',ARCHIVE_LIMIT:'This archive is too large for the current scan limit. Contact the administrator.',ARCHIVE_PENDING:'This archive is still being created. Refresh shortly.',NOT_FOUND:'Archive not found.',REQUEST_FAILED:'Could not load the archive. Check the deployment account’s Drive permissions.'
  },
  th: {
    management:'ฝ่ายจัดการ',signInTitle:'ดูแลทุกการรับเข้าและส่งออก',signInNote:'เข้าสู่ระบบด้วยบัญชีฝ่ายจัดการ',username:'ชื่อผู้ใช้',password:'รหัสผ่าน',signIn:'เข้าสู่ระบบ',signingIn:'กำลังเข้าสู่ระบบ…',backSubmission:'กลับไปหน้าส่ง ASN',
    workspace:'พื้นที่ทำงาน',overview:'ภาพรวม',newASN:'ส่ง ASN ใหม่',archive:'โฟลเดอร์จัดเก็บ',bangkokNote:'วันที่ทั้งหมดใช้เวลาไทย',overviewTitle:'ภาพรวม ASN',overviewNote:'ติดตามเอกสารรับเข้า ส่งออก และสถานะการแจ้งเตือน',signOut:'ออกจากระบบ',thisMonth:'เดือนนี้',today:'วันนี้',allDates:'ทุกวันที่',refresh:'รีเฟรชข้อมูล',
    fromDate:'ตั้งแต่วันที่',toDate:'ถึงวันที่',brand:'แบรนด์',direction:'ประเภท',allBrands:'ทุกแบรนด์',allDirections:'รับเข้าและส่งออก',inbound:'รับเข้า',outbound:'ส่งออก',search:'ค้นหาเอกสาร',searchPlaceholder:'ชื่อเอกสาร, เลข ASN, PO',
    totalDocuments:'เอกสารทั้งหมด',filteredNote:'ตามตัวกรองที่เลือก',attention:'รายการที่ต้องตรวจสอบ',attentionNote:'ไฟล์ยังไม่ครบ หรือแจ้งเตือนล้มเหลว/ไม่ทราบสถานะ',dailyActivity:'เอกสารรายวัน',notifications:'การแจ้งเตือน',email:'อีเมล',emailConfiguration:'สำเนาเอกสารตามอีเมลที่ระบุ',notificationNote:'สถานะของแต่ละรายการอยู่ในตารางด้านล่าง การเปิดแจ้งเตือนจะมีผลกับรายการใหม่',
    documents:'รายการเอกสาร',document:'เอกสาร',date:'วันที่ส่ง',files:'ไฟล์',details:'รายละเอียด',export:'ส่งออก CSV',noDocuments:'ไม่พบเอกสาร',emptyNote:'ลองเปลี่ยนช่วงวันที่ แบรนด์ หรือคำค้นหา',previous:'ก่อนหน้า',next:'ถัดไป',storageNote:'เอกสารจัดเก็บใน Drive แยกตามแบรนด์และประเภท',
    documentDetails:'รายละเอียดเอกสาร',loading:'กำลังโหลด…',updated:'อัปเดต',results:'รายการ',page:'หน้า',of:'จาก',chartNote:'14 วันล่าสุดภายในช่วงที่เลือก',complete:'ครบแล้ว',pending:'กำลังจัดเก็บ',sent:'LINE/API รับคำขอแล้ว',disabled:'ปิดอยู่',failed:'ล้มเหลว',unknown:'ยังไม่ยืนยัน',not_requested:'ไม่ได้ร้องขอ',enabled:'เปิดอยู่',missingConfiguration:'ต้องตั้งค่าเพิ่ม',lineConfiguration:'แจ้งเตือนผ่าน Messaging API',lineUnavailable:'ยังไม่มี Token หรือรหัสผู้รับ',view:'ดูข้อมูล',po:'เลข PO',expectedArrival:'วันเวลารับเข้า / ส่งออกที่คาดไว้',company:'บริษัท',address:'ที่อยู่',contact:'ผู้ติดต่อ',phone:'โทรศัพท์',remark:'หมายเหตุ',sku:'SKU',product:'สินค้า',lot:'ล็อต',expiry:'วันหมดอายุ',cartons:'ลัง',pieces:'ชิ้น',items:'รายการสินค้า',archivePath:'โฟลเดอร์จัดเก็บ',dateOrder:'วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด',
    networkError:'เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',backendUpdate:'หน้าเว็บพร้อมแล้ว แต่ต้องอัปเดต Apps Script สำหรับฝ่ายจัดการ โดยแทนที่ Code.gs และปรับใช้เวอร์ชันใหม่ของ Web app เดิม',MANAGEMENT_SETUP:'ยังไม่ได้ตั้งค่าบัญชีฝ่ายจัดการ กรุณาเพิ่ม MANAGEMENT_USERNAME และ MANAGEMENT_PASSWORD (อย่างน้อย 12 ตัวอักษร) ใน Apps Script → Project Settings → Script Properties',LOGIN_FAILED:'ชื่อผู้ใช้หรือรหัสผ่านฝ่ายจัดการไม่ถูกต้อง',RATE_LIMIT:'เข้าสู่ระบบผิดหลายครั้ง กรุณารอ 15 นาที',MANAGEMENT_AUTH_EXPIRED:'หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบฝ่ายจัดการใหม่',BUSY:'ระบบกำลังทำงาน กรุณาลองใหม่อีกครั้ง',ARCHIVE_LIMIT:'จำนวนไฟล์เกินขีดจำกัดปัจจุบัน กรุณาติดต่อผู้ดูแลระบบ',ARCHIVE_PENDING:'ไฟล์นี้กำลังสร้าง กรุณารอสักครู่แล้วรีเฟรช',NOT_FOUND:'ไม่พบเอกสาร',REQUEST_FAILED:'โหลดเอกสารไม่สำเร็จ กรุณาตรวจสอบสิทธิ์ Drive ของบัญชีที่ปรับใช้'
  }
};
let language='th';
try { language=localStorage.getItem('asn-management-language')==='en'?'en':'th'; } catch(_) {}
let token='', generation=0, detailGeneration=0, records=[], filtered=[], page=1, updated=null, today=bangkokToday(), notifications={}, detail=null, loading=false, filterError=false;
const pageSize=20;
function t(key) { return messages[language][key] || messages.en[key] || key; }
function element(tag,text,className) { const el=document.createElement(tag); if(text!==undefined) el.textContent=String(text); if(className) el.className=className; return el; }
function number(value) { return new Intl.NumberFormat(language==='th'?'th-TH':'en-GB').format(value); }
function bangkokToday() { const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); const get=key=>parts.find(p=>p.type===key).value; return get('year')+'-'+get('month')+'-'+get('day'); }
function dateText(date) { if(!date) return '—'; const parts=date.slice(0,10).split('-'); return parts.length===3?parts[2]+'/'+parts[1]+'/'+parts[0]:date; }
function translate() {
  document.documentElement.lang=language; $('languageButton').textContent=language==='th'?'English':'ไทย';
  document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
  document.querySelectorAll('[data-placeholder]').forEach(el=>el.placeholder=t(el.dataset.placeholder));
  if($('brandFilter').firstElementChild) $('brandFilter').firstElementChild.textContent=t('allBrands');
  $('fromDate').setAttribute('aria-label',t('fromDate')); $('toDate').setAttribute('aria-label',t('toDate')); $('searchInput').setAttribute('aria-label',t('search'));
  ['loginError','dashboardError','setupNotice'].forEach(id=>{const el=$(id);if(el.dataset.code) el.textContent=t(el.dataset.code);});
  if(token) render(); if(detail) renderDetail(detail);
}
function errorText(error) { return error.code ? t(error.code) : error.message || t('networkError'); }
function showError(id,error) { const el=$(id); el.dataset.code=error.code || ''; el.textContent=errorText(error); el.hidden=false; }
function hideError(id) { $(id).hidden=true; $(id).dataset.code=''; }
function apiUrl() { const url=window.ASN_CONFIG && window.ASN_CONFIG.apiUrl; if(typeof url!=='string' || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)) throw Object.assign(new Error(t('backendUpdate')),{code:'backendUpdate'}); return url; }
async function request(payload) {
  const snapshot=generation, controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),45000);
  try {
    const response=await fetch(apiUrl(),{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({...payload,sessionToken:token || undefined}),signal:controller.signal});
    if(!response.ok) throw new Error(t('networkError'));
    const data=await response.json();
    if(snapshot!==generation) throw Object.assign(new Error('Session changed'),{stale:true});
    if(!data.success) {
      const code=data.code==='AUTH_EXPIRED'?'backendUpdate':data.code;
      if(code==='MANAGEMENT_AUTH_EXPIRED') clearSession();
      throw Object.assign(new Error(data.message || t('REQUEST_FAILED')),{code:code || 'REQUEST_FAILED'});
    }
    return data;
  } finally {clearTimeout(timeout);}
}
function clearSession() {
  token=''; generation++; records=[]; filtered=[]; detail=null; notifications={}; updated=null;
  $('recordsBody').replaceChildren(); $('detailContent').replaceChildren(); $('managerName').textContent=''; $('archiveLink').removeAttribute('href');
  if($('detailDialog').open) $('detailDialog').close();
  $('dashboard').hidden=true; $('loginView').hidden=false; $('password').value='';
}
async function signIn(event) {
  event.preventDefault(); hideError('loginError'); $('loginButton').disabled=true; $('loginButton').textContent=t('signingIn');
  try {
    const data=await request({action:'managementLogin',username:$('username').value.trim(),password:$('password').value});
    if(typeof data.sessionToken!=='string' || !/^[a-f0-9-]{72}$/i.test(data.sessionToken)) throw Object.assign(new Error(t('backendUpdate')),{code:'backendUpdate'});
    token=data.sessionToken; generation++; $('password').value=''; $('managerName').textContent=data.username || $('username').value;
    $('loginView').hidden=true; $('dashboard').hidden=false; $('setupNotice').hidden=true;
    setPeriod('month'); await refresh();
  } catch(error) { if(!error.stale) showError('loginError',error); }
  finally {$('loginButton').disabled=false;$('loginButton').textContent=t('signIn');}
}
async function refresh() {
  if(loading || !token) return; loading=true; $('refreshButton').disabled=true; $('refreshButton').textContent=t('loading'); hideError('dashboardError');
  try {
    const data=await request({action:'managementList'});
    if(!Array.isArray(data.records)) throw Object.assign(new Error(t('backendUpdate')),{code:'backendUpdate'});
    records=data.records; today=data.today || today; notifications=data.notifications || {}; updated=new Date(); page=1;
    const selected=$('brandFilter').value; $('brandFilter').replaceChildren(element('option',t('allBrands')));
    $('brandFilter').firstElementChild.value='';
    [...new Set(records.map(r=>r.brand))].sort().forEach(brand=>{const option=element('option',brand);option.value=brand;$('brandFilter').append(option);});
    $('brandFilter').value=selected; if(!$('brandFilter').value) $('brandFilter').value='';
    if(/^https:\/\/drive\.google\.com\/drive\/folders\/[a-zA-Z0-9_-]+$/.test(data.archiveUrl||'')) $('archiveLink').href=data.archiveUrl;
    render();
  } catch(error) {if(!error.stale) showError(token?'dashboardError':'loginError',error);}
  finally {loading=false;$('refreshButton').disabled=false;$('refreshButton').textContent=t('refresh');}
}
function setPeriod(period) {
  document.querySelectorAll('[data-period]').forEach(button=>button.classList.toggle('selected',button.dataset.period===period));
  $('fromDate').value=period==='all'?'':period==='today'?today:today.slice(0,7)+'-01';
  $('toDate').value=period==='all'?'':today; page=1; if(token) render();
}
function badge(status,channel) {
  const valid=['complete','pending','sent','disabled','failed','unknown','not_requested','enabled','missingConfiguration'];
  if(!valid.includes(status)) status='unknown';
  let label=t(status);
  if(status==='sent' && channel==='email') label=language==='th'?'ส่งแล้ว':'Sent';
  const style=['complete','sent','enabled'].includes(status)?'good':['pending','unknown','missingConfiguration'].includes(status)?'warn':status==='failed'?'bad':'';
  return element('span',label,'badge '+style);
}
function fileLink(url,label,type) {
  const pattern=type==='sheet'?/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9_-]+\/edit$/:/^https:\/\/drive\.google\.com\/file\/d\/[a-zA-Z0-9_-]+\/view$/;
  if(!pattern.test(url||'')) return null;
  const a=element('a',label); a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
}
function render() {
  const from=$('fromDate').value,to=$('toDate').value,brand=$('brandFilter').value,direction=$('directionFilter').value,query=$('searchInput').value.trim().toLowerCase();
  if(from && to && from>to) {filterError=true;showError('dashboardError',{code:'dateOrder'});filtered=[];}
  else {
    if(filterError) {hideError('dashboardError');filterError=false;}
    filtered=records.filter(r=>(!from || r.date>=from) && (!to || r.date<=to) && (!brand || r.brand===brand) && (!direction || r.direction===direction) && (!query || [r.name,r.asnId,r.brand,r.poNumber].join(' ').toLowerCase().includes(query)));
  }
  $('totalCount').textContent=number(filtered.length);$('inboundCount').textContent=number(filtered.filter(r=>r.direction==='Inbound').length);$('outboundCount').textContent=number(filtered.filter(r=>r.direction==='Outbound').length);
  $('attentionCount').textContent=number(filtered.filter(r=>r.status!=='complete' || ['failed','unknown'].includes(r.lineStatus) || ['failed','unknown'].includes(r.emailStatus)).length);
  $('lineConfiguration').textContent=t(notifications.lineEnabled && !notifications.lineConfigured?'lineUnavailable':'lineConfiguration');
  $('lineConfigBadge').replaceWith(Object.assign(badge(!notifications.lineEnabled?'disabled':notifications.lineConfigured?'enabled':'missingConfiguration'),{id:'lineConfigBadge'}));
  $('emailConfigBadge').replaceWith(Object.assign(badge(notifications.emailEnabled?'enabled':'disabled'),{id:'emailConfigBadge'}));
  $('resultsCaption').textContent=number(filtered.length)+' '+t('results');
  $('exportButton').disabled=!filtered.length; $('emptyState').hidden=filtered.length>0;
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.max(1,Math.min(page,pages));
  const body=$('recordsBody');body.replaceChildren();
  filtered.slice((page-1)*pageSize,page*pageSize).forEach(record=>{
    const tr=element('tr'),documentCell=element('td');
    documentCell.append(element('span',record.name,'document-name'),element('small',record.poNumber?'PO: '+record.poNumber:record.asnId));
    tr.append(documentCell,element('td',record.brand));
    const directionCell=element('td'); directionCell.append(element('span',t(record.direction==='Outbound'?'outbound':'inbound'),'badge '+(record.direction==='Outbound'?'blue':'good')));tr.append(directionCell,element('td',dateText(record.date)));
    const files=element('td'),links=element('div',undefined,'file-links'),sheet=fileLink(record.sheetUrl,'Sheets','sheet'),pdf=fileLink(record.pdfUrl,'PDF','pdf');
    if(sheet) links.append(sheet);if(pdf) links.append(pdf);if(record.status!=='complete') links.append(badge('pending'));files.append(links);tr.append(files);
    const lineCell=element('td'),emailCell=element('td');lineCell.append(badge(record.lineStatus,'line'));emailCell.append(badge(record.emailStatus,'email'));tr.append(lineCell,emailCell);
    const actions=element('td'),view=element('button',t('view'));view.type='button';view.addEventListener('click',()=>openDetail(record));actions.append(view);tr.append(actions);body.append(tr);
  });
  $('previousButton').disabled=page<=1;$('nextButton').disabled=page>=pages;$('pageCaption').textContent=t('page')+' '+page+' '+t('of')+' '+pages;
  $('updatedAt').textContent=updated?t('updated')+' '+new Intl.DateTimeFormat(language==='th'?'th-TH':'en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'}).format(updated)+' · Bangkok':'';
  renderChart();
}
function svgNode(tag,attrs,text) {const node=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs||{}).forEach(([key,value])=>node.setAttribute(key,String(value)));if(text!==undefined)node.textContent=text;return node;}
function renderChart() {
  const end=$('toDate').value || (filtered.length?filtered.reduce((latest,r)=>r.date>latest?r.date:latest,filtered[0].date):today);
  const days=[];const endDate=new Date(end+'T00:00:00Z');if(Number.isNaN(endDate.getTime())) return;
  for(let i=13;i>=0;i--){const date=new Date(endDate);date.setUTCDate(date.getUTCDate()-i);const key=date.toISOString().slice(0,10);if(!$('fromDate').value || key>=$('fromDate').value) days.push({date:key,inbound:0,outbound:0});}
  filtered.forEach(r=>{const day=days.find(d=>d.date===r.date);if(day)day[r.direction==='Outbound'?'outbound':'inbound']++;});
  const width=720,height=218,left=35,base=176,plotHeight=142,span=(width-left-12)/Math.max(days.length,1),maximum=Math.max(1,...days.map(d=>Math.max(d.inbound,d.outbound)));
  const svg=svgNode('svg',{viewBox:'0 0 '+width+' '+height,'aria-hidden':'true'});
  for(let i=0;i<=3;i++){const y=base-i*plotHeight/3;svg.append(svgNode('line',{x1:left,y1:y,x2:width-10,y2:y,stroke:'#e9eee5'}),svgNode('text',{x:left-10,y:y+4,'text-anchor':'end',fill:'#83907c','font-size':11},Math.ceil(maximum*i/3)));}
  const chartDescription=[];
  days.forEach((day,index)=>{
    const x=left+index*span+span/2,barWidth=Math.min(14,span/3);
    [['inbound','#28641e',-barWidth-2],['outbound','#356b8c',2]].forEach(([kind,color,offset])=>{
      const barHeight=day[kind]/maximum*plotHeight,bar=svgNode('rect',{x:x+offset,y:base-barHeight,width:barWidth,height:barHeight,rx:3,fill:color});
      bar.append(svgNode('title',{},dateText(day.date)+' · '+t(kind)+': '+day[kind]));svg.append(bar);
    });
    if(days.length<=7 || index%2===0 || index===days.length-1) svg.append(svgNode('text',{x,y:base+22,'text-anchor':'middle',fill:'#83907c','font-size':11},day.date.slice(8,10)+'/'+day.date.slice(5,7)));
    chartDescription.push(dateText(day.date)+': '+t('inbound')+' '+day.inbound+', '+t('outbound')+' '+day.outbound);
  });
  $('chart').replaceChildren(svg);$('chart').setAttribute('aria-label',chartDescription.join('; '));$('chartCaption').textContent=t('chartNote')+(days.length?' · '+dateText(days[0].date)+' – '+dateText(end):'');
}
async function openDetail(record) {
  const current=++detailGeneration;
  detail=null;$('detailTitle').textContent=record.name;$('detailContent').replaceChildren(element('p',t('loading'),'loading'));$('detailDialog').showModal();
  try {const data=await request({action:'managementDetail',sheetId:record.sheetId});if(current===detailGeneration && $('detailDialog').open){detail=data;renderDetail(data);}}
  catch(error){if(current===detailGeneration && !error.stale && $('detailDialog').open)$('detailContent').replaceChildren(element('p',errorText(error),'error'));}
}
function renderDetail(data) {
  const r=data.record,doc=data.document||{},lines=Array.isArray(data.lines)?data.lines:[];if(!r)return;
  $('detailTitle').textContent=r.name;const container=$('detailContent');container.replaceChildren();
  const chips=element('div',undefined,'detail-files');chips.append(badge(r.status),badge(r.lineStatus,'line'),badge(r.emailStatus,'email'));container.append(chips);
  const fields=[['brand',r.brand],['direction',t(r.direction==='Outbound'?'outbound':'inbound')],['po',doc.poNumber],['expectedArrival',doc.expectedArrival?dateText(doc.expectedArrival)+' '+doc.expectedArrival.slice(11)+' (Bangkok)':''],['company',doc.senderCompany],['contact',doc.senderName],['phone',doc.senderPhone],['date',dateText(r.date)],['address',doc.senderAddress],['remark',doc.remark],['archivePath','ASN / '+r.brand+' / '+r.direction]];
  const grid=element('dl',undefined,'detail-grid');
  fields.forEach(([key,value])=>{const group=element('div',undefined,['address','remark','archivePath'].includes(key)?'wide':'');group.append(element('dt',t(key)),element('dd',value||'—'));grid.append(group);});container.append(grid);
  const links=element('div',undefined,'detail-files'),sheet=fileLink(r.sheetUrl,'Google Sheets','sheet'),pdf=fileLink(r.pdfUrl,'PDF','pdf');if(sheet)links.append(sheet);if(pdf)links.append(pdf);container.append(links,element('h3',t('items')+' ('+lines.length+')'));
  const tableWrap=element('div',undefined,'detail-lines'),table=element('table'),thead=element('thead'),header=element('tr');
  ['sku','product','lot','expiry','cartons','pieces'].forEach(key=>header.append(element('th',t(key))));thead.append(header);table.append(thead);
  const tbody=element('tbody');lines.forEach(line=>{const row=element('tr');[line.sku,line.name,line.lot||'—',line.expiryDate||'—',number(Number(line.qtyCarton)||0),number(Number(line.qtyPiece)||0)].forEach(value=>row.append(element('td',value)));tbody.append(row);});table.append(tbody);tableWrap.append(table);container.append(tableWrap);
  const totals=element('div',undefined,'detail-totals');totals.append(element('span',t('cartons')+': '+number(lines.reduce((sum,l)=>sum+(Number(l.qtyCarton)||0),0))),element('span',t('pieces')+': '+number(lines.reduce((sum,l)=>sum+(Number(l.qtyPiece)||0),0))));container.append(totals);
}
function exportCsv() {
  const columns=['ASN ID','File name','Brand','Direction','Submitted date (Bangkok)','PO','Archive status','LINE status','Email status','Sheets URL','PDF URL'];
  const escape=value=>{let s=String(value==null?'':value);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const rows=[columns,...filtered.map(r=>[r.asnId,r.name,r.brand,r.direction,r.date,r.poNumber,r.status,r.lineStatus,r.emailStatus,r.sheetUrl,r.pdfUrl])];
  const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(escape).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=element('a');
  link.href=url;link.download='Speedship-ASN-'+today+'.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('loginForm').addEventListener('submit',signIn);
$('logoutButton').addEventListener('click',()=>{const previousToken=token;if(previousToken)request({action:'managementLogout'}).catch(()=>{});clearSession();hideError('loginError');});
$('refreshButton').addEventListener('click',refresh);
$('languageButton').addEventListener('click',()=>{language=language==='th'?'en':'th';try{localStorage.setItem('asn-management-language',language);}catch(_){}translate();});
document.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>setPeriod(button.dataset.period)));
['brandFilter','directionFilter','searchInput','fromDate','toDate'].forEach(id=>$(id).addEventListener('input',()=>{page=1;if(id==='fromDate'||id==='toDate')document.querySelectorAll('[data-period]').forEach(button=>button.classList.remove('selected'));render();}));
$('previousButton').addEventListener('click',()=>{page--;render();});$('nextButton').addEventListener('click',()=>{page++;render();});
$('exportButton').addEventListener('click',exportCsv);$('closeDetailButton').addEventListener('click',()=>$('detailDialog').close());$('detailDialog').addEventListener('close',()=>{detailGeneration++;detail=null;$('detailContent').replaceChildren();});
translate();
(async()=>{try{const response=await fetch(apiUrl());const data=await response.json();if(!Array.isArray(data.capabilities)||!data.capabilities.includes('management'))showError('setupNotice',{code:'backendUpdate'});}catch(_){showError('setupNotice',{code:'networkError'});}})();
