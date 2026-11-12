import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('../public/support/support.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.style={};}
  append(...nodes){for(const node of nodes){node.remove();node.parent=this;this.children.push(node);}}
  prepend(...nodes){for(const node of [...nodes].reverse()){node.remove();node.parent=this;this.children.unshift(node);}}
  remove(){if(this.parent){this.parent.children=this.parent.children.filter(node=>node!==this);this.parent=null;}}
  replaceChildren(...nodes){for(const node of [...this.children])node.remove();this.append(...nodes);}
  querySelectorAll(selector){
    const attr=selector.match(/^\[data-([\w-]+)(?:="([^"]+)")?\]$/);
    const key=attr?.[1].replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
    return this.children.flatMap(node=>[
      ...(attr?(key in node.dataset&&(attr[2]===undefined||node.dataset[key]===attr[2])):
        selector[0]==='.'?node.className?.split(' ').includes(selector.slice(1)):node.tagName===selector)?[node]:[],
      ...node.querySelectorAll(selector)
    ]);
  }
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  get childNodes(){return this.children;}
  get childElementCount(){return this.children.length;}
  pause(){}
}
function supportUI(apiCall,realForms=false,mediaFailure=false){
  const list=new Element(),panel=new Element(),content=new Element(),forms=new Element(),held=new Element(),heldSection=new Element(),team=new Element(),teamSection=new Element(),messages=[],opened=[],rings=[],stops=[];
  list.dataset.inbox='1';content.dataset.activeCallContent='1';forms.dataset.assistForms='1';held.dataset.heldList='1';heldSection.dataset.heldSection='1';team.dataset.teamList='1';teamSection.dataset.teamSection='1';panel.append(list,content,forms,held,heldSection,team,teamSection);
  const context=vm.createContext({
    document:{createElement:tag=>new Element(tag),head:new Element()},window:{addEventListener(){}},WebSocket:{OPEN:1},
    guestVideo:container=>{container.append(new Element('video'));return ()=>{};},
    apiCall,testPanel:panel,mediaFailure,
    messages,opened,rings,stops
  });
  vm.runInContext(source.slice(0,source.indexOf('me=await gate();'))+`
    me={email:'desk@test.vn',supportStations:['WH1','WH2']};panel=testPanel;onDuty=true;
    call=apiCall;loadDuty=async()=>{};report=message=>messages.push(message);
    startIncomingCallRingtone=item=>{if(!onDuty||currentCall||acceptingCall||isRinging)return;isRinging=true;ringingCallId=item.call_id;knownCallIds.add(item.call_id);rings.push(item.call_id);};stopIncomingCallRingtone=()=>{if(ringingCallId)stops.push(ringingCallId);ringingCallId=null;isRinging=false;};
    ${realForms?'':"assistedForm=()=>{};assistedFormAuto=item=>opened.push(item.call_id);"}
    ensureMedia=async()=>{if(mediaFailure)throw Error('Camera denied');};createPeer=async()=>({createOffer:async()=>({}),setLocalDescription:async()=>{},localDescription:{toJSON:()=>({})}});
    this.ui={refreshInbox,handleSupportEvent,allowMedia:()=>mediaFailure=false,ringing:()=>ringingCallId,mobileAgent,acceptCall,assistedFormAuto,holdCurrentCall,endCall,current:()=>currentCall};
  `,context);
  return {...context.ui,list,panel,held,team,teamSection,messages,opened,rings,stops};
}
const item={call_id:'call-1',station:'WH1',status:'waiting',issue:'Yêu cầu QR gọi từ điện thoại'};
let finishAccept,accepts=0;
const accepted=new Promise(resolve=>finishAccept=resolve);
const ui=supportUI(async(path)=>{
  if(path==='/api/support/accept'){accepts++;await accepted;return {};}
  return {items:[]};
});
const row=new Element();ui.mobileAgent(item,row);
const first=row.children[0].onclick();
await row.children[0].onclick();
assert.equal(accepts,1,'Double click must send only one acceptance request');
assert.equal(ui.current(),item.call_id);assert.equal(row.children[0].disabled,true);
finishAccept();await first;
assert.deepEqual(ui.opened,[item.call_id]);

let fail=false,releaseInbox,requests=0;
const waiting=new Promise(resolve=>releaseInbox=resolve);
const inbox=supportUI(async()=>{requests++;await waiting;if(fail)throw Error('offline');return {items:[item]};});
const refresh1=inbox.refreshInbox(),refresh2=inbox.refreshInbox();
await Promise.resolve();assert.equal(requests,2,'Overlapping refreshes load each station once');
assert.equal(inbox.list.children.length,0);
releaseInbox();await Promise.all([refresh1,refresh2]);
assert.equal(inbox.list.children.length,2);
assert.deepEqual(inbox.rings,[item.call_id],'A call rings once even when repeated in a response');
const previous=[...inbox.list.children];fail=true;await inbox.refreshInbox();
assert.deepEqual(inbox.list.children,previous,'A failed station request preserves the complete visible inbox');
assert.ok(inbox.messages.at(-1).includes('offline'));

const rejected=supportUI(async path=>{
  if(path==='/api/support/accept')throw Error('Lượt đã hết hạn');
  return {items:[]};
});
const rejectedRow=new Element();rejected.mobileAgent(item,rejectedRow);await rejectedRow.children[0].onclick();
assert.equal(rejected.current(),null);assert.equal(rejectedRow.children[0].disabled,false);
assert.equal(rejected.messages.at(-1),'Lượt đã hết hạn');

// Accepted calls now live in the workspace and no longer have an inbox form button.
const formUI=supportUI(async()=>({items:[]}),true);
const formRow=new Element();formUI.mobileAgent(item,formRow);await formRow.children[0].onclick();
const form=formUI.panel.querySelector('[data-assist]');
assert.ok(form,'Accepting a mobile call must directly show the order form without an inbox button');
assert.equal(form.parent.dataset.assistForms,'1','Order entry lives outside the video workspace');
form.querySelector('input').value='59X3-12345';form.querySelector('textarea').value='SPXVN0412345678';
formUI.assistedFormAuto(item);await formUI.refreshInbox();
assert.equal(formUI.panel.querySelector('[data-assist]'),form,'Reopening and polling must preserve the form and draft');
assert.equal(form.querySelector('textarea').value,'SPXVN0412345678');
await formUI.holdCurrentCall();assert.equal(form.hidden,true,'Held drafts are hidden in the sidebar');
const otherRow=new Element();formUI.mobileAgent({...item,call_id:'call-2'},otherRow);await otherRow.children[0].onclick();
await formUI.endCall();
assert.equal(formUI.panel.querySelector('[data-assist="call-1"]'),form,'Ending the active call preserves the held draft');
assert.equal(form.querySelector('textarea').value,'SPXVN0412345678');
assert.equal(formUI.panel.querySelector('[data-assist="call-2"]'),null,'Only the ended call form is removed');

const restored=supportUI(async()=>({items:[{...item,status:'accepted',accepted_by:'desk@test.vn'}]}),true);
await restored.refreshInbox();
assert.ok(restored.panel.querySelector('[data-assist]'),'Restoring an accepted call after reload shows its form');
assert.equal(restored.panel.querySelectorAll('[data-assist]').length,1);

const kiosk=supportUI(async()=>({items:[]}),true);
await kiosk.acceptCall({...item,issue:'Cần hỗ trợ tại kiosk',kiosk_email:'kiosk@test.vn'});
assert.ok(kiosk.panel.querySelector('[data-assist]'),'Accepting a kiosk call also shows its order form');
assert.equal(kiosk.current(),item.call_id);
const earlyBanner=supportUI(async path=>path==='/api/support/accept'?{video_mode:'ifc_guest',station:'WH1'}:{items:[]},true);
await earlyBanner.acceptCall({...item,issue:'Rider đang gọi từ QR'});
assert.ok(earlyBanner.panel.querySelector('[data-guest-video]'),'An early banner with old issue text must use the server-confirmed QR media path');
assert.equal(earlyBanner.panel.querySelector('[data-staff-kiosk-media]'),null,'QR calls must not remain on kiosk-only WebSocket signaling');
const releaseRefresh=[];
const slow=supportUI(async path=>path==='/api/support/accept'?{}:await new Promise(resolve=>releaseRefresh.push(()=>resolve({items:[]}))),true);
const slowRow=new Element();slow.mobileAgent(item,slowRow);const accepting=slowRow.children[0].onclick();
await new Promise(resolve=>setImmediate(resolve));
assert.ok(slow.panel.querySelector('[data-guest-video]'),'Video starts before the inbox request completes');
assert.ok(slow.panel.querySelector('[data-assist]'));
releaseRefresh.forEach(release=>release());await accepting;
console.log('PASS · mobile/kiosk order forms, accepted-call restoration and draft preservation without inbox buttons');
console.log('PASS · single acceptance on double click, coalesced station refresh, retained inbox on network failure and acceptance error recovery');

// Coworker calls are visible but never expose resume/end/form controls.
const coworker=supportUI(async path=>({items:path.endsWith('WH1')?[{...item,status:'held',accepted_by:'other@test.vn'}]:[]}),true);
await coworker.refreshInbox();assert.equal(coworker.team.children.length,1);assert.equal(coworker.held.children.length,0);
assert.equal(coworker.team.querySelectorAll('button').length,0);assert.equal(coworker.panel.querySelector('[data-assist]'),null);
assert.ok(coworker.team.children[0].children.some(n=>n.textContent?.includes('other@test.vn')));
// A realtime claim invalidates an in-flight waiting snapshot and immediately stops its ring.
let reply,read=0;
const realtime=supportUI(async path=>{
 if(path.endsWith('WH2'))return {items:[]};
 if(++read===1)return {items:[item]};
 if(read===2)return await new Promise(resolve=>reply=()=>resolve({items:[item]}));
 return {items:[{...item,status:'accepted',accepted_by:'other@test.vn'}]};
});
await realtime.refreshInbox();assert.equal(realtime.ringing(),item.call_id);
const stale=realtime.refreshInbox();await new Promise(resolve=>setImmediate(resolve));
realtime.handleSupportEvent({type:'support_accepted',call_id:item.call_id,station:'WH1',accepted_by:'other@test.vn'});
assert.equal(realtime.ringing(),null,'Coworker acceptance silences the banner before the network refresh finishes');
reply();await stale;assert.equal(realtime.team.children.length,1);assert.equal(realtime.team.querySelectorAll('button').length,0);
assert.equal(realtime.list.querySelectorAll('button').length,0,'A stale waiting response cannot restore the accept button');
assert.deepEqual(realtime.rings,[item.call_id]);
// Busy agents keep their current call when another waiting call is clicked.
await formUI.acceptCall({...item,call_id:'busy-current'});const busyRow=new Element();formUI.mobileAgent({...item,call_id:'busy-new'},busyRow);
assert.equal(busyRow.children[0].disabled,true);const busyCurrent=formUI.current();await busyRow.children[0].onclick();assert.equal(formUI.current(),busyCurrent);
// A rejected end request must keep the call, media and entered order draft intact.
let rejectEnd=true,endRequests=0;
const retained=supportUI(async path=>{if(path==='/api/support/resolve'){endRequests++;if(rejectEnd)throw Error('offline');}return {items:[]};},true);
await retained.acceptCall(item);const retainedForm=retained.panel.querySelector('[data-assist]');retainedForm.querySelector('textarea').value='DRAFT-123';
await retained.endCall();assert.equal(retained.current(),item.call_id);assert.equal(retained.panel.querySelector('[data-assist]'),retainedForm);assert.equal(retainedForm.querySelector('textarea').value,'DRAFT-123');assert.match(retained.messages.at(-1),/Chưa kết thúc/);
rejectEnd=false;await retained.endCall();assert.equal(retained.current(),null);assert.equal(retained.panel.querySelector('[data-assist]'),null);assert.equal(endRequests,2);
const busyRings=formUI.rings.length;formUI.handleSupportEvent({...item,type:'support_call',call_id:'waiting-while-busy'});assert.equal(formUI.rings.length,busyRings,'Incoming calls do not ring over an active call');
const cameraDenied=supportUI(async()=>({items:[]}),true,true);
await cameraDenied.acceptCall({...item,issue:'At desk',video_mode:'kiosk',kiosk_email:'kiosk@test.vn'});
assert.equal(cameraDenied.current(),item.call_id,'A camera error does not discard a successful server claim');
const claimedForm=cameraDenied.panel.querySelector('[data-assist]');assert.ok(claimedForm);
const retry=cameraDenied.panel.querySelectorAll('button').find(n=>n.textContent==='Thử lại camera / micro');assert.ok(retry);cameraDenied.allowMedia();await retry.onclick();
assert.equal(cameraDenied.panel.querySelector('[data-assist]'),claimedForm);assert.equal(retry.parent,null);
console.log('PASS · coworker read-only ownership, immediate ring stop, stale inbox invalidation, busy-call protection and retained call/draft on failed ending');
