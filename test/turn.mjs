import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';
const source=await readFile('src/index.ts','utf8');
const {outputFiles}=await build({stdin:{contents:source+'\nexport {guestIce,turnConfigured};',loader:'ts',resolveDir:resolve('src')},bundle:true,write:false,platform:'browser',format:'esm'});
const {guestIce,turnConfigured}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].contents).toString('base64'));
const originalFetch=globalThis.fetch,originalNow=Date.now;
const env={TURN_KEY_ID:'test-turn-key',TURN_KEY_API_TOKEN:'private-long-lived-token'};
let now=originalNow(),requests=[],response;
Date.now=()=>now;
function valid(){return {iceServers:[{urls:'stun:stun.cloudflare.com:3478'},{urls:['turn:turn.cloudflare.com:3478?transport=udp','turns:turn.cloudflare.com:443?transport=tcp'],username:'temporary-user-'+requests.length,credential:'temporary-password',privateKey:'must-not-reach-client'}]};}
globalThis.fetch=async(url,init)=>{requests.push({url,init});return response?response():Response.json(valid(),{status:201});};
try{
  assert.equal(turnConfigured({}),false);
  assert.equal(turnConfigured({TURN_KEY_ID:env.TURN_KEY_ID}),false);
  assert.equal((await guestIce({},'none')).length,1);assert.equal(requests.length,0);
  const legacy={TURN_URL:'turns:legacy.test:443',TURN_USERNAME:'legacy-user',TURN_CREDENTIAL:'legacy-password'};
  assert.equal(turnConfigured(legacy),true);assert.equal((await guestIce(legacy,'legacy'))[1].username,'legacy-user');
  assert.equal(turnConfigured(env),true);
  const [first,concurrent]=await Promise.all([guestIce(env,'call-1:rider'),guestIce(env,'call-1:rider')]);
  assert.equal(requests.length,1);assert.deepEqual(first,concurrent);
  assert.equal(requests[0].url,'https://rtc.live.cloudflare.com/v1/turn/keys/test-turn-key/credentials/generate-ice-servers');
  assert.equal(requests[0].init.headers.Authorization,'Bearer '+env.TURN_KEY_API_TOKEN);
  assert.deepEqual(JSON.parse(requests[0].init.body),{ttl:7200});
  assert.ok(first[1].urls.some(url=>url.startsWith('turns:')&&url.includes(':443')));
  assert.ok(!JSON.stringify(first).includes(env.TURN_KEY_API_TOKEN));assert.equal(first[1].privateKey,undefined);
  const agent=await guestIce(env,'call-1:agent');assert.equal(requests.length,2);assert.notEqual(agent[1].username,first[1].username);
  now+=300001;await guestIce(env,'call-1:rider');assert.equal(requests.length,3,'Refresh credentials after the cache lease');
  response=()=>new Response(env.TURN_KEY_API_TOKEN,{status:401});
  const failures=await Promise.allSettled([guestIce(env,'failed'),guestIce(env,'failed')]);
  assert.equal(requests.length,4);
  for(const result of failures){assert.equal(result.status,'rejected');assert.equal(result.reason.status,503);assert.equal(result.reason.code,'TURN_UNAVAILABLE');assert.ok(!result.reason.message.includes(env.TURN_KEY_API_TOKEN));}
  response=null;await guestIce(env,'failed');assert.equal(requests.length,5,'A failed request must not poison the cache');
  for(const bad of [{iceServers:[{urls:'stun:stun.cloudflare.com:3478'}]},{iceServers:[{urls:'turns:turn.cloudflare.com:443'}]},{iceServers:[{urls:'javascript:alert(1)',username:'x',credential:'y'}]}]){
    response=()=>Response.json(bad);await assert.rejects(guestIce(env,'invalid-'+requests.length),error=>error.status===503);
  }
  response=()=>{throw Error('Network failed '+env.TURN_KEY_API_TOKEN);};
  await assert.rejects(guestIce(env,'network-error'),error=>error.status===503&&!error.message.includes(env.TURN_KEY_API_TOKEN));
}finally{globalThis.fetch=originalFetch;Date.now=originalNow;}
console.log('PASS · dynamic TURN credentials, private token isolation, TLS/443 fallback, participant cache, concurrent requests, expiry refresh, legacy config and safe failure/retry');
