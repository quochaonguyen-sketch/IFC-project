import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=process.env.IFC_TEST_URL||'http://127.0.0.1:8787';
const manifest=JSON.parse(await readFile('migration/manifest.json','utf8'));
for(const page of manifest){
 const response=await fetch(base+page.route);
 assert.equal(response.status,200,page.route);
 assert.ok((await response.text()).includes('/_next/'),page.route+' must serve Next.js');
 for(const script of page.scripts){
   const asset=await fetch(base+script.src);assert.equal(asset.status,200,script.src);
   assert.match(asset.headers.get('content-type'),/javascript/,script.src);
 }
}
for(const [route,target] of [['/rider/call.html','/rider/call/'],['/location_tools.html','/location-tools/'],['/location_tools','/location-tools/']]){
 const response=await fetch(base+route);assert.equal(response.status,200,route);
 assert.equal(new URL(response.url).pathname,target,'Legacy URLs must reach the canonical Next.js route');
}
const health=await fetch(base+'/health');assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
assert.equal((await fetch(base+'/api/session')).status,401);
assert.equal((await fetch(base+'/v1/browser/ws')).status,426);
assert.equal((await fetch(base+'/api/rider/pickup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'nonexistent-smoke-test-qr',token:crypto.randomUUID(),action:'info'})})).status,404);
assert.equal((await fetch(base+'/this-page-does-not-exist/')).status,404);
console.log('PASS · live Cloudflare local server, all Next.js routes/scripts, old URLs, D1, API authentication, WebSocket boundary, and 404');
