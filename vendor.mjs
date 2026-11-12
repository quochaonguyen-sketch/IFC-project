import {build} from 'esbuild';
import {mkdir,copyFile,readdir,cp} from 'node:fs/promises';
const out='public/vendor';
await mkdir(out+'/lang',{recursive:true});
for(const [source,name] of [['xlsx/dist/xlsx.full.min.js','xlsx.full.min.js'],['html5-qrcode/html5-qrcode.min.js','html5-qrcode.min.js'],['tesseract.js/dist/tesseract.min.js','tesseract.min.js'],['tesseract.js/dist/worker.min.js','worker.min.js']]){
  await copyFile('node_modules/'+source,out+'/'+name);
}
await mkdir(out+'/core',{recursive:true});
for(const file of await readdir('node_modules/tesseract.js-core')){
  if(file.endsWith('.wasm.js')||file.endsWith('.wasm'))await copyFile('node_modules/tesseract.js-core/'+file,out+'/core/'+file);
}
await cp('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',out+'/lang/eng.traineddata.gz');
await build({entryPoints:['node_modules/qrcode/lib/browser.js'],bundle:true,platform:'browser',format:'iife',globalName:'QRCode',outfile:out+'/qr.js'});
