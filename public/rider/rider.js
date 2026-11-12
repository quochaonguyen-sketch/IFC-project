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
function playReadyChime(){
  try{
    const ctx=getAudioCtx();if(!ctx)return;const now=ctx.currentTime;
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type="sine";
    osc.frequency.setValueAtTime(523.25,now);
    osc.frequency.setValueAtTime(659.25,now+0.12);
    osc.frequency.setValueAtTime(783.99,now+0.24);
    osc.frequency.setValueAtTime(1046.5,now+0.36);
    gain.gain.setValueAtTime(0.4,now);
    gain.gain.exponentialRampToValueAtTime(0.0001,now+0.75);
    osc.connect(gain);gain.connect(ctx.destination);
    osc.start(now);osc.stop(now+0.75);
  }catch(e){console.warn("Ready chime error:",e);}
}
function triggerVibrate(pattern){
  try{if(typeof navigator!=="undefined"&&navigator.vibrate)navigator.vibrate(pattern);}catch{}
}
function requestNotificationPermission(){
  try{if(typeof window!=="undefined"&&"Notification" in window&&Notification.permission==="default"){Notification.requestPermission().catch(()=>{});}}catch{}
}
function showSystemNotification(title,body){
  try{if(typeof window!=="undefined"&&"Notification" in window&&Notification.permission==="granted"){new Notification(title,{body,icon:"/favicon.ico",tag:"rider-ready",renotify:true});}}catch{}
}

