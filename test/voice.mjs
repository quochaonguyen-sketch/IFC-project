import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const files=(await readdir('public/voice')).filter(n=>n.endsWith('.wav'));
assert.equal(files.length,37);
for(const name of files){const wav=await readFile('public/voice/'+name);assert.equal(wav.toString('ascii',0,4),'RIFF',name);assert.ok(wav.length>44&&wav.subarray(44).some(v=>v!==0),'Silent or empty '+name);}
console.log('PASS · 37 bundled Vietnamese WAV clips contain nonzero audio samples');
const riderClips=['welcome','codes','review','receipt','wait','added','ambiguous','error','duplicate','ready',...Array.from({length:10},(_,i)=>'n'+i)];
for(const clip of riderClips){
 const mp3=await readFile('public/voice/rider-'+clip+'.mp3');
 assert.ok(mp3.length>1024,'Empty rider speech: '+clip);
 assert.ok(mp3.toString('ascii',0,3)==='ID3'||(mp3[0]===0xff&&(mp3[1]&0xe0)===0xe0),'Invalid MP3: '+clip);
}
console.log('PASS · 20 bundled rider MP3 guidance clips and spoken receipt digits');
