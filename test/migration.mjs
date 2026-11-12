import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parse} from 'parse5';

const manifest=JSON.parse(await readFile('migration/manifest.json','utf8'));
assert.equal(manifest.length,9);
const walk=n=>[n,...(n.childNodes||[]).flatMap(walk)];
const attr=(n,key)=>n.attrs?.find(a=>a.name===key)?.value;
for(const page of manifest){
  const original=parse(await readFile(page.reference,'utf8'));
  const file='app/('+page.name+')'+(page.route==='/'?'':page.route.slice(0,-1))+'/page.tsx';
  const component=await readFile(file,'utf8');
  assert.ok(component.includes('export default function Page()'));
  assert.ok(!component.includes('dangerouslySetInnerHTML'));
  for(const node of walk(original)){
    const id=attr(node,'id');
    if(page.removedIds?.includes(id)){assert.ok(!component.includes('id={'+JSON.stringify(id)+'}'),'Retired field still present: '+id);continue;}
    if(id&&!['style','script'].includes(node.tagName))assert.ok(component.includes('id={'+JSON.stringify(id)+'}'),page.name+' lost #'+id);
  }
  for(const script of page.scripts){
    const source=await readFile('public'+script.src.split('?')[0],'utf8');
    assert.ok(source.length>0,script.src);
    if(script.src.startsWith('/next-runtime/')&&!script.src.endsWith('/ready.js')){
      assert.ok(!/document\.addEventListener\((['"])DOMContentLoaded\1/.test(source),'Late initialization would be lost');
    }
  }
}
const ready=await readFile('public/next-runtime/ready.js','utf8');
for(const loading of [true,false]){
  let callback,options,calls=0;
  const context={window:{},document:{readyState:loading?'loading':'complete',addEventListener(event,fn,opts){assert.equal(event,'DOMContentLoaded');callback=fn;options=opts;}},setTimeout(fn){callback=fn;}};
  vm.runInNewContext(ready,context);
  context.window.ifcOnReady(()=>calls++);
  assert.equal(calls,0,'Initialization waits until the operational module has finished evaluating');
  callback();assert.equal(calls,1);
  if(loading)assert.equal(options.once,true);
}
console.log('PASS · 9 React routes, original element IDs, operational script graph, and hydration-safe initialization');
