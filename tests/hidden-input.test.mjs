import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readHiddenInput,readChannelSecret} from '../scripts/hidden-input.mjs';
class Terminal extends EventEmitter {isTTY=true;isRaw=false;setRawMode(value){this.isRaw=value;}pause(){}resume(){}}
function fixture(){const input=new Terminal(),writes=[],output={write:v=>writes.push(v)};return {input,output,writes};}
test('masked paste returns a secret without echo and restores the Terminal',async()=>{
 const h=fixture(),secret='a'.repeat(32),result=readHiddenInput('Secret',h);h.input.emit('data',Buffer.from('\x1b[200~'+secret+'\x1b[201~\r'));assert.equal(await result,secret);assert.equal(h.writes.join('').includes(secret),false);assert.equal(h.input.isRaw,false);assert.equal(h.input.listenerCount('data'),0);
});
test('cancelled, closed and oversized input restore Terminal without leaking input',async()=>{
 for(const [data,code] of [['secret\x03','INPUT_CANCELLED'],['x'.repeat(201),'INPUT_TOO_LONG']]){const h=fixture(),result=readHiddenInput('Secret',h);h.input.emit('data',Buffer.from(data));await assert.rejects(result,{code});assert.equal(h.input.isRaw,false);assert.equal(h.writes.join('').includes(data),false);assert.equal(h.input.listenerCount('end'),0);}
 const h=fixture(),result=readHiddenInput('Secret',h);h.input.emit('end');await assert.rejects(result,{code:'INPUT_CLOSED'});assert.equal(h.input.isRaw,false);
});
test('wrong and empty values can be corrected without restarting or printing them',async()=>{
 const wrong='U'+'b'.repeat(32),secret='c'.repeat(32),values=['',wrong,secret],writes=[];assert.equal(await readChannelSecret({read:async()=>values.shift(),output:{write:v=>writes.push(v)}}),secret);assert.match(writes.join(''),/Nothing was entered/);assert.match(writes.join(''),/user\/group\/room ID/);assert.equal(writes.join('').includes(wrong),false);assert.equal(writes.join('').includes(secret),false);
});
test('three invalid inputs explain the required field and never return a wrong credential',async()=>{
 const writes=[];await assert.rejects(readChannelSecret({read:async()=> 'invalid-value',output:{write:v=>writes.push(v)}}),{code:'CHANNEL_SECRET_FORMAT'});assert.equal(writes.length,3);assert.equal(writes.join('').includes('invalid-value'),false);
});
test('an oversized access token can be replaced by the proper channel secret',async()=>{
 let first=true;const secret='d'.repeat(32),writes=[];assert.equal(await readChannelSecret({read:async()=>{if(first){first=false;throw Object.assign(Error('INPUT_TOO_LONG'),{code:'INPUT_TOO_LONG'});}return secret;},output:{write:v=>writes.push(v)}}),secret);assert.match(writes.join(''),/not the channel access token/);
});