import {browserHandoff} from "/rider/browser-handoff.js?v=0.7.2";
const $=id=>document.getElementById(id);
const rawCode=(location.hash.slice(1)||"").trim();
const code=(rawCode.toLowerCase()==="b5edaac0-78a3-40eb-9e33-84022dd87248"?"vnhcm1":rawCode),storeKey="ifc-pickup-"+code;
const callKey = "ifc-call-" + code;
function fresh(){return {step:0,name:"",keys:[],requestId:crypto.randomUUID(),token:crypto.randomUUID(),pending:false,receipt:null,entry:"",day:""};}
function readDraft(){try{const draft=JSON.parse(sessionStorage.getItem(storeKey))||fresh();if(draft.step===1)draft.step=2;if(!draft.token||!/^[a-f0-9-]{36}$/i.test(draft.token))draft.token=crypto.randomUUID();if(!draft.requestId||!/^[a-f0-9-]{36}$/i.test(draft.requestId))draft.requestId=crypto.randomUUID();return draft;}catch{return fresh();}}
let draft=readDraft(),ready=false,busy=false,timer,voicePlayer,voiceRun=0,pendingVoice=null,voiceBlocked=false,lastPrompt="",lastClip="welcome",stationName="";
const save=()=>{try{sessionStorage.setItem(storeKey,JSON.stringify(draft));}catch{}};
const el=(tag,text="",className="")=>{const n=document.createElement(tag);n.textContent=text;n.className=className;return n;};
function stopVoice(keepPending=false){
  voiceRun++;window.speechSynthesis?.cancel();
  if(voicePlayer){voicePlayer.pause();voicePlayer.onended=voicePlayer.onerror=null;}
  if(!keepPending)pendingVoice=null;
  voiceBlocked=!!pendingVoice;
}
function voiceNotice(text){voiceBlocked=true;$("voice-note").textContent=text;}
function clearNotice(){$("voice-note").textContent="";voiceBlocked=false;}
function say(line,clip=lastClip,done){
  lastPrompt=line;lastClip=clip;stopVoice();
  pendingVoice={line,clip,done};
  if(document.hidden||$("support-dialog").open){voiceBlocked=true;return;}
  const run=voiceRun;let fallbackStarted=false;
  const complete=()=>{if(run!==voiceRun)return;pendingVoice=null;clearNotice();done?.();};
  const nativeFallback=()=>{
    if(run!==voiceRun||fallbackStarted)return;fallbackStarted=true;voicePlayer?.pause();
    const synth=window.speechSynthesis,voices=(synth?.getVoices()||[]).filter(v=>/^vi(?:-|_|\b)/i.test(v.lang));
    const voice=voices.sort((a,b)=>(/hoai|hoài|natural|neural|google/i.test(b.name)?1:0)-(/hoai|hoài|natural|neural|google/i.test(a.name)?1:0))[0];
    if(!voice||typeof SpeechSynthesisUtterance!=="function"){voiceNotice("Chưa phát được giọng đọc. Bạn có thể bấm Nghe hướng dẫn để thử lại.");return;}
    const utterance=new SpeechSynthesisUtterance(line);
    utterance.voice=voice;utterance.lang=voice.lang||"vi-VN";utterance.rate=.95;utterance.pitch=1;utterance.volume=.8;
    utterance.onend=complete;utterance.onerror=()=>{if(run===voiceRun)voiceNotice("Bạn có thể bấm Nghe hướng dẫn để thử lại.");};
    clearNotice();synth.speak(utterance);
  };
  const clips=[clip];if(clip==="receipt")clips.push(...String(draft.receipt?.seq||0).split("").map(n=>"n"+n),"wait");
  const next=()=>{
    if(run!==voiceRun)return;if(!clips.length){complete();return;}
    // Reuse the player unlocked by a tap for later status announcements and sequence digits.
    const name = clips.shift();
    const version = name === "welcome" ? "0.8.12" : "0.7.7";
    voicePlayer ||= new Audio();
    voicePlayer.src = "/voice/rider-" + name + ".mp3?v=" + version;
    voicePlayer.volume=.8;voicePlayer.onended=next;voicePlayer.onerror=nativeFallback;
    voicePlayer.play().then(()=>{if(run===voiceRun)clearNotice();}).catch(error=>{
      if(run!==voiceRun)return;
      if(error.name==="NotAllowedError")voiceNotice("Loa sẽ phát khi bạn thao tác trên trang.");
      else nativeFallback();
    });
  };
  next();
}
function resumeVoice(){
  if(!voiceBlocked||!pendingVoice||document.hidden||$("support-dialog").open)return;
  voiceBlocked=false;
  const {line,clip,done}=pendingVoice;say(line,clip,done);
}
function handleUserTouch(e){
  getAudioCtx();
  requestNotificationPermission();
  if(!voiceBlocked||!pendingVoice)return;
  if(e?.target&&typeof e.target.closest==="function"&&e.target.closest("button,input"))return;
  resumeVoice();
}
const welcomePrompt = "Xin chào bác tài. Bạn làm theo hướng dẫn trên màn hình để đăng ký lấy hàng nhé.";
function playWelcomeAfterLoad() {
  lastPrompt = welcomePrompt;
  lastClip = "welcome";
  if (document.readyState === "complete") {
    say(welcomePrompt, "welcome");
    return;
  }
  const scheduledRun = voiceRun;
  window.addEventListener("load", () => {
    if (scheduledRun === voiceRun) say(welcomePrompt, "welcome");
  }, {once: true});
}
const readyPrompt="Đơn đã sẵn sàng. Mời bác tài vào nhận hàng theo hướng dẫn của nhân viên.";
function announceReady(){
  if(draft.step!==4||draft.receipt?.workflow_status!=="PICKED"||draft.readyAnnounced||pendingVoice?.clip==="ready")return;
  const requestId=draft.requestId;
  playReadyChime();
  triggerVibrate([400,200,400,200,600]);
  showSystemNotification("IFC Handover · Đơn đã sẵn sàng!","Mời bác tài vào nhận hàng theo hướng dẫn của nhân viên.");
  say(readyPrompt,"ready",()=>{if(draft.requestId===requestId){draft.readyAnnounced=true;save();}});
}

