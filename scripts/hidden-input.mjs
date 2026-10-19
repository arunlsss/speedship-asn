// Masked Terminal input. Errors contain fixed codes only, never input values.
function inputError(code){return Object.assign(Error(code),{code});}
export function readHiddenInput(prompt,{input=process.stdin,output=process.stdout,maxLength=200}={}){
 if(!input.isTTY || typeof input.setRawMode!=='function')throw inputError('TERMINAL_REQUIRED');
 return new Promise((resolve,reject)=>{
  const wasRaw=Boolean(input.isRaw);let value='',finished=false;
  const finish=err=>{if(finished)return;finished=true;input.removeListener('data',onData);input.removeListener('end',onEnd);input.removeListener('error',onError);input.setRawMode(wasRaw);input.pause();output.write('\n');err?reject(err):resolve(value.trim());};
  const onEnd=()=>finish(inputError('INPUT_CLOSED')),onError=()=>finish(inputError('INPUT_CLOSED'));
  const onData=chunk=>{for(const c of chunk.toString('utf8').replace(/\x1b\[(?:200|201)~/g,'')){
   if(c==='\x03')return finish(inputError('INPUT_CANCELLED'));
   if(c==='\r'||c==='\n')return finish();
   if(c==='\x7f'||c==='\b'){value=value.slice(0,-1);continue;}
   if(c.charCodeAt(0)>=32)value+=c;
   if(value.length>maxLength)return finish(inputError('INPUT_TOO_LONG'));
  }};
  output.write(prompt+' (input hidden): ');input.setRawMode(true);input.on('data',onData);input.once('end',onEnd);input.once('error',onError);input.resume();
 });
}
export async function readChannelSecret({read=readHiddenInput,output=process.stdout}={}){
 for(let attempt=0;attempt<3;attempt++){
  let value;
  try{value=await read('Paste the Channel secret from Basic settings');}
  catch(err){if(err.code!=='INPUT_TOO_LONG')throw err;output.write('That input is too long. Copy the 32-character Channel secret, not the channel access token.\n');continue;}
  if(/^[a-f0-9]{32}$/i.test(value))return value;
  output.write(!value?'Nothing was entered. Paste the Channel secret, then press Enter. Hidden input does not show characters.\n':/^[UCR][a-f0-9]{32}$/.test(value)?'That is a LINE user/group/room ID. Copy the Channel secret from your OA channel\'s Basic settings instead.\n':'Expected the 32-character Channel secret from Basic settings. Copy only its value, without a label; do not use the channel ID or channel access token.\n');
 }
 throw inputError('CHANNEL_SECRET_FORMAT');
}
