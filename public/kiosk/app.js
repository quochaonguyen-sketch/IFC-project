
let audioCtx = null;
function getAudioCtx(){if(!audioCtx){const AC=window.AudioContext||window.webkitAudioContext;if(AC)audioCtx=new AC();}if(audioCtx&&audioCtx.state==="suspended"){audioCtx.resume().catch(()=>{});}return audioCtx;}
function playScanChime(){
  try{
    const ctx=getAudioCtx();if(!ctx)return;const now=ctx.currentTime;
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type="sine";osc.frequency.setValueAtTime(1046.5,now);osc.frequency.setValueAtTime(1318.5,now+0.08);
    gain.gain.setValueAtTime(0.35,now);gain.gain.setValueAtTime(0.35,now+0.08);gain.gain.exponentialRampToValueAtTime(0.0001,now+0.25);
    osc.connect(gain);gain.connect(ctx.destination);osc.start(now);osc.stop(now+0.25);
  }catch(e){console.warn("Scan chime error:",e);}
}
import {gate,authenticatedFetch} from "/auth-client.js";
const $=id=>document.getElementById(id);
const labels=["Đăng ký lấy hàng","Tên trên ứng dụng tài xế","Quét mã vận đơn","Kiểm tra lượt lấy hàng","Số chờ của bạn"];
const prompts=["Nhấn Bắt đầu để đăng ký lấy hàng.","Nhập tên trên ứng dụng tài xế rồi nhấn Tiếp tục.","Quét hoặc nhập đầy đủ mã vận đơn. Khi đủ đơn, nhấn Kiểm tra."];
let draft=JSON.parse(sessionStorage.getItem("ifc-draft")||"null")||fresh(),busy=false,timer;
function fresh(){return {step:0,name:"",codes:[],key:crypto.randomUUID(),pending:false};}
function save(){sessionStorage.setItem("ifc-draft",JSON.stringify(draft));}
function preferredVietnameseVoice(t){
 const voices=t.getVoices().filter(v=>/^vi(?:-|_|\b)/i.test(v.lang));
 const rank=v=>{
   const n=((v.name||"")+" "+(v.voiceURI||"")+" "+(v.lang||"")).toLowerCase();
   if(/\b(male|nam|man)\b/i.test(n)&&!/female|woman/i.test(n))return -100;
   return (/(female|woman|nu|nữ|hoai|hoài|linh|my|mai|chi|lan|loan|nga)/i.test(n)?20:0)+(/natural|neural|online/i.test(n)?10:0)+(/google/i.test(n)?8:0)+(/apple/i.test(n)?5:0);
 };
 return voices.sort((a,b)=>rank(b)-rank(a))[0]||null;
}
let player, playId=0;
function say(line){
 const run=++playId;if(player){player.pause();player=null;}
 const t=window.speechSynthesis;
 if(t){
   t.cancel();const voice=preferredVietnameseVoice(t);
   if(voice){
     const u=new SpeechSynthesisUtterance(line);
     u.voice=voice;u.lang=voice.lang;u.rate=0.93;u.pitch=1.04;
     let fallback=false;
     function useClips(){if(run!==playId||fallback)return;fallback=true;t.cancel();playClip(run);}
     const timeout=setTimeout(useClips,1500);
     u.onstart=u.onend=()=>clearTimeout(timeout);u.onerror=()=>{clearTimeout(timeout);useClips();};
     t.speak(u);return;
   }
 }
 playClip(run);
}
function playClip(run){
 const clips=[String(draft.step)];
 if(draft.step===4)clips.push(...String(draft.seq).padStart(3,"0").split("").map(n=>"n"+n),"wait");
 function next(){
   if(run!==playId||!clips.length)return;
   player=new Audio("/voice/"+clips.shift()+".wav");player.onended=next;
   player.play().catch(()=>{if(run===playId)$("msg").textContent="Không phát được hướng dẫn. Kiểm tra loa rồi nhấn Nghe lại.";});
 }
 next();
}
function el(tag,text){const e=document.createElement(tag);e.textContent=text;return e;}
function button(text,fn,alt=false,parent=$("view")){const b=el("button",text);if(alt)b.className="alt";b.onclick=()=>{if(!busy)fn();};parent.append(b);}
function input(label,value="",enter){const i=el("input","");i.value=value;i.placeholder=label;i.setAttribute("aria-label",label);i.autocomplete="off";i.onkeydown=e=>{if(e.key==="Enter"&&!busy)enter();};$("view").append(i);i.focus();return i;}
async function post(path,body){const r=await authenticatedFetch("/api/kiosk/"+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(18000)});if(!r.headers.get("content-type")?.includes("json"))throw Error("Phiên Firebase hết hạn. Tải lại và đăng nhập bằng tài khoản quầy.");const v=await r.json();if(!r.ok){const e=Error(v.message||v.error);e.status=r.status;throw e;}return v;}
async function act(fn){busy=true;try{await fn();}catch(e){$("msg").textContent=e.message||"Không gửi được yêu cầu. Vui lòng thử lại.";}finally{busy=false;}}
function go(n){draft.step=n;save();draw(true);}
function reset(){clearTimeout(timer);draft=fresh();go(0);}
function draw(speak=false){
 const n=draft.step;const prompt=prompts[n]||(n===3?'Bạn có '+draft.codes.length+' đơn. Kiểm tra và nhấn Lấy số thứ tự.':'Số thứ tự của bạn là '+draft.seq+'. Vui lòng chờ gọi số.');
 $("step").textContent=n===0?"QUẦY TỰ PHỤC VỤ":'BƯỚC '+n+' / 4';$("title").textContent=labels[n];$("hint").textContent=prompt;$("view").replaceChildren();$("msg").textContent="";
 $("repeat").onclick=()=>say(prompt);if(speak)say(prompt);
 if(n===0){button("Bắt đầu",()=>go(1));return;}
 if(n===1){const next=()=>{if(!i.value.trim())return i.focus();draft.name=i.value.trim();go(2);};const i=input("Tên rider",draft.name,next);i.maxLength=80;button("Tiếp tục",next);return;}
 if(n===2){
 const add=()=>act(async()=>{const code=i.value.trim();if(!code)return;if(draft.codes.includes(code))throw Error("Bạn đã thêm mã này.");if(draft.codes.length>=20)throw Error("Mỗi phiếu có thể chứa tối đa 20 đơn.");await post("check",{code});playScanChime();draft.codes.push(code);save();draw();$("msg").textContent="Đã thêm "+code;});
 const i=input("Mã vận đơn","",add);button("Thêm mã",add);const list=el("ul","");for(const c of draft.codes){const li=el("li",c+" ");button("Bỏ",()=>{draft.codes=draft.codes.filter(x=>x!==c);save();draw();},true,li);list.append(li);}$("view").append(list);
 if(draft.codes.length)button("Kiểm tra",()=>go(3));button("Sửa tên",()=>go(1),true);return;
 }
 if(n===3){$("view").append(el("p",draft.name+" · "+draft.codes.join(" · ")));
 button(draft.pending?"Kiểm tra lại số chờ":"Lấy số thứ tự",()=>act(async()=>{draft.pending=true;save();
 try{const r=await post("register",{driver_name:draft.name,codes:draft.codes,request_id:draft.key});playScanChime();draft.seq=r.seq;go(4);}
 catch(e){if([400,409].includes(e.status)){draft.pending=false;save();draw();}else draw();throw e;}}));
 if(!draft.pending)button("Sửa danh sách",()=>go(2),true);return;}
 const num=el("strong",String(draft.seq).padStart(3,"0"));num.className="num";$("view").append(num);button("Hoàn tất",reset);timer=setTimeout(reset,20000);
}
window.speechSynthesis?.getVoices();window.speechSynthesis?.addEventListener?.("voiceschanged",()=>window.speechSynthesis.getVoices());const kiosk=await gate();if(kiosk){document.querySelector("header").textContent="IFC_01 Handover · Quầy "+kiosk.kioskWarehouse;draw();}
