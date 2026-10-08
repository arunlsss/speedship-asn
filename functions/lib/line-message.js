'use strict';
function asnMessage(job) {
  if(!/^[a-f0-9]{64}$/.test(job.id))throw Error('Invalid ASN message ID');
  const link=decision=>{
    const url=new URL('https://asn.speedshipsolution.com/management');
    url.searchParams.set('asn',job.id);if(decision)url.searchParams.set('review',decision);
    url.searchParams.set('openExternalBrowser','1');return url.toString();
  };
  const text=value=>String(value || '—').slice(0,300);
  const row=(label,value)=>({type:'box',layout:'horizontal',spacing:'md',contents:[{type:'text',text:label,size:'sm',color:'#718096',flex:2},{type:'text',text:text(value),size:'sm',color:'#243342',flex:5,wrap:true}]});
  const button=(label,decision,style,color)=>({type:'button',style,...(color?{color}:{}),height:'sm',action:{type:'uri',label,uri:link(decision)}});
  return {type:'flex',altText:text('ASN ใหม่: '+job.fileName+' · '+job.direction),contents:{type:'bubble',size:'mega',
    header:{type:'box',layout:'vertical',backgroundColor:'#28651B',paddingAll:'lg',contents:[{type:'text',text:'SPEEDSHIP SOLUTION',color:'#FFFFFF',size:'xs',weight:'bold'},{type:'text',text:'แจ้งรายการ ASN ใหม่',color:'#FFFFFF',size:'lg',weight:'bold',margin:'sm'}]},
    body:{type:'box',layout:'vertical',spacing:'md',paddingAll:'lg',contents:[{type:'text',text:text(job.fileName),size:'lg',weight:'bold',color:'#28651B',wrap:true},row('ประเภท',job.direction),row('Brand',job.brand),row('PO',job.poNumber),row('รายการ',String(job.itemCount)+' SKU'),{type:'text',text:'ตรวจสอบและบันทึกผลด้วยบัญชีผู้ดูแล ASN',size:'xs',color:'#718096',wrap:true}]},
    footer:{type:'box',layout:'vertical',spacing:'sm',paddingAll:'lg',contents:[button('ตรวจสอบรายละเอียด',null,'secondary'),button('ยืนยัน ASN','confirmed','primary','#28651B'),button('ปฏิเสธ ASN','rejected','primary','#B42318'),{type:'text',text:'การปฏิเสธต้องระบุเหตุผล',size:'xs',color:'#718096',wrap:true,align:'center',margin:'sm'}]}
  }};
}
module.exports={asnMessage};
