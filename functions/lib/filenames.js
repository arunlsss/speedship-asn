'use strict';
function attachmentName(name,extension) {
  const stem=String(name || 'ASN').replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g,'_').trim().replace(/[. ]+$/g,'') || 'ASN';
  return `${stem.slice(0,180)}.${extension==='pdf'?'pdf':'xlsx'}`;
}
function disposition(name,extension) {
  const filename=attachmentName(name,extension),fallback=filename.replace(/[^\x20-\x7e]/g,'_');
  const encoded=encodeURIComponent(filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
module.exports={attachmentName,disposition};
