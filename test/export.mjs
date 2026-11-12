import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse} from 'parse5';
const manifest=JSON.parse(await readFile('migration/manifest.json','utf8'));
const walk=n=>[n,...(n.childNodes||[]).flatMap(walk)];
const attr=(n,key)=>n.attrs?.find(a=>a.name===key)?.value;
for(const page of manifest){
 const original=walk(parse(await readFile(page.reference,'utf8')));
 const exported=walk(parse(await readFile('out'+page.route+'index.html','utf8')));
 const byId=new Map(exported.filter(n=>attr(n,'id')).map(n=>[attr(n,'id'),n]));
 for(const before of original){
   const id=attr(before,'id');if(!id||['style','script'].includes(before.tagName))continue;
   if(page.removedIds?.includes(id)){assert.ok(!byId.has(id),'Retired field still exported: '+id);continue;}
   const after=byId.get(id);assert.ok(after,page.route+' lost operational element #'+id);
   if(['input','select','textarea','form','video','iframe','dialog','tbody'].includes(before.tagName)){
     assert.equal(after.tagName,before.tagName,id+' changed control type');
     for(const key of ['type','required','autocomplete','allow','accept'])assert.equal(attr(after,key),attr(before,key),id+' changed '+key);
   }
 }
 assert.equal(attr(exported.find(n=>n.tagName==='body'),'data-page'),page.name);
 assert.equal(exported.some(n=>n.tagName==='link'&&attr(n,'href')?.startsWith('/ui/system.css')),page.visualTheme!=='legacy','Legacy operational pages restore their own theme; other pages retain the shared system');
 assert.ok(exported.some(n=>n.tagName==='script'&&attr(n,'src')?.startsWith('/_next/')),'Not a Next.js export');
 if(['desktop','mobile'].includes(page.name)){
   assert.equal(attr(byId.get('authRestoreStatus'),'role'),'status','Show session restoration from the first server render');
   const legacyForm=exported.find(n=>attr(n,'class')?.split(' ').includes('auth-login-box'));
   assert.notEqual(attr(legacyForm,'hidden'),undefined,'The obsolete inline login must never flash while restoring a saved session');
 }
 if(page.name==='desktop')for(const id of ['navManage','navHandover','navRiderOverview']){
   assert.equal(byId.get(id).tagName,'button','Navigation must support keyboard activation');
   assert.equal(attr(byId.get(id),'type'),'button');
 }
}
for(const [legacy,canonical] of [['location_tools.html','location-tools/index.html'],['rider/call.html','rider/call/index.html']]){
 assert.equal(await readFile('out/'+legacy,'utf8'),await readFile('out/'+canonical,'utf8'));
}
console.log('PASS · 9 styled Next.js pages preserve operational controls, authentication forms, media permissions, keyboard navigation and legacy URLs');