function message(text,good=false,clip){$("message").textContent=text;$("message").className=good?"success":"";if($("confirm-dialog").open)$("confirm-message").textContent=text;if(clip)say(text,clip);}
async function api(action,extra={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),16000);
  try{const r=await fetch("/api/rider/pickup",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({code,token:draft.token,request_id:draft.requestId,action,...extra}),signal:controller.signal});
    const data=await r.json();if(!r.ok){const e=Error(data.message||"Chưa gửi được yêu cầu. Vui lòng thử lại.");e.status=r.status;e.results=data.results;throw e;}return data;
  }finally{clearTimeout(timeout);}
}
function buttonsDisabled(value){
  busy=value;$("view").querySelectorAll("button,input").forEach(b=>b.disabled=value||draft.pending);
  $("confirm-dialog").querySelectorAll("button").forEach(b=>b.disabled=value);
  const finish=$("finish-rider");if(finish)finish.disabled=value||draft.pending||!draft.keys.length;
}
async function act(fn){if(busy)return;buttonsDisabled(true);try{await fn();}catch(e){message(e.name==="AbortError"||e.name==="TypeError"?"Mạng đang chậm. Giữ nguyên trang và bấm thử lại.":e.message,false,"error");}finally{buttonsDisabled(false);}}
function button(text,fn,secondary=false,parent=$("view")){const b=el("button",text,secondary?"secondary":"primary");b.type="button";b.onclick=()=>{if(!busy)fn();};parent.append(b);return b;}
function field(label,value,options={}){
  const l=el("label",label,"input-label"),i=el("input");i.id="rider-input";l.htmlFor=i.id;i.value=value;i.maxLength=100;i.autocomplete="off";
  i.spellcheck=false;i.className="code";i.autocapitalize="characters";i.inputMode="text";i.placeholder="Ví dụ: 8A2";
  i.oninput=()=>{draft.entry=i.value;save();};i.onkeydown=e=>{if(e.key==="Enter"&&!e.isComposing){e.preventDefault();options.enter?.();}};$("view").append(l);(options.parent||$("view")).append(i);return i;
}
function openConfirmation(){
  if(!draft.keys.length)return message("Thêm ít nhất một mã đơn trước khi kết thúc.");
  if(!draft.pending&&$("rider-input")?.value.trim())return message("Bạn còn mã chưa thêm. Bấm Thêm đơn trước khi kết thúc.");
  draft.step=3;save();
  const orders=$("confirm-orders");orders.replaceChildren();
  for(const key of draft.keys)orders.append(el("li",key));
  $("confirm-count").textContent="Kiểm tra lại "+draft.keys.length+" mã đơn trước khi xác nhận.";
  $("confirm-message").textContent=draft.pending?"Yêu cầu có thể đã tới kho. Bấm thử lại để lấy đúng số, tránh tạo lượt mới.":"";
  $("confirm-submit").textContent=draft.pending?"Thử lại · Kiểm tra số đã gửi":"Xác nhận";
  $("confirm-back").hidden=draft.pending;
  if(!$("confirm-dialog").open)$("confirm-dialog").showModal();
  if(!draft.pending)say("Bạn kiểm tra lại các mã đơn, rồi bấm Xác nhận để lấy số thứ tự.","review");
}
function closeConfirmation(){if(busy||draft.pending)return;$("confirm-dialog").close();stopVoice();lastPrompt="Nhập ba ký tự cuối đơn hàng, rồi bấm Thêm đơn.";lastClip="codes";draft.step=2;save();$("rider-input")?.focus();}
$("confirm-back").onclick=closeConfirmation;
$("confirm-dialog").addEventListener("cancel",e=>{e.preventDefault();closeConfirmation();});
$("confirm-submit").onclick=()=>act(async()=>{
  draft.pending=true;save();$("confirm-back").hidden=true;$("confirm-message").textContent="Đang lấy số thứ tự…";
  try{
    const receipt=await api("register",{...(draft.name?{driver_name:draft.name}:{}),keys:draft.keys});
    playScanChime();triggerVibrate([150,80,150]);
    draft.receipt=receipt;draft.supportToken=null;draft.pending=false;$("confirm-dialog").close();go(4);
  }catch(e){
    if([400,409].includes(e.status)){draft.pending=false;if(e.results)e.message=e.results.filter(v=>v.state!=="ready").map(v=>v.key+": "+v.message).join(" ");}
    save();$("confirm-back").hidden=draft.pending;$("confirm-submit").textContent=draft.pending?"Thử lại · Kiểm tra số đã gửi":"Xác nhận";throw e;
  }
});
function go(step,speak=true){draft.step=step;save();draw(speak);}
function list(editable){const ul=el("ul","","order-list");for(const key of draft.keys){const li=el("li"),body=el("div","","row-body");body.append(el("strong",key),el("small","Mã cuối bạn đã nhập"));li.append(body);if(editable){const b=el("button","Xóa","remove");b.type="button";b.setAttribute("aria-label","Xóa mã "+key);b.onclick=()=>{if(busy)return;draft.keys=draft.keys.filter(k=>k!==key);save();draw();};li.append(b);}ul.append(li);}$("view").append(ul);}
function draw(speak=false){
  $("view").replaceChildren();message("");clearTimeout(timer);
  const step=draft.step===3?2:draft.step;
  const titles={0:"Lấy hàng tại kho",2:"Nhập 3 mã cuối đơn hàng",3:"Kiểm tra và lấy số",4:"Số thứ tự của bạn"};
  const picked=step===4&&draft.receipt?.workflow_status==="PICKED";
  const hints={0:"Xin chào bác tài! Bấm Bắt đầu đăng ký để nhập mã đơn và lấy số.",2:"",3:"Kiểm tra các mã đã nhập. Bấm Lấy số để nhân viên bắt đầu xử lý.",4:picked?readyPrompt:"Giữ trang này để xem thông báo. Chờ nhân viên gọi số trước khi nhận hàng."};
  const clips={0:"welcome",2:"codes",3:"review",4:"receipt"};
  $("title").textContent=titles[step];$("hint").textContent=hints[step];$("hint").hidden=!hints[step];$("step").textContent=step===0?"XIN CHÀO BÁC TÀI":step===4?"ĐÃ ĐĂNG KÝ":"BƯỚC "+(step-1)+" / 2";
  lastPrompt=picked?readyPrompt:step===4?"Số thứ tự của bạn là "+draft.receipt?.seq+". Vui lòng chờ nhân viên gọi số.":step===0?welcomePrompt:hints[step]||"Nhập ba ký tự cuối đơn hàng, rồi bấm Thêm đơn.";lastClip=picked?"ready":clips[step];if(speak)say(lastPrompt,lastClip);
  if(step===0){
    const b=button("Bắt đầu đăng ký",()=>{playScanChime();go(2);});
    b.id="btn-start";
    b.className="primary btn-start";
    return;
  }
  if(step===2){
    const add=()=>act(async()=>{
      const key=i.value.normalize("NFKC").trim().toUpperCase();
      if(!/^[A-Z0-9_-]{3,100}$/.test(key))return message("Nhập ít nhất 3 ký tự cuối mã đơn, gồm chữ hoặc số.",false,"codes");
      if(draft.keys.includes(key))return message("Bạn đã thêm mã này.",false,"duplicate");
      if(draft.keys.length>=20)return message("Mỗi lượt tối đa 20 đơn.",false,"error");
      const r=await api("check",{keys:[...draft.keys,key]});const bad=r.results.find(v=>v.state!=="ready");
      if(bad)return message(bad.key+": "+bad.message,false,bad.state==="ambiguous"?"ambiguous":"error");
      draft.keys.push(key);draft.entry="";save();draw();playScanChime();triggerVibrate(80);message("Đã thêm mã "+key+". Có "+draft.keys.length+" đơn.",true,"added");$("rider-input")?.focus();
    });
    const row=el("div","","rider-entry-row");
    const i=field("Mã đơn hàng",draft.entry,{enter:add,parent:row});button("+ Thêm đơn",add,false,row);$("view").append(row);
    const finish=button("Kết thúc",openConfirmation);finish.id="finish-rider";finish.disabled=!draft.keys.length;
    if(draft.keys.length){$("view").append(el("p","Đã thêm "+draft.keys.length+" / 20 đơn","count"));list(true);}
    if(draft.step===3)openConfirmation();
    return;
  }
  const receipt=draft.receipt;
  if(picked){
    const readyBox=el("div","","ready-banner");
    readyBox.append(el("div","🔔 ĐƠN HÀNG ĐÃ SẴN SÀNG!","ready-banner-title"),el("p","Mời bác tài vào nhận hàng theo hướng dẫn của nhân viên.","ready-banner-desc"));
    $("view").append(readyBox);
  }
  $("view").append(el("p",stationName,"ticket-label"),el("div",String(receipt.seq).padStart(3,"0"),"number"),el("p",receipt.ticket_no,"ticket-label"),el("div",receipt.status||"Phiếu đang xử lý","status"),el("p",(draft.name?draft.name+" · ":"")+receipt.order_count+" đơn","summary"));list(false);
  button("Cập nhật trạng thái",()=>act(updateReceipt),true);
  button("Đăng ký lượt mới", () => {
    if (!confirm("Bắt đầu lượt mới? Lượt đã gửi vẫn nằm trong hàng đợi của kho.")) return;
    sessionStorage.removeItem(callKey);
    const day = draft.day;
    draft = fresh();
    draft.day = day;
    go(0);
  }, true);
  timer=setTimeout(()=>{if(!document.hidden&&!busy)updateReceipt().catch(()=>timer=setTimeout(()=>draw(),15000));else timer=setTimeout(()=>draw(),15000);},5000);
}
async function assistedReceipt(token) {
  const response = await fetch("/api/rider/call", {
    method: "POST", headers: {"Content-Type": "application/json"}, cache: "no-store",
    body: JSON.stringify({code, token, action: "receipt"}),
    signal: globalThis.AbortSignal?.timeout?.(12000)
  });
  if (!response.ok) throw Error("Chưa cập nhật được số lấy hàng. Vui lòng thử lại.");
  return (await response.json()).receipt;
}
function receiveAssistedReceipt(receipt, token) {
  if (!receipt?.ticket_no || !token || token !== draft.supportToken || token === draft.receiptSupportToken) return;
  draft = {...fresh(), day: draft.day, supportToken: token, receiptSupportToken: token, receipt};
  if ($("support-dialog").open) $("close-support").textContent = "Xem số lấy hàng";
  go(4, receipt.workflow_status !== "PICKED");
  announceReady();
}
async function recoverAssistedReceipt() {
  const token = draft.supportToken;
  if (token && token !== draft.receiptSupportToken) {
    receiveAssistedReceipt(await assistedReceipt(token), token);
  }
}
async function updateReceipt(){
  const requestId = draft.requestId;
  const r = draft.receiptSupportToken ? await assistedReceipt(draft.receiptSupportToken) : await api("status");
  if(draft.requestId!==requestId||draft.step!==4)return;
  if (!r) throw Error("Chưa cập nhật được số lấy hàng. Vui lòng thử lại.");
  draft.receipt=r;save();draw();announceReady();
}
$("repeat").onclick=()=>{if(pendingVoice&&voiceBlocked)resumeVoice();else if(draft.step===4&&draft.receipt?.workflow_status==="PICKED"&&!draft.readyAnnounced)announceReady();else say(lastPrompt,lastClip);};
document.addEventListener("click",handleUserTouch);
document.addEventListener("keydown",handleUserTouch);
document.addEventListener("touchstart",handleUserTouch,{passive:true});
$("support").onclick = () => {
  if (busy) return;
  const previous = sessionStorage.getItem(callKey);
  draft.supportToken = previous && previous !== draft.receiptSupportToken ? previous : crypto.randomUUID();
  sessionStorage.setItem(callKey, draft.supportToken);
  save();
  stopVoice(true);
  $("close-support").textContent = "Quay lại nhập đơn";
  $("support-frame").src = "/rider/call.html#" + encodeURIComponent(code);
  $("support-dialog").showModal();
};
window.addEventListener("message", event => {
  const frame = $("support-frame");
  if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== "ifc-assisted-receipt") return;
  receiveAssistedReceipt(event.data.receipt, event.data.token);
});
function closeSupport(){
  const frame=$("support-frame");try{frame.contentWindow?.document.getElementById("end")?.click();}catch{}
  try{const token=sessionStorage.getItem(callKey);if(token){
    fetch("/api/rider/call",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"cancel",code,token}),keepalive:true}).catch(()=>{});sessionStorage.removeItem(callKey);
  }}catch{}frame.src="about:blank";resumeVoice();
  recoverAssistedReceipt().catch(() => {});
}
$("close-support").onclick=()=>$("support-dialog").close();$("support-dialog").addEventListener("close",closeSupport);
document.addEventListener("visibilitychange",()=>{if(document.hidden)stopVoice(true);else if(ready&&draft.step===4&&!busy)updateReceipt().then(resumeVoice).catch(resumeVoice);else resumeVoice();});
window.addEventListener("pagehide",()=>{stopVoice();clearTimeout(timer);});
window.speechSynthesis?.getVoices();window.speechSynthesis?.addEventListener("voiceschanged",()=>window.speechSynthesis.getVoices());
await browserHandoff($("browser-help"),location.href);
function showWarehousePicker(msgText = ""){
  $("hint").textContent = "Xin chào bác tài! Quét mã QR tại kho hoặc chọn kho bên dưới để đăng ký lấy hàng.";
  message(msgText);
  $("view").replaceChildren();
  button("👉 Kho VNHCM1 (Quận 7)",()=>{location.hash="vnhcm1-kiosk-qr";location.reload();});
  button("👉 Kho WH1",()=>{location.hash="wh1-kiosk-qr";location.reload();},true);
  button("Kho VNWL (Tân Bình)",()=>{location.hash="vnwl-kiosk-qr";location.reload();},true);
  button("Kho VNHCM2 (Thủ Đức)",()=>{location.hash="vnhcm2-kiosk-qr";location.reload();},true);
  button("Kho VNHCM3 (Quận 9)",()=>{location.hash="vnhcm3-kiosk-qr";location.reload();},true);
  button("Kho WH2",()=>{location.hash="wh2-kiosk-qr";location.reload();},true);
  button("Kho WH3",()=>{location.hash="wh3-kiosk-qr";location.reload();},true);
}
if(!code){
  showWarehousePicker();
  playWelcomeAfterLoad();
}
else {
  async function connect(){
    $("hint").textContent = draft.step === 0 ? "Xin chào bác tài! Đang kết nối với kho…" : "Đang kết nối với kho…";
    await act(async()=>{
      const info=await api("info");
      if(draft.day&&draft.day!==info.day){draft=fresh();}
      draft.day=info.day;save();
      stationName=info.name||info.station;
      $("station").textContent=stationName;
      $("support").disabled=false;
      ready=true;
      draw(draft.step !== 0 && draft.step !== 4);
      if (draft.step === 0) playWelcomeAfterLoad();
      if(draft.step===4)updateReceipt().catch(()=>{});
      recoverAssistedReceipt().catch(() => {});
    });
    if(!ready){
      showWarehousePicker("Không kết nối được mã QR này. Hãy chọn kho của bạn để tiếp tục:");
    }
  }
  await connect();
}
