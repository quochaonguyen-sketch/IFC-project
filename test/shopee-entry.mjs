import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
function fn(source,name){const start=source.search(new RegExp('    (?:async )?function '+name+'\\('));assert.ok(start>=0,name);return source.slice(start,source.indexOf('\n    }',start)+6);}
for(const file of ['desktop-2.js','mobile-1.js']){
 const source=await readFile('public/next-runtime/'+file,'utf8');assert.doesNotMatch(source,/\bnewOrderSn\b|\borderSnInput\b/);
 const controls=new Map(),requests=[],messages=[];let failed=false;
 const get=id=>{if(id==='newOrderSn')return null;if(!controls.has(id))controls.set(id,{value:'',focus(){this.focused=true;},select(){}});return controls.get(id);};
 get('newOrderCode').value='SHOPEE123';get('newLocation').value='A';get('newSub').value='1';
 const context=vm.createContext({console:{error(){}},Date,createOrderBusy:false,allOrders:[{id:'old-awb',order_code:'AWB-OLD',order_sn:'SHOPEE123',location_code:'A',sub_code:'1'}],db:{},CODE_VERSION:'test',currentSuggestedSub:'',currentSuggestedLocation:'',subSuggestionAccepted:false,orderCanBeRecreatedFromTerminal:()=>false,
  document:{getElementById:get},clean:v=>String(v||'').trim(),safeOrderId:v=>'id-'+v,getWarehouse:()=>'WH1',doc(){},getOrdersCollectionName:()=>'',
  buildSuffixKeys:()=>[],serverTimestamp:()=>'',getDeviceId:()=>'pc',getCurrentOperatorEmail:()=>'test',slotSubNumber:Number,MAX_SUB_PER_LOCATION:40,
  apiPost:async(path,body)=>{if(failed)throw Error('offline');requests.push({path,body});return {ok:true,action:'CREATE',item:body.item};},
  normalizeOrder:v=>v,mergeOrdersIntoMemory(){},localSaveOrders:async()=>{},localPersistCurrentState:async()=>{},renderStats(){},renderOrders(){},applyCurrentFilters:v=>v,
  refreshSubSuggestion(){},setMessage:v=>messages.push(v),playSound(){},setTimeout:()=>0
 });
 vm.runInContext(fn(source,'createOrder')+'\n'+fn(source,'moveToLocationInput')+'\nthis.ui={createOrder,moveToLocationInput};',context);
 context.ui.moveToLocationInput();assert.equal(get('newLocation').focused,true);
 await context.ui.createOrder();assert.equal(requests.length,1,messages.at(-1));
 assert.equal(requests[0].body.item.order_sn,'SHOPEE123');assert.equal(requests[0].body.item.tracking_no,'');assert.equal(get('newOrderCode').value,'');
 get('newOrderCode').value='RETRY123';get('newLocation').value='B';get('newSub').value='2';failed=true;
 await context.ui.createOrder();assert.equal(get('newOrderCode').value,'RETRY123');assert.equal(context.createOrderBusy,false);
 console.log('PASS · '+file+': one Shopee field, Location transition, correct payload and retained input on failure');
}
