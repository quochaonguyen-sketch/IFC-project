import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile('public/rider/rider.js','utf8')).replace(/^import .*;$/gm,'');
const handoff=(await readFile('public/rider/browser-handoff.js','utf8')).replaceAll('export ','');
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.value='';this.disabled=false;this.handlers={};}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(){} addEventListener(name,fn){this.handlers[name]=fn;}
 querySelectorAll(){return this.children.flatMap(n=>[n,...n.querySelectorAll()]).filter(n=>['input','button'].includes(n.tag));}
 focus(){} showModal(){this.open=true;} close(){this.open=false;this.handlers.close?.();}
}
const nodes=new Map(),session=new Map(),timers=new Map(),requests=[],players=[],spoken=[];let seq=0,timeout=0,submitCount=0,failAudio=false,rejectRegistration=false;
const windowEvents={};
let assisted=null;
const get=id=>{
 if(id==='finish-rider')return get('view').querySelectorAll().find(n=>n.id===id);
 if(!nodes.has(id)){nodes.set(id,new Element());if(id==='confirm-dialog')nodes.get(id).append(get('confirm-back'),get('confirm-submit'));}
 const node=nodes.get(id);if(['confirm-back','confirm-submit'].includes(id))node.tag='button';return node;
};
const findInput=()=>[...get('view').querySelectorAll()].find(n=>n.tag==='input');
const click=async(text,scope='view')=>{const b=get(scope).querySelectorAll().find(n=>n.textContent===text);assert.ok(b,'Missing '+text);b.onclick();await flush();};
const flush=()=>new Promise(r=>setImmediate(r));
const context={
 document:{readyState:'complete',getElementById:id=>id==='rider-input'?findInput():get(id),createElement:tag=>new Element(tag),addEventListener(){}},
 location:{hash:'#station-qr',href:'https://test/rider/#station-qr',origin:'https://test'},URL,navigator:{userAgent:'Mozilla/5.0 (Linux; Android 15) Chrome/130.0 Zalo/25',maxTouchPoints:1},crypto,AbortController,
 Audio:class{constructor(url){this.src=url;players.push(this);}get url(){return this.src;}play(){this.paused=false;return failAudio?Promise.reject(Error('audio unavailable')):Promise.resolve();}pause(){this.paused=true;}},
 SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},
 sessionStorage:{getItem:k=>session.get(k),setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)},
 window:{addEventListener:(type,handler)=>windowEvents[type]=handler,speechSynthesis:{cancel(){},getVoices:()=>[{name:'Vietnamese voice',lang:'vi-VN'}],speak:utterance=>spoken.push(utterance),addEventListener(){}}},browserHandoff:async()=>{},confirm:()=>true,
 setTimeout:fn=>{timers.set(++timeout,fn);return timeout;},clearTimeout:id=>timers.delete(id),
 fetch:async(_url,init)=>{const req=JSON.parse(init.body);requests.push(req);let data={ok:true};
  if(req.action==='info')Object.assign(data,{station:'WH1',name:'Kho 1',day:'2026-11-04'});
  if(req.action==='check')data.results=req.keys.map(key=>({key,state:key==='ZZZ'?'ambiguous':'ready',message:'Nhập thêm ký tự'}));
  if(req.action==='receipt')data.receipt=assisted;
  if(req.action==='register'){submitCount++;if(submitCount===1)throw TypeError('lost response');if(rejectRegistration)return {ok:false,status:409,json:async()=>({message:'Đơn đã được nhận',results:[{key:req.keys[0],state:'busy',message:'Đơn đã được nhận'}]})};Object.assign(data,{seq:++seq,ticket_no:'20261104-0001',order_count:req.keys.length,status:'Phiếu đang xử lý',workflow_status:'HOLD'});}
  return {ok:true,json:async()=>data};
 }
};
await vm.runInNewContext('(async()=>{'+handoff+'\n'+source+'})()',context);await flush();
assert.equal(get('browser-help').children[0].tag,'details','Zalo browser guidance is available beside a usable form');
await click('Bắt đầu đăng ký');assert.equal(get('title').textContent,'Nhập 3 mã cuối đơn hàng');assert.equal(get('step').textContent,'BƯỚC 1 / 2');let i=findInput();
assert.equal(get('hint').hidden,true);assert.equal(get('hint').textContent,'');
assert.ok(!get('view').children.some(n=>n.className==='input-help'),'Initial entry shows no extra instructions');
assert.equal(players.at(-1).url,'/voice/rider-codes.mp3?v=0.7.7');assert.equal(players.at(-1).volume,.8);assert.equal(spoken.length,0,'Bundled natural speech is preferred over device synthesis');
const oldError=players.at(-1).onerror;get('repeat').onclick();await flush();oldError();assert.equal(spoken.length,0,'A cancelled clip cannot start fallback speech');
failAudio=true;get('repeat').onclick();await flush();assert.equal(spoken.length,1);assert.ok(spoken[0].text.includes('ba ký tự'));assert.equal(spoken[0].pitch,1);failAudio=false;
assert.ok(!get('view').querySelectorAll().some(n=>n.textContent==='← Sửa tên'));
const row=get('view').children.find(n=>n.className==='rider-entry-row');assert.equal(row.children[0].tag,'input');assert.equal(row.children[1].textContent,'+ Thêm đơn');
assert.equal(get('finish-rider').disabled,true);
i=findInput();i.value='12';await click('+ Thêm đơn');assert.ok(get('message').textContent.includes('ít nhất 3'));
i=findInput();i.value='ZZZ';await click('+ Thêm đơn');assert.ok(get('message').textContent.includes('Nhập thêm'));
i=findInput();i.value='a2z';await click('+ Thêm đơn');
assert.equal(requests.at(-1).keys[0],'A2Z');
findInput().value='B7C';await click('Kết thúc');assert.equal(get('confirm-dialog').open,undefined,'An unadded code must not be silently omitted');
findInput().value='';await click('Kết thúc');assert.equal(get('confirm-dialog').open,true);
assert.equal(get('confirm-orders').children[0].textContent,'A2Z');assert.equal(submitCount,0,'Finish only opens confirmation');
get('confirm-back').onclick();assert.equal(get('confirm-dialog').open,false);assert.equal(findInput().value,'');
await click('Kết thúc');
const firstSubmit=get('confirm-submit').onclick();get('confirm-submit').onclick();await firstSubmit;await flush();
assert.equal(submitCount,1,'Rapid confirmation clicks send one request');assert.equal(get('confirm-dialog').open,true);
assert.ok(get('confirm-message').textContent.includes('Mạng đang chậm'));
assert.equal(get('confirm-back').hidden,true,'An uncertain submission cannot change the payload');
const cancel={preventDefault(){}};get('confirm-dialog').handlers.cancel(cancel);assert.equal(get('confirm-dialog').open,true);
await click('Thử lại · Kiểm tra số đã gửi','confirm-dialog');const regs=requests.filter(r=>r.action==='register');assert.equal(regs[0].request_id,regs[1].request_id);assert.equal(regs[0].token,regs[1].token);
assert.ok(regs.every(r=>!Object.hasOwn(r,'driver_name')),'New registrations need no driver name');
assert.equal(get('title').textContent,'Số thứ tự của bạn');
assert.equal(get('confirm-dialog').open,false);
assert.equal(players.at(-1).url,'/voice/rider-receipt.mp3?v=0.7.7');players.at(-1).onended();
assert.equal(players.at(-1).url,'/voice/rider-n1.mp3?v=0.7.7');players.at(-1).onended();
assert.equal(players.at(-1).url,'/voice/rider-wait.mp3?v=0.7.7');
get('support').onclick();assert.ok(players.at(-1).paused,'Opening support stops guidance before the call');assert.ok(get('support-frame').src.startsWith('/rider/call.html#'));
get('close-support').onclick();assert.equal(get('support-dialog').open,false);
nodes.clear();timers.clear();
session.set('ifc-pickup-station-qr',JSON.stringify({step:2,keys:['CCC'],requestId:crypto.randomUUID(),token:crypto.randomUUID(),pending:false,receipt:null,entry:'',day:'2026-11-04'}));
await vm.runInNewContext('(async()=>{'+source+'})()',context);await flush();rejectRegistration=true;
await click('Kết thúc');await click('Xác nhận','confirm-dialog');
assert.equal(get('confirm-dialog').open,true);assert.ok(get('confirm-message').textContent.includes('Đơn đã được nhận'));
assert.equal(get('confirm-back').hidden,false);get('confirm-back').onclick();assert.equal(get('confirm-dialog').open,false);rejectRegistration=false;
// Existing drafts at the removed name step go straight to order entry.
nodes.clear();timers.clear();
const old={step:1,name:'Tên đã lưu',keys:[],requestId:crypto.randomUUID(),token:crypto.randomUUID(),pending:false,receipt:null,entry:'B7C',day:'2026-11-04'};
session.set('ifc-pickup-station-qr',JSON.stringify(old));
await vm.runInNewContext('(async()=>{'+source+'})()',context);await flush();
assert.equal(get('title').textContent,'Nhập 3 mã cuối đơn hàng');assert.equal(findInput().value,'B7C');
// A previously submitted named draft must keep its name and identity when retried.
nodes.clear();timers.clear();
session.set('ifc-pickup-station-qr',JSON.stringify({...old,step:3,keys:['B7C'],pending:true}));
await vm.runInNewContext('(async()=>{'+source+'})()',context);await flush();
assert.equal(get('confirm-dialog').open,true);
await click('Thử lại · Kiểm tra số đã gửi','confirm-dialog');
assert.equal(requests.at(-1).driver_name,old.name);assert.equal(requests.at(-1).request_id,old.requestId);assert.equal(requests.at(-1).token,old.token);
console.log('PASS · inline add, finish/review/confirm, direct receipt, duplicate submit, server rejection, retry identity and saved drafts');

