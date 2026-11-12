import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('../public/admin/admin.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
class Element {
  constructor(tag='div'){Object.assign(this,{tag,children:[],dataset:{},handlers:{},value:'',checked:false,disabled:false,hidden:false,textContent:''});}
  append(...nodes){for(const node of nodes){if(typeof node==='string')continue;node.parentElement=this;this.children.push(node);if(this.tag==='select'&&this.children.length===1)this.value=node.value;}}
  replaceChildren(...nodes){this.children=[];if(this.tag==='select')this.value='';this.append(...nodes);}
  querySelectorAll(selector){return this.children.flatMap(node=>[...(selector.split(',').some(part=>part==='input:checked'?node.tag==='input'&&node.checked:node.tag===part)?[node]:[]),...node.querySelectorAll(selector)]);}
  setAttribute(name,value){this[name]=value;}
  get options(){return this.children;}
  dispatchEvent(){this.onchange?.();}
  addEventListener(type, handler){this.handlers[type]=handler;}
  showModal(){this.open=true;}
  close(){this.open=false;this.handlers.close?.();}
  async decode(){}
}
const event={preventDefault(){}};
async function start(role='admin'){
  const ids=Object.fromEntries(['adminGlobalCard','adminForm','adminEmail','adminMsg','admins','warehouseForm','newCode','newName','addWarehouse','warehouseMsg','warehouse','warehouseCard','adminScope','warehouses','grantWarehouses','role','users','grant','email','grantMsg','logout','account','msg'].map(id=>[id,new Element()]));
  for (const id of ['stationQrOpen','stationQrDialog','stationQrStatus','stationQrPoster','stationQrImage','stationQrPrint','stationQrClose','stationQrWarehouse']) ids[id]=new Element();
  ids.warehouse.tag='select';ids.email.tag=ids.newCode.tag=ids.newName.tag='input';ids.addWarehouse.tag='button';
  ids.adminForm.append(ids.adminEmail,new Element('button'));
  ids.warehouseForm.append(ids.newCode,ids.newName,ids.addWarehouse);
  for(const value of ['staff','warehouse_admin','customer_service']){const label=new Element('label'),input=new Element('input');input.value=value;input.checked=value==='staff';label.append(input);ids.role.append(label);}
  ids.grant.append(ids.email,ids.role,ids.grantWarehouses,new Element('button'));
  const warehouses=[{code:'WH1',name:'Kho 1',active:1},{code:'WH2',name:'Kho 2',active:1}],requests=[];
  let failure,hold,customRead,confirmation=true;const redirects=[];
  let printCount=0;
  const context=vm.createContext({
    document:{getElementById:id=>ids[id],createElement:tag=>new Element(tag),createTextNode:()=>new Element('text')},Event:class{},confirm:()=>confirmation,location:{origin:'https://test',hostname:'test',replace:path=>redirects.push(path)},logout(){},
    AbortController,setTimeout,clearTimeout,
    window:{print:()=>printCount++,QRCode:{toDataURL:async url=>'data:image/png,'+url}},
    gate:async()=>({email:'admin@test.vn',role,managedStations:['WH1'],warehouses:['WH1']}),
    authenticatedFetch:async(path,options)=>{
      const data=options?.body?JSON.parse(options.body):undefined;requests.push({path,data});
      if(options?.method==='DELETE'){if(failure)return {ok:false,json:async()=>({error:failure})};const w=warehouses.find(w=>path.endsWith(w.code));w.active=0;return {ok:true,json:async()=>({ok:true})};}
      if(options?.method==='POST'){
        if(hold)await hold;if(failure)return {ok:false,json:async()=>({error:failure})};
        if(path.startsWith('/api/admin/station-qr?'))return {ok:true,json:async()=>({code:path.split('=')[1]+'-code'})};
        if(path==='/api/admin/warehouses')warehouses.push({...data,active:1});
        return {ok:true,json:async()=>({ok:true,self_revoked:data.action==='transfer'})};
      }
      if(customRead&&path.includes('/permissions?'))return {ok:true,json:async()=>await customRead(path)};
      return {ok:true,json:async()=>({items:path==='/api/admin/warehouses'?warehouses:path==='/api/admin/admins'?[{email:'admin@test.vn'}]:[]})};
    }
  });
  await vm.runInContext('(async()=>{'+source+';this.reload=loadUsers;})()',context);
  return {ids,requests,redirects,printCount:()=>printCount,confirm:value=>confirmation=value,reload:context.reload,fail:message=>failure=message,hold:promise=>hold=promise,read:fn=>customRead=fn};
}
const ui=await start(),n=ui.ids;
assert.equal(n.adminGlobalCard.hidden,false);assert.equal(n.admins.children[0].children[1].disabled,true,'Last admin cannot be revoked from the UI');
n.adminEmail.value=' ROOT2@TEST.VN ';await n.adminForm.onsubmit(event);assert.deepEqual(ui.requests.find(r=>r.path==='/api/admin/admins'&&r.data).data,{email:'root2@test.vn',action:'grant'});
n.adminEmail.value='next@test.vn';ui.confirm(false);const beforeCancel=ui.requests.length;await n.adminForm.onsubmit({...event,submitter:{value:'transfer'}});assert.equal(ui.requests.length,beforeCancel);ui.confirm(true);await n.adminForm.onsubmit({...event,submitter:{value:'transfer'}});assert.equal(ui.redirects.length,1);
assert.equal(n.warehouseCard.hidden,false);assert.equal(n.warehouse.value,'WH1');
n.newCode.value=' wh3 ';n.newName.value='Kho mới';
let release;ui.hold(new Promise(resolve=>release=resolve));
const creating=n.warehouseForm.onsubmit(event);await n.warehouseForm.onsubmit(event);
assert.equal(ui.requests.filter(r=>r.path==='/api/admin/warehouses'&&r.data).length,1,'Repeated submit creates once');
assert.equal(n.addWarehouse.disabled,true);release();await creating;ui.hold(null);
assert.equal(n.warehouse.value,'WH3');assert.equal(n.newCode.value,'');assert.match(n.warehouseMsg.textContent,/Đã tạo kho WH3/);
assert.deepEqual(n.grantWarehouses.querySelectorAll('input:checked').map(i=>i.value),['WH3']);
n.email.value=' USER@TEST.VN ';await n.grant.onsubmit(event);
const granted=ui.requests.find(r=>r.path.includes('/permissions?')&&r.data);
assert.deepEqual(granted.data,{email:'user@test.vn',roles:['staff'],warehouses:['WH3']});
assert.equal(n.email.value,'');assert.match(n.grantMsg.textContent,/user@test.vn/);
n.newCode.value='WH3';const posts=ui.requests.filter(r=>r.data).length;await n.warehouseForm.onsubmit(event);
assert.equal(ui.requests.filter(r=>r.data).length,posts);assert.match(n.warehouseMsg.textContent,/đã tồn tại/);
n.newCode.value='?';await n.warehouseForm.onsubmit(event);assert.equal(ui.requests.filter(r=>r.data).length,posts);
ui.fail('Không có quyền');n.newCode.value='WH4';await n.warehouseForm.onsubmit(event);
assert.equal(n.newCode.value,'WH4');assert.equal(n.addWarehouse.disabled,false);assert.equal(n.warehouseMsg.textContent,'Không có quyền');
n.email.value='retry@test.vn';await n.grant.onsubmit(event);assert.equal(n.email.value,'retry@test.vn');assert.equal(n.grantMsg.textContent,'Không có quyền');
assert.equal(n.role.querySelectorAll('input').find(i=>i.value==='staff').disabled,false);
let resolveOld;ui.read(path=>path.endsWith('WH1')?new Promise(resolve=>resolveOld=resolve):{items:[{email:'new@test.vn',role:'staff'}]});
n.warehouse.value='WH1';const old=ui.reload();n.warehouse.value='WH2';await ui.reload();resolveOld({items:[{email:'old@test.vn',role:'staff'}]});await old;
assert.match(n.users.children[0].children[0].textContent,/new@test.vn/,'Late responses cannot overwrite the selected warehouse');
const manager=await start('warehouse_admin'),m=manager.ids;
assert.equal(m.adminGlobalCard.hidden,true);assert.equal(m.warehouseCard.hidden,true);assert.equal(m.warehouse.options.length,1);
for(const input of m.role.querySelectorAll('input')){assert.equal(input.disabled,input.value!=='staff');assert.equal(input.checked,input.value==='staff');}
m.newCode.value='FORBIDDEN';await m.warehouseForm.onsubmit(event);assert.equal(manager.requests.some(r=>r.data),false);
m.email.value='staff@test.vn';await m.grant.onsubmit(event);
assert.deepEqual(manager.requests.find(r=>r.data).data,{email:'staff@test.vn',roles:['staff'],warehouses:['WH1']});
assert.equal(m.role.querySelectorAll('input').find(i=>i.value==='warehouse_admin').disabled,true,'Submit restores restricted role controls');
ui.fail(null);const remove=n.warehouses.children.find(row=>row.children[0].textContent.startsWith('WH3')).children[1];ui.confirm(false);const deletionCount=ui.requests.length;await remove.onclick();assert.equal(ui.requests.length,deletionCount);ui.confirm(true);ui.fail('Kho còn đơn');await remove.onclick();assert.equal(remove.disabled,false);assert.equal(n.warehouseMsg.textContent,'Kho còn đơn');ui.fail(null);await remove.onclick();assert.equal(n.warehouses.children.some(row=>row.children[0].textContent.startsWith('WH3')),false);
assert.equal(source.includes('/api/admin/devices'),false,'Kiosk management is removed');
console.log('PASS · global grants/transfer confirmation, protected last admin, warehouse delete confirmation/error recovery, removed Kiosk UI');
console.log('PASS · warehouse creation, automatic grant selection, duplicate submit guard, visible errors, preserved drafts, stale responses and manager scope');

const qr=await start(),q=qr.ids;
let finishRequest;
qr.hold(new Promise(resolve=>{finishRequest=resolve;}));
const waitingQr=q.stationQrOpen.onclick();
assert.equal(q.stationQrDialog.open,true);
assert.equal(q.stationQrPrint.disabled,true);
q.stationQrPrint.onclick();
assert.equal(qr.printCount(),0);
q.stationQrClose.onclick();
qr.hold(null);
q.warehouse.value='WH2';
await q.stationQrOpen.onclick();
finishRequest();await waitingQr;
assert.equal(q.stationQrWarehouse.textContent,'Kho WH2','Closing and reopening cannot show the old warehouse QR');
assert.equal(q.stationQrImage.src,'data:image/png,https://test/rider/#WH2-code');
assert.equal(q.stationQrPoster.hidden,false);
assert.equal(qr.printCount(),0,'Loading a QR preview does not open print');
q.stationQrPrint.onclick();
assert.equal(qr.printCount(),1);
q.stationQrClose.onclick();
qr.fail('Không tải được mã');
await q.stationQrOpen.onclick();
assert.equal(q.stationQrStatus.textContent,'Không tải được mã');
assert.equal(q.stationQrPrint.disabled,true);
assert.equal(q.stationQrPoster.hidden,true);
console.log('PASS · QR preview, explicit print, stale request isolation and error feedback');
