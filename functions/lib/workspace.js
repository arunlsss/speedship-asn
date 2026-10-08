'use strict';
const { google } = require('googleapis');
const { Readable } = require('node:stream');
const { fail, customerRows, ruleRows, skuRows } = require('./core');
const SCOPES=['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/gmail.send'];
const quote = s => String(s).replaceAll('\\','\\\\').replaceAll("'","\\'");
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
function createWorkspace(config, credentialJson) {
  let auth;
  const creds=JSON.parse(credentialJson || '{}');
  if(creds.refresh_token) {
    if(!creds.client_id || !creds.client_secret) fail('WORKSPACE_CONFIG','กรุณาตั้งค่าการเชื่อมต่อ Google Drive',503);
    auth=new google.auth.OAuth2(creds.client_id,creds.client_secret);auth.setCredentials({refresh_token:creds.refresh_token});
  } else auth=new google.auth.GoogleAuth({scopes:SCOPES});
  const drive=google.drive({version:'v3',auth}),sheets=google.sheets({version:'v4',auth}),gmail=google.gmail({version:'v1',auth});
  const options={timeout:45000};
  async function rows(name) {
    const r=await sheets.spreadsheets.values.get({spreadsheetId:config.databaseId,range:`'${name.replaceAll("'","''")}'`,valueRenderOption:'FORMATTED_VALUE'},options);
    return r.data.values || [];
  }
  async function masters() { const [customers,rules]=await Promise.all([rows('Customer'),rows('Brand')]);return {customers:customerRows(customers),rules:ruleRows(rules)}; }
  async function skus(brand) { return skuRows(await rows('SKU'),brand); }
  async function preflight() {
    const r=await drive.files.get({fileId:config.archiveFolderId,fields:'id,name,driveId,capabilities(canAddChildren)',supportsAllDrives:true},options);
    if(!r.data.capabilities?.canAddChildren) fail('ARCHIVE_ACCESS','บัญชีระบบยังไม่มีสิทธิ์สร้างไฟล์ในโฟลเดอร์ ASN',503);
    if(!r.data.driveId && !creds.refresh_token) fail('WORKSPACE_OAUTH_REQUIRED','โฟลเดอร์ ASN อยู่ใน My Drive กรุณาเชื่อมต่อบัญชี Google ของผู้ดูแล',503);
    const template=await sheets.spreadsheets.get({spreadsheetId:config.databaseId,fields:'sheets(properties)'},options);
    const source=template.data.sheets.find(s=>s.properties.title===config.template);
    if(!source) fail('MASTER_SCHEMA','ไม่พบแบบฟอร์ม ASN_raw_format',503);
    return {folder:r.data,templateSheetId:source.properties.sheetId};
  }
  async function find(q,fields='id,name,appProperties') {
    const result=await drive.files.list({q:`trashed=false and (${q})`,fields:`nextPageToken,files(${fields})`,pageSize:100,supportsAllDrives:true,includeItemsFromAllDrives:true},options);
    if(result.data.nextPageToken) fail('ARCHIVE_AMBIGUOUS','พบไฟล์จัดเก็บมากเกินไป กรุณาติดต่อ Speedship',503);
    return result.data.files || [];
  }
  async function childFolder(parent,name) {
    const found=await find(`'${quote(parent)}' in parents and mimeType='application/vnd.google-apps.folder' and name='${quote(name)}'`);
    if(found.length>1)fail('ARCHIVE_AMBIGUOUS','พบโฟลเดอร์ชื่อซ้ำ กรุณาติดต่อ Speedship',503);
    if(found.length)return found[0].id;
    const r=await drive.files.create({supportsAllDrives:true,fields:'id',requestBody:{name,mimeType:'application/vnd.google-apps.folder',parents:[parent]}},options);return r.data.id;
  }
  async function archiveFolder(brand,direction) { return childFolder(await childFolder(config.archiveFolderId,brand),direction); }
  async function sequenceFloor(brand,direction,date) {
    let parent=config.archiveFolderId;
    for(const name of [brand,direction]) {
      const folders=await find(`'${quote(parent)}' in parents and mimeType='application/vnd.google-apps.folder' and name='${quote(name)}'`);
      if(folders.length>1)fail('ARCHIVE_AMBIGUOUS','พบโฟลเดอร์ชื่อซ้ำ กรุณาติดต่อ Speedship',503);
      if(!folders.length)return 0;parent=folders[0].id;
    }
    let max=0,pageToken;
    const prefix=brand+' '+date+' ',escaped=prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),pattern=new RegExp('^'+escaped+'(\\d+)(?:\\.pdf)?$');
    do {
      const result=await drive.files.list({q:`trashed=false and '${quote(parent)}' in parents and name contains '${quote(date)}'`,fields:'nextPageToken,files(name)',pageSize:1000,pageToken,supportsAllDrives:true,includeItemsFromAllDrives:true},options);
      for(const file of result.data.files || []){const match=file.name.match(pattern);if(match)max=Math.max(max,Number(match[1]));}pageToken=result.data.nextPageToken;
    }while(pageToken);
    return max;
  }
  async function ensureFile(job,folder,kind,blob) {
    const found=await find(`'${quote(folder)}' in parents and appProperties has { key='asnSubmission' and value='${quote(job.id)}' } and appProperties has { key='asnKind' and value='${kind}' }`);
    if(found.length>1)fail('ARCHIVE_AMBIGUOUS','พบไฟล์ ASN ซ้ำ กรุณาติดต่อ Speedship',503);
    if(found.length)return found[0].id;
    const request={supportsAllDrives:true,fields:'id',requestBody:{name:job.fileName+(kind==='pdf'?'.pdf':''),mimeType:kind==='sheet'?'application/vnd.google-apps.spreadsheet':'application/pdf',parents:[folder],appProperties:{asnSubmission:job.id,asnKind:kind,asnVersion:'3'}}};
    if(blob)request.media={mimeType:'application/pdf',body:Readable.from(blob)};
    const r=await drive.files.create(request,options);return r.data.id;
  }
  async function render(id,data,job,templateSheetId) {
    if(id===config.databaseId)throw Error('Refusing master write');
    let book;
    for(let attempt=0;attempt<4;attempt++) {try {book=(await sheets.spreadsheets.get({spreadsheetId:id,fields:'sheets(properties)'},options)).data;break;}catch(err){if(attempt===3)throw err;await pause(500*(attempt+1));}}
    const placeholderId=Math.max(...book.sheets.map(s=>s.properties.sheetId),0)+1;
    await sheets.spreadsheets.batchUpdate({spreadsheetId:id,requestBody:{requests:[{updateSpreadsheetProperties:{properties:{timeZone:'Asia/Bangkok'},fields:'timeZone'}},{addSheet:{properties:{sheetId:placeholderId,title:'_building'}}},...book.sheets.map(s=>({deleteSheet:{sheetId:s.properties.sheetId}}))]}},options);
    const warehouse=(await sheets.spreadsheets.values.get({spreadsheetId:config.databaseId,range:`'${config.template}'!G20:G23`,valueRenderOption:'FORMATTED_VALUE'},options)).data.values || [];
    for(let offset=0;offset<data.lines.length;offset+=20) {
      const lines=data.lines.slice(offset,offset+20),copy=await sheets.spreadsheets.sheets.copyTo({spreadsheetId:config.databaseId,sheetId:templateSheetId,requestBody:{destinationSpreadsheetId:id}},options);
      const sheetId=copy.data.sheetId,title=`Page ${1+offset/20}`,page=`'${title}'!`,doc=data.document,outbound=data.direction==='Outbound';
      const unused=47-lines.length,totalRow=73-unused,signatureRow=75-unused,lastRow=signatureRow+2;
      const copiedRows=copy.data.gridProperties.rowCount,copiedCols=copy.data.gridProperties.columnCount;
      if(copiedRows<77 || copiedCols<12)fail('MASTER_SCHEMA','ขนาดแบบฟอร์ม ASN ไม่ถูกต้อง',503);
      const requests=[{updateSheetProperties:{properties:{sheetId,title,gridProperties:{hideGridlines:true}},fields:'title,gridProperties.hideGridlines'}},{updateCells:{range:{sheetId,startRowIndex:25,endRowIndex:72,startColumnIndex:1,endColumnIndex:12},fields:'userEnteredValue'}},{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:25+lines.length,endIndex:72}}}];
      const remainingRows=copiedRows-unused;
      if(remainingRows>lastRow)requests.push({deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:lastRow,endIndex:remainingRows}}});
      if(copiedCols>12)requests.push({deleteDimension:{range:{sheetId,dimension:'COLUMNS',startIndex:12,endIndex:copiedCols}}});
      requests.push({updateDimensionProperties:{range:{sheetId,dimension:'ROWS',startIndex:0,endIndex:4},properties:{hiddenByUser:true},fields:'hiddenByUser'}},{updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:0,endIndex:1},properties:{hiddenByUser:true},fields:'hiddenByUser'}});
      const noteRange={sheetId,startRowIndex:lastRow-1,endRowIndex:lastRow,startColumnIndex:1,endColumnIndex:12};
      requests.push({unmergeCells:{range:noteRange}},{mergeCells:{range:noteRange,mergeType:'MERGE_ALL'}},{repeatCell:{range:noteRange,cell:{userEnteredFormat:{wrapStrategy:'WRAP'}},fields:'userEnteredFormat.wrapStrategy'}});
      for(const column of [2,6,7])requests.push({repeatCell:{range:{sheetId,startRowIndex:25,endRowIndex:25+lines.length,startColumnIndex:column,endColumnIndex:column+1},cell:{userEnteredFormat:{numberFormat:{type:'TEXT'}}},fields:'userEnteredFormat.numberFormat'}});
      await sheets.spreadsheets.batchUpdate({spreadsheetId:id,requestBody:{requests}},options);
      const values=[];const cell=(range,value)=>values.push({range:page+range,values:[[value]]});
      cell('B11',outbound?'Outbound Shipping Notice':'Advance Shipping Notice');cell('B12',job.fileName+' | '+data.direction);cell('B15',outbound?'วัน-เวลาที่คาดว่าจะส่งออก:':'วัน-เวลาที่คาดว่าจะมาถึง:');cell('B16',doc.expectedArrival.replace('T',' ')+' (Bangkok)');cell('F16',doc.poNumber);cell('I16',data.brand);
      const customer=['ชื่อบริษัท: '+doc.senderCompany,'ที่อยู่บริษัท: '+doc.senderAddress,(outbound?'ชื่อผู้รับ: ':'ชื่อผู้ส่ง: ')+doc.senderName,'เบอร์โทรศัพท์: '+doc.senderPhone];
      for(let i=0;i<4;i++){cell('B'+(20+i),outbound?warehouse[i]?.[0] || '':customer[i]);if(outbound)cell('G'+(20+i),customer[i]);}
      const rows=lines.map((l,i)=>[offset+i+1,l.sku,l.name,l.lot,l.expiryDate,[l.width,l.length,l.height].join(' × '),l.qtyCarton,l.qtyPiece,l.remark]);
      ['B','C','D','G','H','I','J','K','L'].forEach((c,i)=>values.push({range:page+`${c}26:${c}${25+lines.length}`,values:rows.map(r=>[r[i]])}));
      cell('J'+totalRow,lines.reduce((sum,l)=>sum+l.qtyCarton,0));cell('K'+totalRow,lines.reduce((sum,l)=>sum+l.qtyPiece,0));cell('B'+lastRow,'หมายเหตุ: '+doc.remark);
      await sheets.spreadsheets.values.batchUpdate({spreadsheetId:id,requestBody:{valueInputOption:'RAW',data:values}},options);
    }
    await sheets.spreadsheets.batchUpdate({spreadsheetId:id,requestBody:{requests:[{deleteSheet:{sheetId:placeholderId}},{addSheet:{properties:{title:'Submission_Data',hidden:true}}}]}},options);
    const raw=JSON.stringify({schema:'speedship-asn-v3',requestId:job.requestId,submittedDate:job.date,sequence:job.sequence,submission:data});
    await sheets.spreadsheets.values.update({spreadsheetId:id,range:"'Submission_Data'!A1",valueInputOption:'RAW',requestBody:{values:(raw.match(/[\s\S]{1,40000}/g)||['']).map(s=>[s])}},options);
  }
  async function exportPdf(id) {
    if(id===config.databaseId)throw Error('Refusing master export');
    for(let attempt=0;attempt<3;attempt++) {
      try {
        // Preserve the existing A4 portrait output and omit hidden data tabs.
        const r=await auth.request({url:`https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export`,params:{format:'pdf',size:'A4',portrait:true,fitw:true,sheetnames:false,printtitle:false,pagenum:'UNDEFINED',gridlines:false,fzr:false,top_margin:0.25,bottom_margin:0.25,left_margin:0.25,right_margin:0.25},responseType:'arraybuffer',timeout:45000});
        const pdf=Buffer.from(r.data);if(pdf.subarray(0,4).toString()==='%PDF')return pdf;
      } catch(err) { if(attempt===2)throw err; }
      await pause(1000*(attempt+1));
    }
    fail('PDF_PENDING','สร้าง PDF ยังไม่สำเร็จ กรุณาดำเนินการต่อจากรายการเดิม',503);
  }
  async function download(id,mime) {
    if(id===config.databaseId)throw Error('Refusing master export');
    const result=mime==='application/pdf'?await drive.files.get({fileId:id,alt:'media',supportsAllDrives:true},{...options,responseType:'arraybuffer'}):await drive.files.export({fileId:id,mimeType:mime},{...options,responseType:'arraybuffer'});
    return Buffer.from(result.data);
  }
  async function sendEmail(to,subject,body,pdf) {
    const boundary='asn-'+require('node:crypto').randomUUID();
    const raw=[`To: ${to.join(',')}`,`Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(body).toString('base64'),`--${boundary}`,'Content-Type: application/pdf','Content-Disposition: attachment; filename="ASN.pdf"','Content-Transfer-Encoding: base64','',pdf.toString('base64').match(/.{1,76}/g).join('\r\n'),`--${boundary}--`].join('\r\n');
    await gmail.users.messages.send({userId:'me',requestBody:{raw:Buffer.from(raw).toString('base64url')}},options);
  }
  return {masters,skus,preflight,archiveFolder,sequenceFloor,ensureFile,render,exportPdf,download,sendEmail};
}
module.exports={createWorkspace};