// Only the active call iframe may hand a receipt to the pickup screen.
get('support').onclick();
const token=session.get('ifc-call-station-qr');
const frame=get('support-frame');
frame.contentWindow={};
const previousNumber=get('view').children.find(node=>node.className==='number').textContent;
assisted={seq:42,ticket_no:'20261104-0042',order_count:2,workflow_status:'HOLD',status:'Phiếu đang xử lý'};
const receiptMessage={origin:'https://test',source:frame.contentWindow,data:{type:'ifc-assisted-receipt',token,receipt:assisted}};
windowEvents.message({...receiptMessage,origin:'https://other.test'});
windowEvents.message({...receiptMessage,source:{}});
windowEvents.message({...receiptMessage,data:{...receiptMessage.data,token:crypto.randomUUID()}});
assert.equal(get('view').children.find(node=>node.className==='number').textContent,previousNumber);
windowEvents.message(receiptMessage);
assert.equal(get('close-support').textContent,'Xem số lấy hàng');
assert.equal(get('view').children.find(node=>node.className==='number').textContent,'042');
assert.equal(JSON.parse(session.get('ifc-pickup-station-qr')).receiptSupportToken,token);
get('close-support').onclick();
assisted={...assisted,workflow_status:'PICKED',status:'Vui lòng vào lấy hàng'};
await click('Cập nhật trạng thái');
assert.equal(requests.at(-1).action,'receipt');
assert.equal(requests.at(-1).token,token);
assert.equal(JSON.parse(session.get('ifc-pickup-station-qr')).receipt.workflow_status,'PICKED');
nodes.clear();timers.clear();
await vm.runInNewContext('(async()=>{'+source+'})()',context);await flush();
assert.equal(get('view').children.find(node=>node.className==='number').textContent,'042');
console.log('PASS · assisted number delivery from the correct call, pickup status and reload');
