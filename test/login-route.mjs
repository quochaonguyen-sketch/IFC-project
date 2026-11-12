import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=(await readFile('public/login/login.js','utf8')).replace(/^import .*;$/gm,'');
for(const [target,expected] of [['/location-tools/','/location-tools/'],['/location_tools.html','/location_tools.html'],['/mobile/','/mobile/'],['//example.com','/'],['https://example.com','/']]){
 const nodes=new Map();let destination;
 const context={deviceContext:false,URLSearchParams,document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}},auth:{currentUser:null,async authStateReady(){}},session:async()=>({role:'staff'}),logout(){},location:{search:'?next='+encodeURIComponent(target),replace(value){destination=value;}}};
 const check=await vm.runInNewContext('(async()=>{'+source+';return check;})()',context);
 context.auth.currentUser={emailVerified:true,async reload(){},async getIdToken(){}};
 await check();assert.equal(destination,expected);
}
console.log('PASS · login returns to both Location URLs and rejects external redirect destinations');
