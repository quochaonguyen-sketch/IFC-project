// One-time, reproducible conversion. app/**/*.tsx is the editable application source.
import {parse} from 'parse5';
import {readFile,writeFile,mkdir,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';
const pages=[
  ['desktop','index.html',''],['mobile','mobile/index.html','mobile'],
  ['admin','admin/index.html','admin'],['login','login/index.html','login'],
  ['kiosk','kiosk/index.html','kiosk'],['rider','rider/index.html','rider'],
  ['support','support/index.html','support'],['rider-call','rider/call.html','rider/call'],
  ['location-tools','location_tools.html','location-tools'],
];
const write=async(file,value)=>{await mkdir(path.dirname(file),{recursive:true});await writeFile(file,value);};
const walk=node=>[node,...(node.childNodes||[]).flatMap(walk)];
const attr=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;
const text=node=>(node.childNodes||[]).map(c=>c.value||text(c)).join('');
const bool=new Set(['disabled','required','hidden','autoplay','muted','playsinline','multiple','readonly','checked','controls','open']);
const names={class:'className',for:'htmlFor',colspan:'colSpan',tabindex:'tabIndex',autocomplete:'autoComplete',autocapitalize:'autoCapitalize',autocorrect:'autoCorrect',inputmode:'inputMode',spellcheck:'spellCheck',autoplay:'autoPlay',playsinline:'playsInline',readonly:'readOnly'};
let importantRules=[],pageName='';
function styleObject(value){
  const style={};
  for(const declaration of value.split(/;(?![^()]*\))/)){
    const colon=declaration.indexOf(':');if(colon<0)continue;
    let key=declaration.slice(0,colon).trim();const val=declaration.slice(colon+1).trim();
    if(!key||!val)continue;
    if(!key.startsWith('--'))key=key.replace(/^-ms-/,'ms-').replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
    if(val.endsWith('!important'))throw Error('Inline !important needs manual conversion: '+value);
    style[key]=val;
  }
  return style;
}
const empty=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
function jsx(node){
  if(node.nodeName==='#text')return node.value?'{'+JSON.stringify(node.value)+'}':'';
  if(!node.tagName||['script','style','link','title','meta'].includes(node.tagName))return '';
  const tag=node.tagName;let attrs='';
  for(const a of node.attrs||[]){
    if(a.name.startsWith('on'))throw Error('Unexpected inline event '+a.name);
    if(a.name==='selected')continue;
    if(a.name==='style'){
      if(a.value.includes('!important')){
        const id=pageName+'-'+importantRules.length;
        importantRules.push(`[data-ifc-inline="${id}"]{${a.value}}`);
        attrs+=' data-ifc-inline={'+JSON.stringify(id)+'}';
      }else attrs+=' style={'+JSON.stringify(styleObject(a.value))+'}';
      continue;
    }
    let name=names[a.name]||a.name;
    if(a.name==='value'&&['input','textarea'].includes(tag))name='defaultValue';
    if(a.name==='checked')name='defaultChecked';
    let value=bool.has(a.name)?true:a.value;
    if(['tabIndex','colSpan'].includes(name))value=Number(value);
    attrs+=' '+name+'={'+JSON.stringify(value)+'}';
  }
  if(tag==='select'){
    const selected=walk(node).find(n=>n.tagName==='option'&&attr(n,'selected')!==undefined);
    if(selected)attrs+=' defaultValue={'+JSON.stringify(attr(selected,'value')??text(selected))+'}';
  }
  if(tag==='textarea'){
    attrs+=' defaultValue={'+JSON.stringify(text(node))+'}';return '<textarea'+attrs+' />';
  }
  if(empty.has(tag))return '<'+tag+attrs+' />';
  return '<'+tag+attrs+'>'+(node.childNodes||[]).map(jsx).join('')+'</'+tag+'>\n';
}
const manifest=[];
for(const [name,file,route] of pages){
 importantRules=[];pageName=name;
 const reference='migration/reference/'+file;
 try{await readFile(reference);}catch{await mkdir(path.dirname(reference),{recursive:true});await copyFile('public/'+file,reference);}
 const original=await readFile(reference,'utf8'),document=parse(original),nodes=walk(document);
 const body=nodes.find(n=>n.tagName==='body');
 let styles=nodes.filter(n=>n.tagName==='style').map(text).join('\n');
 const markup=(body.childNodes||[]).map(jsx).join('');
 styles+='\n'+importantRules.join('\n');
 const links=nodes.filter(n=>n.tagName==='link'&&attr(n,'rel')==='stylesheet').map(n=>attr(n,'href'));
 if(styles){await write('public/next-styles/'+name+'.css',styles);links.push('/next-styles/'+name+'.css');}
 const scripts=[];let i=0,needsReady=false;
 for(const script of nodes.filter(n=>n.tagName==='script')){
   let src=attr(script,'src');const type=attr(script,'type');
   if(!src){
     let code=text(script);
     code=code.replace(/document\.addEventListener\((['"])DOMContentLoaded\1\s*,\s*/g,()=>{needsReady=true;return 'window.ifcOnReady(';});
     src='/next-runtime/'+name+'-'+(++i)+'.js';await write('public'+src,code);
   }
   scripts.push({src,...(type?{type}:{})});
 }
 if(needsReady)scripts.unshift({src:'/next-runtime/ready.js'});
 const group='app/('+name+')';
 const viewport={width:'device-width',initialScale:1};
 const viewportMeta=nodes.find(n=>n.tagName==='meta'&&attr(n,'name')==='viewport');
 if(attr(viewportMeta||{},'content')?.includes('viewport-fit=cover'))viewport.viewportFit='cover';
 const theme=nodes.find(n=>n.tagName==='meta'&&attr(n,'name')==='theme-color');if(theme)viewport.themeColor=attr(theme,'content');
 await write(group+'/layout.tsx',`import type {Metadata,Viewport} from 'next';\nimport type {ReactNode} from 'react';\nimport OperationalDocument from '@/components/OperationalDocument';\nexport const metadata:Metadata=${JSON.stringify({title:text(nodes.find(n=>n.tagName==='title')),description:'IFC_01 Handover · Next.js'})};\nexport const viewport:Viewport=${JSON.stringify(viewport)};\nexport default function Layout({children}:{children:ReactNode}){\n return <OperationalDocument bodyClass={${JSON.stringify(attr(body,'class')||'')}} stylesheets={${JSON.stringify(links)}} scripts={${JSON.stringify(scripts)}}>{children}</OperationalDocument>;\n}\n`);
 await write(group+(route?'/'+route:'')+'/page.tsx',`// Markup and element IDs preserved from IFC_01 Handover 0.7.0.\nexport default function Page(){\n return <>\n${markup}\n</>;\n}\n`);
 await rm('public/'+file,{force:true});
 manifest.push({name,route:'/'+(route?route+'/':''),reference,bodyClass:attr(body,'class')||'',stylesheets:links,scripts});
}
await write('migration/manifest.json',JSON.stringify(manifest,null,2)+'\n');
for(const [file,target] of [['location_tools.html','/location-tools/'],['rider/call.html','/rider/call/']]){
 await write('public/'+file,`<!doctype html><html lang="vi"><meta charset="utf-8"><title>IFC Handover</title><script>location.replace(${JSON.stringify(target)}+location.search+location.hash)</script><a href="${target}">Mở IFC Handover</a></html>`);
}
console.log('Converted',pages.length,'routes into React/Next.js pages.');
