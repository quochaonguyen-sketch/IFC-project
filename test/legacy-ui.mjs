import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
function retainedFunction(source,name){const start=source.search(new RegExp('    (?:async )?function '+name+'\\('));assert.ok(start>=0,name);return source.slice(start,source.indexOf('\n    }',start)+6);}
for(const file of ['desktop-2.js','mobile-1.js']){
 const source=await readFile('public/next-runtime/'+file,'utf8');
 let ticket={id:'selected',ticket_no:'20261106-0001',status:'HOLD'},reply,upserts=[],opened=[],messages=[],requests=[];
 const context=vm.createContext({console,Date,holdTicketBusy:false,currentHoldTicket:null,holdMineFilterActive:false,holdWaitingFilterActive:false,VNWL_HOLD_FILTER_KEY_V4:'filter',
  apiPost:async(path,body)=>{requests.push({path,body});return typeof reply==='function'?reply():reply;},
  upsertHoldTicketCache:value=>{upserts.push(value);ticket=value;return value;},readHoldTicket:async()=>ticket,
  updateHoldButtons(){},renderActiveHoldTicketsFromCache(){},openHoldBoxModal:value=>opened.push(value),setHandoverMessage:value=>messages.push(value),playSound(){},
  getWarehouse:()=>'WH1',getDeviceId:()=>'device',getClientDeviceKind:()=>'PC',getCurrentOperatorEmail:()=>'operator@test.vn',
  appendHoldActivityLog:()=>[],normalizeHoldBoxCode:value=>String(value||''),pushHoldTicketStageToRiderOverview:async()=>{},showVnwlToast(){},vnwlSafeToast(){},updateHoldMineFilterButtonUi(){},
  forceReloadTodayHoldTicketsFromServer:async()=>{},localStorage:{setItem(){}}
 });
 vm.runInContext(['receiveHoldTicket','markHoldTicketPicked','autoClaimNextHoldTicket'].map(name=>retainedFunction(source,name)).join('\n')+'\nthis.ui={receiveHoldTicket,markHoldTicketPicked,autoClaimNextHoldTicket};',context);
 let resolve;reply=()=>new Promise(done=>resolve=done);
 const acceptance=context.ui.receiveHoldTicket('selected');await Promise.resolve();
 assert.equal(upserts.length,0,'Receive waits for the server before updating the card');assert.equal(opened.length,0);
 resolve({ok:true,ticket:{...ticket,status:'RECEIVED'}});await acceptance;
 assert.equal(requests[0].body.ticket_id,'selected');assert.equal(opened[0].status,'RECEIVED');
 requests=[];await context.ui.markHoldTicketPicked('selected');assert.equal(requests.length,0,'BOX or explicit skip is required');
 ticket={...ticket,status:'BOX_ASSIGNED',box_skipped:true};reply={ok:true,ticket:{...ticket,status:'PICKED'}};
 await context.ui.markHoldTicketPicked('selected');assert.equal(ticket.status,'PICKED');
 ticket={id:'failed',status:'HOLD'};upserts=[];opened=[];reply=()=>{throw Error('offline');};
 await context.ui.receiveHoldTicket('failed');assert.equal(upserts.length,0);assert.equal(opened.length,0);assert.ok(messages.at(-1).includes('offline'));
 reply={ok:true,items:[{id:'auto',status:'RECEIVED'}]};await context.ui.autoClaimNextHoldTicket();assert.equal(opened.at(-1).id,'auto');
 console.log('PASS · '+file+': confirmed receive, BOX popup, required BOX stage, pick confirmation and failure recovery');
}
