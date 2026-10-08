export function downloadFilename(header,type) {
  let name;
  const unicode=/filename\*=UTF-8''([^;]+)/i.exec(header || '');
  if(unicode){try{name=decodeURIComponent(unicode[1].trim());}catch(_){}}
  if(!name){const plain=/filename\s*=\s*(?:"([^"]*)"|([^;]*))/i.exec(header || '');name=plain?.[1] || plain?.[2]?.trim();}
  return name?.replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g,'_').trim() || `ASN.${type==='pdf'?'pdf':'xlsx'}`;
}
