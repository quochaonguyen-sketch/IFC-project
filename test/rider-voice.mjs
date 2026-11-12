import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile('public/rider/rider.js','utf8')).replace(/^import .*;$/gm,'');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
class Element{
 constructor(tag='div'){Object.assign(this,{tag,children:[],handlers:{},value:'',hidden:false,open:false});}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
 querySelectorAll(){return this.children.flatMap(n=>[...(['button','input'].includes(n.tag)?[n]:[]),...n.querySelectorAll()]);}
 setAttribute(){}addEventListener(name,fn){this.handlers[name]=fn;}focus(){}
 showModal(){this.open=true;}close(){this.open=false;this.handlers.close?.();}
}
const receipt={seq:14,ticket_no:'20261107-0014',order_count:1,status:'Phiếu đang xử lý',workflow_status:'HOLD'};
const saved=(announced=false)=>({step:4,name:'',keys:['AAA'],requestId:crypto.randomUUID(),token:crypto.randomUUID(),pending:false,day:'2026-11-07',receipt:{...receipt},readyAnnounced:announced});
async function boot({draft,blocked=false,status='HOLD',hidden=false,session=new Map(),hash='#qr',readyState='complete'}={}){
 const nodes=new Map(),listeners={},windowListeners={},players=[],plays=[],spoken=[],timers=new Map();let timer=0,audioAtLookup;
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 if(draft)session.set('ifc-pickup-qr',JSON.stringify(draft));
 const document={hidden,readyState,getElementById:get,createElement:tag=>new Element(tag),addEventListener:(name,fn)=>listeners[name]=fn};
 const context={document,location:{hash,href:'https://test/rider/'+hash},crypto,AbortController,browserHandoff:async()=>{},
  sessionStorage:{getItem:k=>session.get(k),setItem:(k,v)=>session.set(k,v)},
  setTimeout:(fn,ms)=>{timers.set(++timer,{fn,ms});return timer;},clearTimeout:id=>timers.delete(id),
  Audio:class{constructor(){players.push(this);}play(){plays.push(this.src);return blocked?Promise.reject(Object.assign(Error('blocked'),{name:'NotAllowedError'})):Promise.resolve();}pause(){}},
  window:{addEventListener:(name,fn)=>windowListeners[name]=fn,speechSynthesis:{cancel(){},getVoices:()=>[{name:'Vietnamese',lang:'vi-VN'}],addEventListener(){},speak:u=>spoken.push(u)}},SpeechSynthesisUtterance:class{},
  fetch:async(url,init)=>{const r=JSON.parse(init.body);if(r.action==='info')audioAtLookup=plays.at(-1);return {ok:true,json:async()=>r.action==='info'?{name:'Kho 1',station:'WH1',day:'2026-11-07'}:{...receipt,workflow_status:status}};},confirm:()=>true
 };
 await vm.runInNewContext('(async()=>{'+source+'\nglobalThis.ui={updateReceipt};})()',context);await flush();
 return {get,document,listeners,windowListeners,players,plays,spoken,timers,session,audioAtLookup,...context.ui,unblock:()=>blocked=false,status:value=>status=value,stored:()=>JSON.parse(session.get('ifc-pickup-qr'))};
}
const welcome=await boot({blocked:true});
assert.match(welcome.plays[0],/rider-welcome/,'First entry attempts the greeting');
assert.equal(welcome.audioAtLookup,undefined,'The greeting waits for the station to connect');
assert.equal(welcome.plays.length,1,'Connecting the station does not restart the greeting');
assert.match(welcome.get('hint').textContent,/Xin chào bác tài.*Bắt đầu đăng ký/);
assert.match(welcome.get('voice-note').textContent,/thao tác trên trang/);assert.equal(welcome.spoken.length,0);
welcome.unblock();welcome.get('view').children[0].onclick();await flush();
assert.equal(welcome.get('voice-note').textContent,'');
assert.match(welcome.plays.at(-1),/rider-codes/);assert.equal(welcome.players.length,1,'Later guidance reuses the unlocked audio element');
const directEntry=await boot({hash:''});
assert.match(directEntry.get('hint').textContent,/Xin chào bác tài.*chọn kho/);
assert.deepEqual(directEntry.plays,['/voice/rider-welcome.mp3?v=0.8.12'],'Direct entry also attempts the greeting without a tap');
for (const hash of ['#qr','']) {
 const loading=await boot({hash,readyState:'loading'});
 assert.equal(loading.plays.length,0,'A visible welcome does not play while the page is loading');
 assert.match(loading.get('hint').textContent,/Xin chào bác tài/);
 loading.document.readyState='complete';
 loading.windowListeners.load();
 await flush();
 assert.deepEqual(loading.plays,['/voice/rider-welcome.mp3?v=0.8.12']);
}
const advanced=await boot({readyState:'loading'});
advanced.get('view').children[0].onclick();
await flush();
advanced.windowListeners.load();
assert.equal(advanced.plays.length,1,'A late welcome must not interrupt the order-entry prompt');
assert.match(advanced.plays[0],/rider-codes/);
const picked=await boot({draft:saved(),status:'PICKED'});
assert.match(picked.plays[0],/rider-ready/);assert.match(picked.get('hint').textContent,/vào nhận hàng/);
assert.equal(picked.stored().readyAnnounced,false,'A notification is not acknowledged until speech finishes');
await picked.updateReceipt();assert.equal(picked.plays.length,1,'Polling cannot interrupt a readiness announcement');
assert.ok([...picked.timers.values()].some(t=>t.ms===5000),'Visible receipt polling checks every 5 seconds');
picked.players[0].onended();await picked.updateReceipt();assert.equal(picked.stored().readyAnnounced,true);assert.equal(picked.plays.length,1);
picked.get('repeat').onclick();await flush();assert.match(picked.plays.at(-1),/rider-ready/,'Repeat after status polling reads the pickup instruction, not the queue receipt');
const blockedReady=await boot({draft:{...saved(),receipt:{...receipt,workflow_status:'PICKED'}},status:'PICKED',blocked:true});
assert.match(blockedReady.get('voice-note').textContent,/thao tác trên trang/);assert.equal(blockedReady.stored().readyAnnounced,false);
await blockedReady.updateReceipt();assert.equal(blockedReady.plays.length,1);
blockedReady.unblock();blockedReady.listeners.keydown();await flush();assert.equal(blockedReady.plays.length,2);blockedReady.players[0].onended();assert.equal(blockedReady.stored().readyAnnounced,true);
const restored=await boot({draft:{...saved(),receipt:{...receipt,workflow_status:'PICKED'}},status:'PICKED'});assert.match(restored.plays[0],/rider-ready/,'An already PICKED restored receipt still gets its undelivered prompt');
const acknowledged=await boot({draft:saved(true),status:'PICKED'});assert.equal(acknowledged.plays.length,0,'Completed readiness prompts do not repeat on reload');
const background=await boot({draft:saved(),status:'PICKED',hidden:true});assert.equal(background.plays.length,0);
background.document.hidden=false;await background.listeners.visibilitychange();await flush();assert.match(background.plays[0],/rider-ready/);
const interrupted=background.players[0].onended;background.document.hidden=true;background.listeners.visibilitychange();
assert.equal(background.stored().readyAnnounced,false);background.document.hidden=false;await background.listeners.visibilitychange();await flush();
interrupted();assert.equal(background.stored().readyAnnounced,false,'A cancelled completion cannot acknowledge an interrupted clip');
background.players[0].onended();assert.equal(background.stored().readyAnnounced,true);assert.equal(background.players.length,1);
const support=await boot({draft:saved()});support.get('support').onclick();support.status('PICKED');await support.updateReceipt();assert.equal(support.plays.length,0,'Guidance does not overlap an open support call');
support.get('close-support').onclick();await flush();assert.match(support.plays[0],/rider-ready/,'Closing support resumes the deferred pickup instruction');
console.log('PASS · entry greeting, blocked autoplay recovery, one reusable player, PICKED/reload/background recovery, completion acknowledgement, correct repeat and support-call deferral');
