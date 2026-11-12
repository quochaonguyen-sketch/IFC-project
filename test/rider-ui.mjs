import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {browserContext,defaultBrowserIntent} from '../public/rider/browser-handoff.js';

const android='Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
assert.deepEqual(browserContext(android),{android:true,ios:false,inApp:false});
assert.equal(browserContext(android+' Zalo/25').inApp,true);
assert.equal(browserContext(android.replace('Pixel 8','Pixel 8; wv')).inApp,true);
assert.equal(browserContext('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Zalo').ios,true);
assert.equal(browserContext('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15',5).ios,true);
const qr='0f8c0eab-26d7-483d-9f30-2bf1af48e082';
const url='https://ifc.test/rider/#'+qr;
const intent=defaultBrowserIntent(url);
assert.ok(intent.startsWith('intent://ifc.test/rider/#'+qr+'#Intent;scheme=https;'));
assert.ok(intent.includes('action=android.intent.action.VIEW'));
assert.ok(!/;package=|;component=/.test(intent),'Honor the system resolver instead of a fixed browser');
assert.equal(new URL(decodeURIComponent(intent.match(/S.browser_fallback_url=([^;]+)/)[1])).hash,'#'+qr);
assert.equal((defaultBrowserIntent('https://ifc.test/rider/#foo#Intent;package=evil;end').match(/#Intent;/g)||[]).length,1);
assert.doesNotThrow(()=>defaultBrowserIntent('https://ifc.test/rider/#bad%'));
assert.throws(()=>defaultBrowserIntent('javascript:alert(1)'));
assert.throws(()=>defaultBrowserIntent('https://user:pass@ifc.test/rider/'));

class Element {
  constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.hidden=false;this.disabled=false;this.parent=null;this.attributes={};}
  append(...nodes){for(const node of nodes){node.remove?.();node.parent=this;this.children.push(node);}}
  remove(){if(this.parent){this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}}
  setAttribute(name,value){this.attributes[name]=value;}
  play(){return Promise.resolve();}
  requestVideoFrameCallback(fn){this.frameCallback=fn;return 1;}
  cancelVideoFrameCallback(){this.frameCallback=null;}
  present(){const fn=this.frameCallback;this.frameCallback=null;fn?.(0,{presentedFrames:1});}
  focus(){this.focused=true;}
  select(){this.selected=true;}
}
const all=node=>[node,...node.children.flatMap(all)];
const byText=(node,text)=>all(node).find(x=>x.textContent===text);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const sources={
  browser:(await readFile(new URL('../public/rider/browser-handoff.js',import.meta.url),'utf8')).replaceAll('export ',''),
  video:(await readFile(new URL('../public/support/guest-video.js',import.meta.url),'utf8')).replace('export function','function')
};
function browserUI(ua){
  const root=new Element('main');let copied='';
  const context=vm.createContext({URL,document:{createElement:tag=>new Element(tag)},navigator:{userAgent:ua,maxTouchPoints:0,clipboard:{writeText:async value=>{copied=value;}}}});
  vm.runInContext(sources.browser+'\nthis.handoff=browserHandoff;',context);
  return {root,ready:context.handoff(root,url),copied:()=>copied};
}
const inApp=browserUI(android+' Zalo');
let entered=false;inApp.ready.then(()=>entered=true);await flush();
assert.equal(entered,true,'Browser help must not block registration or an explicitly opened support call in Zalo');
assert.equal(inApp.root.children[0].tag,'details','External-browser help stays available without covering the form');
assert.ok(byText(inApp.root,'Mở bằng trình duyệt mặc định').href.startsWith('intent://'));
await byText(inApp.root,'Sao chép link').onclick();assert.equal(inApp.copied(),url);
assert.equal(byText(inApp.root,'Tiếp tục tại đây'),undefined);await inApp.ready;
const iphone=browserUI('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Zalo');
assert.equal(all(iphone.root).some(x=>x.tag==='a'),false,'Do not claim a web link can force the iOS default browser');
await iphone.ready;
const normal=browserUI(android);let left=false;const onLeave=await normal.ready;onLeave(()=>left=true);
byText(normal.root,'Mở bằng trình duyệt mặc định').onclick();assert.equal(left,true);
console.log('PASS · nonblocking Zalo/iOS browser help, default-browser choice, QR preservation and copy fallback');

class Track {
  constructor(kind){this.kind=kind;this.readyState='live';this.muted=false;this.stopped=false;}
  stop(){this.stopped=true;this.readyState='ended';}
}
class Stream {
  constructor(tracks){this.tracks=tracks;}
  getTracks(){return this.tracks;}
  getAudioTracks(){return this.tracks.filter(t=>t.kind==='audio');}
  getVideoTracks(){return this.tracks.filter(t=>t.kind==='video');}
}
function videoUI({agent=false,supported=true,withOffer=true,autoStart=false,denyMedia=false,mediaPermission}={}){
  const root=new Element('main'),peers=[],timers=new Map(),sent=[],feed=[],requests=[];
  const media=new Stream([new Track('audio'),new Track('video')]);
  let captureCount=0,mediaCount=0,seq=0,timerId=0,now=0,capture=async()=>new Stream([new Track('video')]);
  class Peer {
    constructor(){this.transceivers=[];this.connectionState='new';this.signalingState='stable';this.offers=[];peers.push(this);}
    addTransceiver(kind,{direction}){const t={direction,receiver:{track:new Track(kind)},sender:{track:null,async replaceTrack(track){this.track=track;}}};this.transceivers.push(t);return t;}
    getTransceivers(){return this.transceivers;}
    async setRemoteDescription(value){this.remoteDescription=value;this.signalingState=value.type==='offer'?'have-remote-offer':'stable';if(!this.transceivers.length)for(const kind of ['audio','video','video'])this.addTransceiver(kind,{direction:'sendrecv'});}
    async setLocalDescription(value){this.localDescription={...value,toJSON:()=>value};this.signalingState=value.type==='offer'?'have-local-offer':'stable';}
    async createOffer(options={}){this.offers.push(options);return {type:'offer',sdp:'offer'};}
    async createAnswer(){return {type:'answer',sdp:'answer'};}
    async addIceCandidate(){}
    close(){this.closed=true;this.connectionState='closed';}
    connect(){this.connectionState='connected';this.onconnectionstatechange();}
    fail(){this.connectionState='failed';this.onconnectionstatechange();}
  }
  let failNext=false;
  const transport=async data=>{
    requests.push(structuredClone(data));
    if(failNext){failNext=false;throw TypeError('offline');}
    sent.push(...(data.messages||[data]).filter(item=>item.message).map(item=>item.message));
    return {iceServers:[],items:feed.filter(x=>x.seq>data.since)};
  };
  if(!agent&&withOffer)feed.push({seq:++seq,message:{kind:'offer',value:{type:'offer',sdp:'offer'}}});
  const devices={getUserMedia:async()=>{mediaCount++;if(denyMedia)throw Object.assign(Error('camera denied'),{name:'NotAllowedError'});return mediaPermission?mediaPermission():media;}};
  if(supported)devices.getDisplayMedia=()=>{captureCount++;return capture();};
  const context=vm.createContext({document:{createElement:tag=>new Element(tag)},navigator:{mediaDevices:devices},crypto,RTCPeerConnection:Peer,MediaStream:Stream,window:{addEventListener(){},removeEventListener(){}},setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,at:now+delay});return timerId;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(sources.video+'\nthis.startGuest=guestVideo;',context);
  const stop=context.startGuest(root,transport,agent,{autoStart});
  async function tick(){await flush();const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(entry){timers.delete(entry[0]);now=entry[1].at;await entry[1].fn();}await flush();}
  return {root,peers,media,sent,requests,failNext:()=>failNext=true,nextDelay:()=>Math.min(...[...timers.values()].map(timer=>timer.at-now)),stop,start:byText(root,'Bật camera / micro và kết nối'),share:byText(root,'Chia sẻ màn hình'),stopShare:byText(root,'Dừng chia sẻ màn hình'),captureCount:()=>captureCount,mediaCount:()=>mediaCount,capture:fn=>capture=fn,feed:message=>feed.push({seq:++seq,message}),tick,now:()=>now};
}
const fast=videoUI({agent:true});await fast.tick();
for(let i=0;i<12;i++)fast.peers[0].onicecandidate({candidate:{toJSON:()=>({candidate:'candidate-'+i})}});
await fast.tick();
assert.equal(fast.requests.at(-1).messages.length,12,'A burst of ICE candidates uses one HTTP request');
assert.equal(fast.requests.at(-1).need_ice,false,'Existing peers do not fetch TURN credentials again');
assert.ok(fast.nextDelay()<=250,'Negotiation polls promptly while the peer is connecting');
fast.failNext();fast.peers[0].onicecandidate({candidate:{toJSON:()=>({candidate:'retry-candidate'})}});
await fast.tick();const failed=fast.requests.at(-1);await fast.tick();
assert.deepEqual(fast.requests.at(-1).messages,failed.messages,'A lost batch response retries the same message IDs');
fast.peers[0].connect();await fast.tick();assert.equal(fast.nextDelay(),1500,'Connected calls reduce polling traffic');fast.stop();
let grantCamera;
const permission=videoUI({agent:true,autoStart:true,mediaPermission:()=>new Promise(resolve=>grantCamera=resolve)});
await permission.tick();assert.ok(permission.sent.some(message=>message.kind==='offer'),'SDP is sent while camera permission is still pending');
permission.stop();const lateMedia=new Stream([new Track('audio'),new Track('video')]);grantCamera(lateMedia);await flush();
assert.ok(lateMedia.getTracks().every(track=>track.stopped));
console.log('PASS · batched ICE, idempotent network retry, fast negotiation, steady-state polling and independent permission prompts');
const rider=videoUI();assert.equal(rider.captureCount(),0);assert.equal(rider.mediaCount(),0);assert.equal(rider.share.disabled,false);
await flush();rider.feed({kind:'offer',revision:2,value:{type:'offer',sdp:'restart'}});await rider.tick();await rider.tick();await rider.tick();
assert.ok(rider.sent.some(m=>m.kind==='answer'&&m.revision===2),'Rider must answer a restarted ICE negotiation');
await rider.start.onclick();await flush();assert.equal(rider.mediaCount(),1);assert.equal(rider.captureCount(),0);
rider.peers[0].connect();assert.equal(rider.share.disabled,false);assert.equal(rider.captureCount(),0,'A connected call must never start screen capture');
rider.capture(async()=>{throw Object.assign(Error('denied'),{name:'NotAllowedError'});});
await rider.share.onclick();assert.equal(rider.captureCount(),1);assert.equal(rider.peers[0].closed,undefined);assert.ok(rider.media.getTracks().every(t=>!t.stopped));
const screenTrack=new Track('video');rider.capture(async()=>new Stream([screenTrack]));
await rider.share.onclick();assert.equal(rider.captureCount(),2);assert.equal(rider.stopShare.hidden,false);assert.equal(rider.share.disabled,true);
for(let i=0;i<3;i++)await rider.tick();assert.ok(rider.sent.some(m=>m.kind==='screen'&&m.value===true));
rider.stopShare.onclick();await flush();assert.ok(screenTrack.stopped);assert.ok(rider.media.getTracks().every(t=>!t.stopped));assert.equal(rider.peers[0].transceivers[2].sender.track,null);assert.equal(rider.share.disabled,false);
for(let i=0;i<3;i++)await rider.tick();assert.ok(rider.sent.some(m=>m.kind==='screen'&&m.value===false));
const resumed=new Track('video');rider.capture(async()=>new Stream([resumed]));await rider.share.onclick();assert.equal(rider.captureCount(),3,'Sharing again needs a fresh permission request');
resumed.onended();assert.equal(rider.stopShare.hidden,true);assert.ok(rider.media.getTracks().every(t=>!t.stopped));
let grant;const lateTrack=new Track('video');rider.capture(()=>new Promise(resolve=>grant=resolve));const pending=rider.share.onclick();rider.stop();grant(new Stream([lateTrack]));await pending;assert.ok(lateTrack.stopped);assert.ok(rider.media.getTracks().every(t=>t.stopped));assert.ok(rider.peers[0].closed);
const unsupported=videoUI({supported:false});await unsupported.start.onclick();await flush();unsupported.peers[0].connect();assert.equal(unsupported.share.disabled,true);assert.equal(unsupported.captureCount(),0);unsupported.stop();
const desk=videoUI({agent:true});await desk.start.onclick();await flush();desk.feed({kind:'answer',revision:1,value:{type:'answer',sdp:'answer'}});await desk.tick();desk.peers[0].connect();assert.equal(desk.share.hidden,true);await desk.share.onclick();assert.equal(desk.captureCount(),0);
desk.peers[0].fail();
const recoveryDeadline=desk.now()+2500;
while(desk.now()<recoveryDeadline&&!desk.sent.some(m=>m.kind==='offer'&&m.revision===2))await desk.tick();
assert.ok(desk.peers[0].offers.some(x=>x.iceRestart===true),'Agent should negotiate fresh ICE after failure');
assert.ok(desk.sent.some(m=>m.kind==='offer'&&m.revision===2));
desk.feed({kind:'answer',revision:2,value:{type:'answer',sdp:'answer'}});await desk.tick();
desk.peers[0].connect();assert.equal(desk.peers[0].closed,undefined);
const screenTransceiver=desk.peers[0].transceivers[2];desk.peers[0].ontrack({track:screenTransceiver.receiver.track,transceiver:screenTransceiver});
const viewer=all(desk.root).filter(x=>x.tag==='video').at(-1);assert.equal(viewer.hidden,true);
const sharedId=crypto.randomUUID();
desk.feed({kind:'screen',value:true,share_id:sharedId});await desk.tick();assert.equal(viewer.hidden,false);
assert.ok(!desk.sent.some(m=>m.kind==='screen-seen'),'Permission alone is not successful delivery');
viewer.present();await desk.tick();
assert.ok(desk.sent.some(m=>m.kind==='screen-seen'&&m.value===sharedId));
desk.feed({kind:'screen',value:false});await desk.tick();assert.equal(viewer.hidden,true);assert.equal(desk.peers[0].closed,undefined);desk.stop();
const early=videoUI({withOffer:false,autoStart:true,denyMedia:true});
await flush();assert.equal(early.mediaCount(),1);assert.equal(early.captureCount(),0);
early.feed({kind:'screen-request',value:true});await early.tick();assert.equal(early.captureCount(),0,'The receptionist cannot open the OS permission picker on the rider’s behalf');
const selected=new Track('video');early.capture(async()=>new Stream([selected]));await early.share.onclick();
assert.equal(early.captureCount(),1);assert.equal(early.stopShare.hidden,false);assert.ok(!early.sent.some(m=>m.kind==='screen'&&m.value));
early.feed({kind:'offer',value:{type:'offer',sdp:'offer'}});await early.tick();
assert.equal(early.peers[0].transceivers[2].sender.track,selected,'Consent granted before SDP / without camera is used on the screen channel');
early.peers[0].connect();await early.tick();await early.tick();
const transmitted=early.sent.find(m=>m.kind==='screen'&&m.value);
assert.ok(transmitted.share_id);early.feed({kind:'screen-seen',value:crypto.randomUUID()});await early.tick();
assert.ok(!byText(early.root,'Lễ tân đã nhận hình ảnh từ màn hình của bạn.'));
early.feed({kind:'screen-seen',value:transmitted.share_id});await early.tick();
assert.ok(byText(early.root,'Lễ tân đã nhận hình ảnh từ màn hình của bạn.'));
early.stop();
const pendingScreen=videoUI({withOffer:false});await flush();
const unused=new Track('video');pendingScreen.capture(async()=>new Stream([unused]));await pendingScreen.share.onclick();
while(pendingScreen.now()<46000)await pendingScreen.tick();
assert.ok(unused.stopped,'End capture when no screen receiver can be reached');pendingScreen.stop();
console.log('PASS · explicit screen permission before media connection, camera denial, request without auto-capture, actual-frame receipt, stop/regrant, late consent and timeout');

// Exercise the actual QR page entry point after both a lost start response and a failed status poll.
const page = (await readFile(new URL('../public/rider/call.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
const actions=[],mounts=[],relayed=[],session=new Map(),pageTimers=new Map(),elements=new Map();
let nextTimer=0,closed=0;
const responses=['offline','accepted','offline','accepted','resolved'];
const pageContext={
  browserHandoff:async()=>()=>{},guestVideo(_node,_transport,_agent,options){mounts.push(options);return ()=>closed++;},
  location:{href:url,hash:'#'+qr,origin:'https://ifc.test'},crypto,
  window:{parent:{postMessage:(data,origin)=>relayed.push({data,origin})}},
  sessionStorage:{getItem:k=>session.get(k),setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)},
  document:{querySelector(selector){if(!elements.has(selector))elements.set(selector,new Element('section'));return elements.get(selector);}},
  fetch:async(_url,init)=>{
    actions.push(JSON.parse(init.body));const status=responses.shift();if(status==='offline')throw TypeError('Failed to fetch');
    return {ok:true,status:200,json:async()=>({status,station:'WH1',queue:{number:7,ahead:0},...(status==='resolved'?{receipt:{seq:31,ticket_no:'20261104-0031'}}:{})})};
  },
  setTimeout(fn){pageTimers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>pageTimers.delete(id)
};
await vm.runInNewContext('(async()=>{'+page+'})()',pageContext);await flush();
while(responses.length){
  const entry=pageTimers.entries().next().value;assert.ok(entry,'The rider page must retry transient failures');
  pageTimers.delete(entry[0]);await entry[1]();await flush();
}
assert.deepEqual(actions.map(x=>x.action),['start','start','status','status','status']);
assert.equal(new Set(actions.map(x=>x.token)).size,1);
assert.equal(mounts.length,1);assert.equal(mounts[0].autoStart,true);
assert.equal(closed,1);assert.equal(session.size,0);
assert.equal(elements.get('#assisted-receipt').hidden,false);
assert.equal(elements.get('#assisted-receipt-number').textContent,'031');
assert.equal(relayed.length,1);
assert.equal(relayed[0].data.token,actions[0].token);
assert.equal(relayed[0].origin,'https://ifc.test');
console.log('PASS · lost QR start/status responses recover on the same private call and acceptance mounts media once');
