import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
// Run the retained handlers without starting authentication or live subscriptions.
function fn(source,name){
  const start=source.search(new RegExp('    (?:async )?function '+name+'\\('));
  assert.ok(start>=0,name);const end=source.indexOf('\n    }',start);
  return source.slice(start,end+6);
}
for(const file of ['desktop-2.js','mobile-1.js']){
  const source=await readFile('public/next-runtime/'+file,'utf8');
  const timers=[],messages=[],box={innerHTML:'',querySelectorAll:()=>[]},controls=new Map();
  const cache=new Map();let reads=0,modal=false,resets=0;
  let server={id:'t1',ticket_no:'20261106-0001',status:'HANDED_OVER',workflow_status:'HANDED_OVER',date_key:'20261106',updated_at_ms:200};
  const context=vm.createContext({
    console,Date,Set,Map,holdTicketCache:cache,holdTicketsLastServerUpdatedAtMs:0,holdTicketsLastRenderedSignature:'',holdSearchLastRenderedSignature:'',
    holdMineFilterActive:false,holdWaitingFilterActive:false,holdSttSortOrder:'desc',autoHandoverBusy:false,
    handoverItems:[{id:'old',valid:true,scanned:true,status:'NO_RIDER'}],currentHoldTicket:null,
    clean:v=>String(v??'').trim(),dateToMs:()=>0,getHoldDateKey:()=>'20261106',getHoldSttComparator:()=>()=>0,
    getWarehouse:()=>'VNHCM1',getCurrentOperatorEmail:()=>'operator@test.vn',escapeHtml:String,
    getOpenHoldDetailIds:()=>new Set(),buildHoldTicketDetailHtml:()=>'',
    updateHoldMineFilterButtonUi(){},updateHoldSortOrderButtonUi(){},isHoldOwnedByThisDevice:()=>true,isHoldReceivedByCurrentAccount:()=>true,
    getHoldOwnerDeviceId:()=>'',getHoldTicketOperator:()=>'',getClientDeviceKind:()=>'PC',
    isHoldSearchUiFrozen:()=>true,getHoldTicketSearchInputNormalizedValue:()=>'20261106-0001',
    findCachedHoldTicketForSearchValue:()=>cache.get('t1'),freezeHoldSearchUi(){},holdSearchPinnedValue:'',HOLD_SEARCH_UI_FREEZE_MS:45000,
    getHoldTicketRef:id=>id,getDoc:async id=>{reads++;return {id,exists:()=>true,data:()=>server};},
    document:{getElementById:id=>{if(id==='holdTicketList')return box;if(!controls.has(id))controls.set(id,{disabled:false,focus(){}});return controls.get(id);}},
    setHandoverMessage:message=>messages.push(message),setScanMessage(){},playSound(){},
    sortHandoverItemsByPickSequence:items=>items,dedupeHandoverItemsByOrderCode:items=>({items}),safeOrderId:String,
    normalizeHoldBoxCode:v=>String(v),renderHandoverItems(){},renderModalTicket(){},updateHandoverStats(){},updateHoldButtons(){},
    openModal:()=>modal=true,getValidHandoverCount:()=>1,getScannedCount:()=>1,
    commitHandoverTransaction:async()=>({successItems:[{id:'old'}],skippedItems:[],directTicket:{id:'completed'}}),
    showHandoverSuccessModal(){},showSuccess(){},showResultPopup(){},notifyApiBridgeHandedOverTicket(){},isRiderOverviewPageVisible:()=>false,
    setTimeout:(fn,delay)=>{timers.push({fn,delay});},resetSession:()=>{resets++;modal=false;},confirm:()=>true
  });
  const names=['getHoldDuplicateCodeKey','getHoldDuplicateIdKey','normalizeHoldTicketNoDuplicateItems','isHoldTicketStillNeedsHandover','upsertHoldTicketCache','getCachedHoldTicket','maxHoldTicketUpdatedAtMs','rememberHoldTicketsServerUpdatedAt','cacheHoldTickets','replaceHoldTicketCacheForToday','isActiveHoldTicket','getTodayHoldTicketsFromCache','getHoldStatusText','getHoldTicketsSignature','renderHoldTicketList','readHoldTicket','openHoldTicketForHandover','handoverAll'];
  if(file.startsWith('desktop'))names.push('renderPinnedHoldSearchResultIfNeeded');
  vm.runInContext(names.map(name=>fn(source,name)).join('\n')+`
    renderActiveHoldTicketsFromCache=()=>${file.startsWith('desktop')?'renderPinnedHoldSearchResultIfNeeded()':'renderHoldTicketList(getTodayHoldTicketsFromCache(false))'};
    this.ui={upsertHoldTicketCache,replaceHoldTicketCacheForToday,renderHoldTicketList,renderActiveHoldTicketsFromCache,openHoldTicketForHandover,handoverAll};
  `,context);
  const ui=context.ui;
  const picked={...server,status:'PICKED',workflow_status:'PICKED',box_skipped:true,updated_at_ms:100,items:[{id:'o1',order_code:'SPX123',location_code:'A1'}]};
  ui.upsertHoldTicketCache(picked);ui.renderHoldTicketList([picked],true);assert.ok(box.innerHTML.includes('data-open-hold-handover'));
  ui.upsertHoldTicketCache(server);ui.renderActiveHoldTicketsFromCache();
  assert.ok(!box.innerHTML.includes('data-open-hold-handover'),file+' must remove stale scan action while search is pinned');
  assert.ok(box.innerHTML.includes('ĐÃ BÀN GIAO'));
  ui.replaceHoldTicketCacheForToday([picked]);assert.equal(cache.get('t1').status,'HANDED_OVER','An older snapshot cannot restore a completed ticket');
  ui.upsertHoldTicketCache({...picked,id:'clock-skew',updated_at_ms:500});
  ui.upsertHoldTicketCache({...server,id:'clock-skew'});assert.equal(cache.get('clock-skew').status,'HANDED_OVER','Terminal server state wins over a local optimistic clock');
  ui.upsertHoldTicketCache({...picked,id:'stale'});server={...server,id:'stale'};
  await ui.openHoldTicketForHandover('stale');assert.equal(reads,1,'Opening scan verifies current server state');
  assert.equal(modal,false);assert.ok(messages.at(-1).includes('ĐÃ BÀN GIAO'));
  await ui.handoverAll(true);
  server={...picked,id:'next'};await ui.openHoldTicketForHandover('next');assert.equal(modal,true);
  const reset=timers.find(timer=>timer.delay===1200);assert.ok(reset);reset.fn();
  assert.equal(modal,true,'The previous handover reset must not close a newly opened scan');assert.equal(resets,0);
  console.log('PASS · '+file+': pinned status, stale snapshot, server validation and previous-session reset');
}
