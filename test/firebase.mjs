import assert from "node:assert/strict";
import {build} from "esbuild";
import {generateKeyPair, exportJWK, SignJWT} from "jose";
const {outputFiles}=await build({entryPoints:["src/index.ts"],bundle:true,platform:"browser",format:"esm",write:false});
const {default:worker}=await import("data:text/javascript;base64,"+Buffer.from(outputFiles[0].contents).toString("base64"));
const {publicKey,privateKey}=await generateKeyPair("RS256");
const jwk={...await exportJWK(publicKey),kid:"test-key",alg:"RS256",use:"sig"};
globalThis.fetch=async url=>{
  assert.equal(String(url),"https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  return Response.json({keys:[jwk]});
};
const project="local-auth-test",env={FIREBASE_PROJECT_ID:project,ADMIN_EMAIL:"admin@test.vn",DB:{prepare(){return {bind(){return this;},first:async()=>({active:1}),all:async()=>({results:[]})}}}};
const now=Math.floor(Date.now()/1000);
async function mint(patch={},key=privateKey){
 return new SignJWT({sub:"uid",iat:now,auth_time:now,exp:now+300,aud:project,iss:"https://securetoken.google.com/"+project,email:"admin@test.vn",email_verified:true,...patch})
 .setProtectedHeader({alg:"RS256",kid:"test-key"}).sign(key);
}
async function session(token){
 return worker.fetch(new Request("https://trial/api/session",{headers:token?{authorization:"Bearer "+token}:{}}),env,{});
}
const accepted=await session(await mint());assert.equal(accepted.status,200);assert.equal((await accepted.json()).role,"admin");
assert.equal((await session()).status,401);
for(const invalid of [{email_verified:false},{aud:"another-project"},{iss:"another-issuer"},{exp:now-60}])assert.equal((await session(await mint(invalid))).status,401);
const another=await generateKeyPair("RS256");
assert.equal((await session(await mint({},another.privateKey))).status,401);
console.log("PASS · signed Firebase-format ID token, required sign-in, verified email, issuer, project, expiry and invalid signature");
