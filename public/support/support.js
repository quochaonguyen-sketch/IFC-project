import {guestVideo} from "/support/guest-video.js?v=0.7.6";
import {gate,authenticatedFetch} from "/auth-client.js";

const el=(tag,text="",className="")=>{
  const n=document.createElement(tag);
  if(text)n.textContent=text;
  if(className)n.className=className;
  return n;
};

let me, socket, keepAlive, panel, launch;
let currentCall=null, activeCallItem=null, localStream=null, peer=null, targetEmail="", pendingIce=[], activeStation="";
let audioCtx = null;
let ringtoneTimer = null;
let isRinging = false,ringingCallId=null,acceptingCall=null;
const endingCalls=new Set();
let callBanner = null;
let isMuted = false;
let onDuty = false;
let callStartTime = null,timedCallId=null;
let callDurationTimer = null;
const heldCalls = new Map();
const knownCallIds = new Set();
const mobileIssue = "Yêu cầu QR gọi từ điện thoại";
const isGuestCall=item=>item.video_mode?item.video_mode==="ifc_guest":item.issue===mobileIssue;

function getAudioCtx(){
  if(!audioCtx){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(AC)audioCtx=new AC();
  }
  if(audioCtx&&audioCtx.state==="suspended"){
    audioCtx.resume().catch(()=>{});
  }
  return audioCtx;
}

function unlockAudio(){
  const ctx=getAudioCtx();
  if(ctx&&ctx.state==="suspended"){
    ctx.resume().catch(()=>{});
  }
}
window.addEventListener("pointerdown",unlockAudio,{passive:true});
window.addEventListener("keydown",unlockAudio,{passive:true});
window.addEventListener("touchstart",unlockAudio,{passive:true});

function playRingToneBurst(){
  try{
    const ctx=getAudioCtx();
    if(!ctx)return;
    if(ctx.state==="suspended")ctx.resume().catch(()=>{});
    const t=ctx.currentTime;
    const bursts=[
      {start:t,end:t+0.42},
      {start:t+0.54,end:t+0.96}
    ];
    for(const b of bursts){
      const osc1=ctx.createOscillator(),osc2=ctx.createOscillator(),gain=ctx.createGain();
      osc1.type="sine";osc1.frequency.setValueAtTime(853,b.start);
      osc2.type="sine";osc2.frequency.setValueAtTime(960,b.start);
      gain.gain.setValueAtTime(0.001,b.start);
      gain.gain.exponentialRampToValueAtTime(0.65,b.start+0.04);
      gain.gain.setValueAtTime(0.65,b.end-0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001,b.end);
      osc1.connect(gain);osc2.connect(gain);gain.connect(ctx.destination);
      osc1.start(b.start);osc1.stop(b.end);
      osc2.start(b.start);osc2.stop(b.end);
    }
  }catch(err){console.warn("Ring tone error:",err);}
}

function showRingingBanner(show,title="",desc="",item=null){
  if(!show){
    if(callBanner){
      callBanner.style.display="none";
      callBanner.hidden=true;
      callBanner.classList.remove("ringing");
      callBanner.remove();
      callBanner=null;
    }
    const existing=document.getElementById("cs-incoming-call-alert");
    if(existing)existing.remove();
    return;
  }
  if(!callBanner){
    callBanner=document.createElement("div");
    callBanner.id="cs-incoming-call-alert";
    callBanner.className="cs-call-alert";
    callBanner.innerHTML=`<div class="cs-call-alert-content"><span class="cs-call-alert-bell">🔔</span><div class="cs-call-alert-body"><div class="cs-call-alert-title" data-caller-title>🚨 CÓ CUỘC GỌI HỖ TRỢ ĐẾN!</div><div class="cs-call-alert-desc" data-caller-desc>Tài xế đang gọi hỗ trợ tại kho...</div></div></div><div class="cs-call-alert-actions"><button type="button" class="cs-btn-answer-banner" data-btn-answer-banner>📞 Nhận cuộc gọi</button><button type="button" class="cs-btn-silence" data-btn-silence>🔕 Tắt chuông</button></div>`;
    callBanner.querySelector("[data-btn-silence]").onclick=()=>{
      stopIncomingCallRingtone();
      report("Đã tắt tiếng chuông gọi đến.");
    };
    document.body.prepend(callBanner);
  }
  const answerBtn=callBanner.querySelector("[data-btn-answer-banner]");
  if(answerBtn){
    if(item){
      answerBtn.hidden=false;
      answerBtn.onclick=()=>{
        stopIncomingCallRingtone();
        const acceptBtn=panel?.querySelector(`[data-accept-call="${item.call_id}"]`);
        if(acceptBtn)acceptBtn.click();
        else if(isGuestCall(item)){const row=el("div");mobileAgent(item,row);row.children[0]?.click();}
        else acceptCall(item);
      };
    }else{
      answerBtn.hidden=true;
    }
  }
  if(title){
    const titleEl=callBanner.querySelector("[data-caller-title]");
    if(titleEl)titleEl.textContent=title;
  }
  if(desc){
    const descEl=callBanner.querySelector("[data-caller-desc]");
    if(descEl)descEl.textContent=desc;
  }
  callBanner.style.display="flex";
  callBanner.hidden=false;
  callBanner.classList.add("ringing");
}

function startIncomingCallRingtone(info={}){
  if(!onDuty||currentCall||acceptingCall||isRinging)return;
  ringingCallId=info.call_id;
  if(info.call_id)knownCallIds.add(info.call_id);
  const station=info.station||"";
  const rider=info.rider_name||"Tài xế";
  const issue=info.issue||"cần hỗ trợ tại kho";
  showRingingBanner(true,`🚨 CUỘC GỌI MỚI TẠI ${station||"KHO"}!`,`${rider} · ${issue}`,info);
  if(isRinging)return;
  isRinging=true;
  playRingToneBurst();
  if(ringtoneTimer)clearInterval(ringtoneTimer);
  ringtoneTimer=setInterval(()=>{
    if(!isRinging){clearInterval(ringtoneTimer);ringtoneTimer=null;return;}
    playRingToneBurst();
  },2300);
}

function stopIncomingCallRingtone(){
  isRinging=false;ringingCallId=null;
  if(ringtoneTimer){
    clearInterval(ringtoneTimer);
    ringtoneTimer=null;
  }
  showRingingBanner(false);
}

function testRingtone(){
  unlockAudio();
  playRingToneBurst();
  report("🔊 Đã phát chuông điện thoại thử nghiệm! Âm thanh hoạt động bình thường.");
}

function playScanChime(){
  try{
    unlockAudio();
    const ctx=getAudioCtx();if(!ctx)return;
    const now=ctx.currentTime;
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type="sine";
    osc.frequency.setValueAtTime(1046.5,now);
    osc.frequency.setValueAtTime(1318.5,now+0.08);
    gain.gain.setValueAtTime(0.5,now);
    gain.gain.setValueAtTime(0.5,now+0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001,now+0.32);
    osc.connect(gain);gain.connect(ctx.destination);
    osc.start(now);osc.stop(now+0.32);
  }catch(e){console.warn("Scan chime error:",e);}
}

async function call(path,options={}){
  const r=await authenticatedFetch(path,options);
  const v=await r.json().catch(()=>({}));
  if(!r.ok){
    const error=Error(v.message||v.error||"Không thể xử lý cuộc gọi.");
    error.status=r.status;error.code=v.code;error.accepted_by=v.accepted_by;
    throw error;
  }
  return v;
}

const postSupport=(action,data)=>call("/api/support/"+action,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});

function sendSignal(type,payload){
  if(socket?.readyState===WebSocket.OPEN&&currentCall&&targetEmail){
    socket.send(JSON.stringify({type:"support_signal",call_id:currentCall,signal_type:type,to_email:targetEmail,payload}));
  }
}

function report(message){
  const out=panel?.querySelector("[data-msg]");
  if(!out)return;
  out.textContent=message;
  if(!message){out.className="";return;}
  const isOk=message.startsWith("✓")||message.startsWith("Đã")||message.includes("thành công")||message.includes("Số chờ");
  out.className=isOk?"cs-report-ok":"cs-report-err";
}

function setMute(muted){
  isMuted=muted;
  if(localStream){
    for(const t of localStream.getAudioTracks())t.enabled=!isMuted;
  }
  const muteBtns=panel?.querySelectorAll("[data-btn-mute]");
  muteBtns?.forEach(btn=>{
    btn.innerHTML=isMuted
      ? `<span class="btn-icon">🔇</span> <span>Đang tắt mic</span>`
      : `<span class="btn-icon">🎙️</span> <span>Tắt mic</span>`;
    btn.className=isMuted?"cs-btn-mute is-muted":"cs-btn-mute";
    btn.setAttribute("aria-pressed",String(isMuted));
    btn.title=isMuted?"Bấm để bật lại micro":"Bấm để tắt tiếng micro";
  });
  report(isMuted?"🔇 Đã tắt tiếng micro (Rider không nghe thấy bạn).":"🎙️ Đã bật micro.");
}

function toggleMute(){
  setMute(!isMuted);
}

function closePeer(){
  if(peer){peer.ontrack=null;peer.onicecandidate=null;peer.close();peer=null;}
  pendingIce=[];
  const remote=panel?.querySelector("[data-remote]");
  if(remote){remote.pause();remote.srcObject=null;}
}

function clearMedia(){
  closePeer();
  if(localStream){
    for(const t of localStream.getTracks())t.stop();
    localStream=null;
  }
  const local=panel?.querySelector("[data-local]");
  if(local)local.srcObject=null;
  panel?.querySelector("[data-staff-kiosk-media]")?.remove();
}

function ensurePanel(){
  if(panel)return;
  panel=document.createElement("section");
  panel.id="ifc-support-panel";
  panel.hidden=true;
  document.body.append(panel);
}

function buildVideo(){
  const box=document.createElement("div");box.className="videos";
  const remote=document.createElement("video");remote.autoplay=true;remote.playsInline=true;remote.dataset.remote="1";
  const local=document.createElement("video");local.autoplay=true;local.muted=true;local.playsInline=true;local.dataset.local="1";
  box.append(remote,local);
  return box;
}

function setCurrent(id,other){
  currentCall=id;
  targetEmail=other||"";
  ensurePanel();
}

function assistWorkspace(){
  let box=panel.querySelector("[data-assist-workspace]");
  if(!box){
    box=el("div","","cs-assist-workspace");
    box.dataset.assistWorkspace="1";
    panel.querySelector("[data-active-call-content]")?.append(box);
  }
  return box;
}

async function ensureMedia(){
  if(!localStream){
    localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:{facingMode:"user"}});
    if(isMuted){
      for(const t of localStream.getAudioTracks())t.enabled=false;
    }
    const local=panel?.querySelector("[data-local]");
    if(local)local.srcObject=localStream;
  }
  return localStream;
}

async function createPeer(station){
  if(peer)return peer;
  activeStation=station||activeStation;
  const iceServers=(await call("/api/support/ice?station="+encodeURIComponent(activeStation))).iceServers;
  peer=new RTCPeerConnection({iceServers});
  for(const track of localStream?.getTracks()||[])peer.addTrack(track,localStream);
  peer.onicecandidate=e=>{if(e.candidate)sendSignal("ice",e.candidate.toJSON());};
  peer.ontrack=e=>{const remote=panel?.querySelector("[data-remote]");if(remote)remote.srcObject=e.streams[0];};
  peer.onconnectionstatechange=()=>{
    if(peer&&["failed","disconnected"].includes(peer.connectionState)){
      report("Kết nối video bị gián đoạn. Đang thử duy trì kết nối…");
    }
  };
  return peer;
}

async function takeIncomingSignal(e){
  if(e.call_id!==currentCall)return;
  if(e.signal_type==="hangup"){
    report("Rider đã kết thúc cuộc gọi.");
    clearMedia();
    currentCall=null;
    activeCallItem=null;
    stopGuestVideo?.();stopGuestVideo=null;guestCallId=null;
    updateWorkspace();
    await refreshInbox();
    return;
  }
  try{
    if(e.signal_type==="offer"){
      await ensureMedia();
      const p=await createPeer(me.kioskWarehouse);
      await p.setRemoteDescription(new RTCSessionDescription(e.payload));
      for(const candidate of pendingIce.splice(0))await p.addIceCandidate(candidate);
      const answer=await p.createAnswer();
      await p.setLocalDescription(answer);
      sendSignal("answer",p.localDescription.toJSON());
      report("Đang kết nối video hỗ trợ…");
    }else if(e.signal_type==="answer"&&peer){
      await peer.setRemoteDescription(new RTCSessionDescription(e.payload));
      for(const candidate of pendingIce.splice(0))await peer.addIceCandidate(candidate);
      report("Đã kết nối video hỗ trợ.");
    }else if(e.signal_type==="ice"){
      const candidate=new RTCIceCandidate(e.payload);
      if(peer?.remoteDescription)await peer.addIceCandidate(candidate);
      else pendingIce.push(candidate);
    }
  }catch(err){report("Không thiết lập được video: "+(err.message||"lỗi kết nối"));}
}

function showDuty(active){
  onDuty=active;
  const dutyBtn=panel?.querySelector("[data-btn-duty]");
  const dutyBadge=panel?.querySelector("[data-duty-badge]");
  if(dutyBtn){
    dutyBtn.innerHTML=active
      ? `<span class="cs-duty-pill-dot on"></span><span class="cs-duty-pill-text">🟢 Đang trực nhận đơn</span>`
      : `<span class="cs-duty-pill-dot off"></span><span class="cs-duty-pill-text">⏸️ Tắt chờ nhận đơn</span>`;
    dutyBtn.className=active?"cs-duty-btn on":"cs-duty-btn off";
    dutyBtn.setAttribute("aria-pressed",String(active));
    dutyBtn.title=active?"Bấm để tạm ngưng (Tắt chờ nhận đơn)":"Bấm để bắt đầu trực (Sẵn sàng nhận cuộc gọi)";
  }
  if(dutyBadge){
    dutyBadge.textContent=active?"🟢 Sẵn sàng nhận cuộc gọi":"⏸️ Tạm ngưng nhận cuộc gọi";
    dutyBadge.className=active?"cs-duty-badge on":"cs-duty-badge off";
  }
  const tagEl=panel?.querySelector("[data-stat-active-tag]");
  if(tagEl){
    tagEl.textContent=active?(currentCall?"Đang đàm thoại":"Đang trực"):"Đang nghỉ";
    tagEl.className="cs-metric-tag " + (active?"live":"off");
  }
  if(!active&&isRinging){
    stopIncomingCallRingtone();
  }
}

async function loadDuty(){
  try{
    const state=await call("/api/support/duty");
    showDuty(state.active);
  }catch(e){report(e.message);}
}

function startCallTimer(){
  if(timedCallId===currentCall&&callDurationTimer)return;timedCallId=currentCall;
  callStartTime=Date.now();
  if(callDurationTimer)clearInterval(callDurationTimer);
  const timerEl=panel?.querySelector("[data-call-timer]");
  callDurationTimer=setInterval(()=>{
    if(!currentCall||!callStartTime){
      clearInterval(callDurationTimer);callDurationTimer=null;
      if(timerEl)timerEl.textContent="00:00";
      return;
    }
    const sec=Math.floor((Date.now()-callStartTime)/1000);
    const m=String(Math.floor(sec/60)).padStart(2,"0");
    const s=String(sec%60).padStart(2,"0");
    if(timerEl)timerEl.textContent=`${m}:${s}`;
  },1000);
}

function stopCallTimer(){
  if(callDurationTimer){
    clearInterval(callDurationTimer);
    callDurationTimer=null;
  }
  callStartTime=null;timedCallId=null;
}

function updateMetrics(waitingCount=0){
  const waitingEl=panel?.querySelector("[data-stat-waiting]");
  const activeEl=panel?.querySelector("[data-stat-active]");
  const heldEl=panel?.querySelector("[data-stat-held]");
  if(waitingEl)waitingEl.textContent=String(waitingCount);
  if(activeEl)activeEl.textContent=currentCall?"1":"0";
  if(heldEl)heldEl.textContent=String(heldCalls.size);
  const queueBadge=panel?.querySelector("[data-queue-badge]");
  if(queueBadge)queueBadge.textContent=String(waitingCount);
  const heldBadge=panel?.querySelector("[data-held-badge]");
  if(heldBadge)heldBadge.textContent=String(heldCalls.size);
}

function updateWorkspace(){
  const forms=panel?.querySelector("[data-assist-forms]");
  if(forms){
    forms.hidden=!currentCall;
    forms.querySelectorAll("[data-assist]").forEach(form=>{form.hidden=form.dataset.assist!==currentCall;});
  }
  const idleCard=panel?.querySelector("[data-idle-card]");
  const activeCard=panel?.querySelector("[data-active-card]");
  if(!idleCard||!activeCard)return;
  if(currentCall&&activeCallItem){
    idleCard.hidden=true;
    activeCard.hidden=false;
    const titleEl=activeCard.querySelector("[data-call-rider-name]");
    const stationEl=activeCard.querySelector("[data-call-station-badge]");
    const queueEl=activeCard.querySelector("[data-call-queue-no]");
    if(titleEl)titleEl.textContent=activeCallItem.rider_name||"Tài xế";
    if(stationEl)stationEl.textContent=activeCallItem.station||"KHO";
    if(queueEl)queueEl.textContent=activeCallItem.queue_no?`Số chờ #${String(activeCallItem.queue_no).padStart(3,"0")}`:"Hỗ trợ trực tiếp";
    startCallTimer();
  }else{
    idleCard.hidden=false;
    activeCard.hidden=true;
    stopCallTimer();
  }
}

async function holdCurrentCall(){
  if(!currentCall){
    report("Không có cuộc gọi đang hoạt động để tạm giữ.");
    return;
  }
  const callId=currentCall;
  const item=activeCallItem||{call_id:callId,station:activeStation};
  report("Đang tạm giữ cuộc gọi…");
  try{
    await postSupport("hold",{call_id:callId});
    heldCalls.set(callId,{item,heldAt:Date.now()});
    if(localStream){
      for(const t of localStream.getAudioTracks())t.enabled=false;
    }
    const guestVideoBox=panel?.querySelector("[data-guest-video]");
    if(guestVideoBox)guestVideoBox.style.display="none";
    const assistBox=panel?.querySelector("[data-assist]");
    if(assistBox)assistBox.style.display="none";
    currentCall=null;
    activeCallItem=null;
    updateWorkspace();
    report(`✓ Đã tạm giữ cuộc gọi tại ${item.station||'kho'}. Bạn có thể nhận cuộc gọi khác từ hàng đợi.`);
    await refreshInbox();
  }catch(e){
    report("Không thể tạm giữ cuộc gọi: "+e.message);
  }
}

async function resumeHeldCall(item){
  report(`Đang tiếp tục cuộc gọi với ${item.rider_name||'Rider'}…`);
  try{
    if(currentCall&&currentCall!==item.call_id){
      await postSupport("hold",{call_id:currentCall});
      heldCalls.set(currentCall,{item:activeCallItem||{call_id:currentCall},heldAt:Date.now()});
      const oldVideo=panel?.querySelector(`[data-guest-video="${currentCall}"]`);
      if(oldVideo)oldVideo.style.display="none";
      const oldForm=panel?.querySelector(`[data-assist="${currentCall}"]`);
      if(oldForm)oldForm.style.display="none";
    }
    await postSupport("resume",{call_id:item.call_id});
    heldCalls.delete(item.call_id);
    currentCall=item.call_id;
    activeCallItem=item;
    if(localStream&&!isMuted){
      for(const t of localStream.getAudioTracks())t.enabled=true;
    }
    const guestBox=panel?.querySelector(`[data-guest-video="${item.call_id}"]`);
    if(guestBox){
      guestBox.style.display="";
    }else{
      openGuestVideo(item);
    }
    const assistBox=panel?.querySelector(`[data-assist="${item.call_id}"]`);
    if(assistBox){
      assistBox.style.display="";
    }else{
      assistedForm(item,null,true);
    }
    updateWorkspace();
    report(`✓ Đang tiếp tục cuộc gọi với ${item.rider_name||'Rider'} tại ${item.station}.`);
    await refreshInbox();
  }catch(e){
    report("Không thể tiếp tục cuộc gọi: "+e.message);
  }
}

async function startKioskMedia(item,accepted){
  clearMedia();
  const frames=buildVideo();frames.dataset.staffKioskMedia="1";
  panel.querySelector("[data-active-call-content]")?.append(frames);
  targetEmail=accepted.kiosk_email;report("Đã nhận cuộc gọi. Đang mở camera và micro…");
  await ensureMedia();
  const p=await createPeer(item.station),offer=await p.createOffer();
  await p.setLocalDescription(offer);sendSignal("offer",p.localDescription.toJSON());
}
async function acceptCall(item){
  if(acceptingCall||currentCall===item.call_id)return;
  if(currentCall){report("Bạn đang xử lý một cuộc gọi. Tạm giữ hoặc kết thúc trước khi nhận lượt khác.");return;}
  acceptingCall=item.call_id;currentCall=item.call_id;activeCallItem=item;activeStation=item.station;
  stopIncomingCallRingtone();let accepted;
  try{
    if(!onDuty){const state=await postSupport("duty",{active:true});showDuty(state.active);}
    accepted=await postSupport("accept",{call_id:item.call_id});
    const assigned={...item,...accepted,accepted_by:me.email};activeCallItem=assigned;
    if(isGuestCall(assigned))assistedFormAuto(assigned);
    else{assistedForm(assigned,null,true);await startKioskMedia(assigned,accepted);}
    updateWorkspace();report("Đã nhận cuộc gọi tại "+item.station+". Bạn đang phụ trách lượt này.");
    await refreshInbox(true);
  }catch(error){
    if(!accepted){clearMedia();currentCall=null;activeCallItem=null;}
    else{
      clearMedia();
      const retry=el("button","Thử lại camera / micro","secondary");retry.type="button";
      retry.onclick=async()=>{if(retry.disabled||currentCall!==item.call_id)return;retry.disabled=true;try{await startKioskMedia(item,accepted);retry.remove();}catch(e){report(e.message);retry.disabled=false;}};
      panel.querySelector(`[data-assist="${item.call_id}"]`)?.prepend(retry);
    }
    updateWorkspace();await refreshInbox(true);
    report(accepted?"Bạn đã nhận lượt này nhưng chưa kết nối được camera/micro. Hãy thử lại hoặc kết thúc hỗ trợ. "+error.message:error.message);
  }finally{acceptingCall=null;}
}
function mobileAgent(item,row){
  const accept=el("button",currentCall?"Đang bận · tạm giữ trước":"Nhận cuộc gọi","cs-btn-accept-call");
  accept.dataset.acceptCall=item.call_id;accept.disabled=!!currentCall||!!acceptingCall;
  accept.onclick=async()=>{
    if(accept.disabled)return;accept.disabled=true;accept.textContent="Đang nhận…";
    try{await acceptCall(item);}finally{accept.disabled=!!currentCall||!!acceptingCall;accept.textContent="Nhận cuộc gọi";}
  };
  row.append(accept);
}

function assistedFormAuto(item){
  if(isGuestCall(item))openGuestVideo(item);
  assistedForm(item,null,true);
  updateWorkspace();
}

let stopGuestVideo=null,guestCallId=null;
function openGuestVideo(item){
  if(guestCallId===item.call_id&&panel.querySelector("[data-guest-video]")?.childElementCount)return;
  if(currentCall&&currentCall!==item.call_id)throw Error("Hãy tạm giữ hoặc kết thúc cuộc gọi hiện tại trước.");
  stopGuestVideo?.();
  panel.querySelector("[data-guest-video]")?.remove();
  const container=el("section","","cs-guest-video-box");
  container.dataset.guestVideo=item.call_id;
  assistWorkspace().prepend(container);
  currentCall=item.call_id;
  guestCallId=item.call_id;
  activeCallItem=item;
  stopGuestVideo=guestVideo(container,data=>call("/api/support/guest-signals",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({call_id:item.call_id,...data}),
    signal:globalThis.AbortSignal?.timeout?.(12000)
  }),true,{autoStart:true,onEnded:error=>{
    if(guestCallId!==item.call_id)return;
    stopGuestVideo=null;guestCallId=null;currentCall=null;activeCallItem=null;
    container.remove();
    panel.querySelector(`[data-assist="${item.call_id}"]`)?.remove();
    updateWorkspace();
    report(error.message);
    refreshInbox();
  }});
  updateWorkspace();
}

function assistedForm(item,row,attachDirect=false){
  const openAction=()=>{
    let form=panel.querySelector(`[data-assist="${item.call_id}"]`);
    if(form){form.style.display="";return;}
    form=el("section","","cs-assist-card");
    form.dataset.assist=item.call_id;

    const title=el("h3",`📝 Nhập hộ đơn tại kho ${item.station}`,"cs-assist-title");
    const hint=el("p","Nhập thông tin tài xế và mã đơn để cấp số thứ tự lấy hàng tự động:","muted");

    const nameWrap=el("div","","cs-field");
    const nameLabel=el("label","Tên / Biển số tài xế:","cs-label");
    const name=el("input","","cs-input");
    name.placeholder="Ví dụ: Nguyễn Văn A hoặc 59X3-12345";
    name.value=item.rider_name&&item.rider_name!=="Rider"?item.rider_name:"";
    nameWrap.append(nameLabel,name);

    const codesWrap=el("div","","cs-field");
    const codesLabel=el("label","Mã đơn Shopee / Mã vận đơn (AWB):","cs-label");
    const codesHint=el("span","Scan barcode hoặc nhập mã đơn (cách nhau bởi dòng mới)","cs-field-hint");
    const codes=el("textarea","","cs-textarea");
    codes.placeholder="SPXVN0412345678\nSPXVN0498765432";
    codesWrap.append(codesLabel,codesHint,codes);

    const save=el("button","✓ Cấp số thứ tự lấy hàng cho Rider","cs-btn-submit");
    save.type="button";

    form.append(title,hint,nameWrap,codesWrap,save);

    save.onclick=async()=>{
      save.disabled=true;
      try{
        const v=await postSupport("register",{call_id:item.call_id,driver_name:name.value,codes:codes.value.split(/\s+/).filter(Boolean)});
        playScanChime();
        form.querySelector(".cs-seq-badge")?.remove();
        const badge=el("div","","cs-seq-badge");
        badge.innerHTML=`<div class="cs-seq-label">Số thứ tự đã cấp cho Rider</div><div class="cs-seq-number">${String(v.seq).padStart(3,"0")}</div><div class="cs-seq-hint">Phiếu: <strong>${v.ticket_no||""}</strong> · Đã lưu vào hàng đợi kho ${item.station}</div>`;
        form.append(badge);
        report(`✓ Đã cấp số chờ ${v.seq} cho rider ${name.value||""} tại ${item.station}`);
      }catch(e){
        report(e.message);
        save.disabled=false;
      }
    };

    if(isGuestCall(item)){
      const hasVideo=!!panel.querySelector("[data-guest-video]");
      if(!hasVideo){
        const start=el("button","📹 Mở cuộc gọi video trực tiếp","cs-btn-open-video");
        start.onclick=()=>{try{openGuestVideo(item);start.remove();}catch(e){report(e.message);}};
        form.prepend(start);
      }
    }

    (panel.querySelector("[data-assist-forms]")||assistWorkspace()).append(form);
  };

  if(attachDirect){
    openAction();
    return;
  }
  const open=el("button","Mở phiếu nhập hộ","cs-btn-open-form");
  open.dataset.openForm=item.call_id;
  open.onclick=openAction;
  row?.append(open);
}

async function endCall(kiosk=false,callIdToFinish=null){
  const callToClose=callIdToFinish||currentCall;
  if(!callToClose||endingCalls.has(callToClose))return;
  endingCalls.add(callToClose);
  try{
    await postSupport(kiosk?"cancel":"resolve",{call_id:callToClose});
    panel?.querySelector(`[data-assist="${callToClose}"]`)?.remove();heldCalls.delete(callToClose);
    if(callToClose===currentCall){
      sendSignal("hangup",{});stopGuestVideo?.();stopGuestVideo=null;guestCallId=null;
      panel?.querySelector("[data-guest-video]")?.remove();clearMedia();currentCall=null;activeCallItem=null;targetEmail="";
    }
    updateWorkspace();await refreshInbox(true);report("✓ Cuộc gọi đã kết thúc.");
  }catch(error){report("Chưa kết thúc được cuộc gọi. Hãy thử lại. "+error.message);}
  finally{endingCalls.delete(callToClose);}
}

let inboxRefresh,inboxVersion=0;
async function refreshInbox(invalidate=false){
  if(invalidate)inboxVersion++;
  if(inboxRefresh)return inboxRefresh;
  inboxRefresh=(async()=>{let version;do{version=inboxVersion;await loadInbox(version);}while(version!==inboxVersion);})().catch(e=>report("Không tải được danh sách cuộc gọi. "+e.message));
  try{await inboxRefresh;}finally{inboxRefresh=null;}
}

async function loadInbox(version=inboxVersion){
  await loadDuty();
  if(!me?.supportStations?.length)return;
  const list=panel.querySelector("[data-inbox]");
  if(!list)return;
  const heldContainer=panel.querySelector("[data-held-list]");
  const heldSection=panel.querySelector("[data-held-section]");

  const stations=await Promise.all(
    me.supportStations.map(station=>call("/api/support/inbox?station="+encodeURIComponent(station)))
  );

  if(version!==inboxVersion)return;
  const teamList=panel.querySelector("[data-team-list]"),teamSection=panel.querySelector("[data-team-section]");
  teamList?.replaceChildren();let teamCount=0;
  const mineHeld=new Set(stations.flatMap(data=>(data.items||[]).filter(item=>item.status==="held"&&item.accepted_by===me.email).map(item=>item.call_id)));
  for(const id of heldCalls.keys())if(!mineHeld.has(id))heldCalls.delete(id);
  list.replaceChildren();
  if(heldContainer)heldContainer.replaceChildren();

  let waitingCount=0;
  let hasWaitingCalls=false;const waitingItems=[];

  for(const data of stations){
    for(const item of data.items||[]){
      if(item.status==="waiting"){
        if(!onDuty)continue;
        waitingCount++;
        hasWaitingCalls=true;
        waitingItems.push(item);
      }

      if(item.status==="accepted"&&item.accepted_by===me?.email){
        if(!currentCall){
          currentCall=item.call_id;
          activeCallItem=item;
          assistedFormAuto(item);
        }else if(currentCall===item.call_id){
          assistedForm(item,null,true);
        }
        continue;
      }

      if(item.status==="held"&&item.accepted_by===me.email){
        heldCalls.set(item.call_id,{item,heldAt:heldCalls.get(item.call_id)?.heldAt||Date.now()});
        if(heldContainer){
          const heldCard=el("div","","cs-held-card");
          const info=el("div","","cs-held-info");
          info.append(el("strong",`${item.station} · ${item.rider_name||"Tài xế"}`),el("div",`${item.queue_no?"Số chờ #"+String(item.queue_no).padStart(3,"0"):"Yêu cầu hỗ trợ"} · Bạn đang tạm giữ`,"cs-held-sub"));
          const actions=el("div","","cs-held-actions");
          const resumeBtn=el("button","▶ Tiếp tục","cs-btn-resume");
          resumeBtn.onclick=()=>resumeHeldCall(item);
          const endBtn=el("button","✕ Kết thúc","cs-btn-end-held");
          endBtn.onclick=()=>endCall(false,item.call_id);
          actions.append(resumeBtn,endBtn);
          heldCard.append(info,actions);
          heldContainer.append(heldCard);
        }
        continue;
      }

      const row=document.createElement("div");
      row.className="call-row";
      const title=el("strong",`${item.station} · ${item.queue_no?"Số chờ "+String(item.queue_no).padStart(3,"0")+" · ":""}${item.rider_name||"Rider"}`);
      const detail=el("div",item.issue||"Cần hỗ trợ tại kiosk");
      detail.className="muted";
      row.append(title,detail);

      row.dataset.callId=item.call_id;
      if(item.status==="waiting"){
        mobileAgent(item,row);
      }else{
        row.append(el("p",`${item.accepted_by||"Đồng nghiệp"} · ${item.status==="held"?"Đang tạm giữ":"Đang xử lý"}`,"cs-team-owner"));
        if(item.accepted_by===me.email){
          assistedForm(item,row);
          const end=el("button","✕ Kết thúc hỗ trợ","secondary btn-end-support");
          end.onclick=()=>{currentCall=item.call_id;endCall(false);};
          row.append(end);
        }
      }
      if(item.status!=="waiting"&&item.accepted_by!==me.email){teamCount++;(teamList||list).append(row);}else list.append(row);
    }
  }

  if(teamSection)teamSection.hidden=teamCount===0;
  const teamCountEl=panel.querySelector("[data-team-count]");if(teamCountEl)teamCountEl.textContent=String(teamCount);
  if(heldSection){
    heldSection.hidden=heldCalls.size===0;
  }
  updateMetrics(waitingCount);
  updateWorkspace();

  if(!hasWaitingCalls||currentCall||!onDuty||!waitingItems.some(item=>item.call_id===ringingCallId))stopIncomingCallRingtone();
  if(!currentCall&&!acceptingCall&&onDuty&&!isRinging){
    const next=waitingItems.sort((a,b)=>(a.created_at_ms||0)-(b.created_at_ms||0)).find(item=>!knownCallIds.has(item.call_id));
    if(next)startIncomingCallRingtone(next);
  }
  if(!list.childNodes.length){
    const emptyRow=el("div","","cs-queue-empty");
    emptyRow.innerHTML=`<div class="empty-icon">✓</div><div class="empty-text">Hàng đợi trống. Không có tài xế nào đang chờ hỗ trợ.</div>`;
    list.append(emptyRow);
  }
}

function setupStaff(){
  ensurePanel();
  panel.replaceChildren();

  // 1. Agent Command Bar
  const headerCard = el("section", "", "cs-header-card");
  const stationChips = (me.supportStations || []).map(s => `<span class="cs-station-chip">${s}</span>`).join("");

  headerCard.innerHTML = `
    <div class="cs-header-left">
      <div class="cs-agent-avatar">
        <span class="cs-agent-avatar-icon">🎧</span>
        <span class="cs-agent-live-dot" title="Tài khoản đang trực tuyến"></span>
      </div>
      <div class="cs-agent-meta">
        <div class="cs-agent-title-row">
          <span class="cs-agent-email">${me.email}</span>
          <span class="cs-agent-role-pill">Customer Service</span>
        </div>
        <div class="cs-stations-container">
          <span class="cs-stations-label">Kho phụ trách:</span>
          <div class="cs-stations-pills">${stationChips}</div>
        </div>
      </div>
    </div>
    <div class="cs-header-right">
      <div class="cs-duty-switch-wrapper">
        <button type="button" class="cs-duty-btn off" data-btn-duty aria-pressed="false" title="Bấm để bật hoặc tắt chế độ nhận đơn">
          <span class="cs-duty-pill-dot off"></span>
          <span class="cs-duty-pill-text">⏸️ Tắt chờ nhận đơn</span>
        </button>
      </div>
      <button type="button" class="cs-btn-soundtest" data-btn-test-sound title="Bấm để thử âm thanh chuông cuộc gọi">
        🔔 Thử chuông
      </button>
    </div>
  `;
  panel.append(headerCard);

  headerCard.querySelector("[data-btn-duty]").onclick = async () => {
    const btn = headerCard.querySelector("[data-btn-duty]");
    btn.disabled = true;
    try {
      const state = await postSupport("duty", { active: !onDuty });
      showDuty(state.active);
      report(state.active ? "🟢 Đã bật chế độ trực. Sẵn sàng nhận cuộc gọi." : "⏸️ Đã tắt chờ nhận đơn.");
      await refreshInbox();
    } catch (e) {
      report(e.message);
    } finally {
      btn.disabled = false;
    }
  };

  headerCard.querySelector("[data-btn-test-sound]").onclick = () => testRingtone();

  // 2. Metrics Bar (3 Distinct Modern KPI Cards)
  const metricsBar = el("div", "", "cs-metrics-bar");
  metricsBar.innerHTML = `
    <div class="cs-metric-card cs-metric-active">
      <div class="cs-metric-icon-wrap">
        <span class="cs-metric-icon">📞</span>
      </div>
      <div class="cs-metric-body">
        <div class="cs-metric-top">
          <span class="cs-metric-val" data-stat-active>0</span>
          <span class="cs-metric-tag live" data-stat-active-tag>Sẵn sàng</span>
        </div>
        <span class="cs-metric-lbl">Đang đàm thoại</span>
      </div>
    </div>

    <div class="cs-metric-card cs-metric-held">
      <div class="cs-metric-icon-wrap">
        <span class="cs-metric-icon">⏸️</span>
      </div>
      <div class="cs-metric-body">
        <div class="cs-metric-top">
          <span class="cs-metric-val" data-stat-held>0</span>
          <span class="cs-metric-tag held" data-stat-held-tag>Không có</span>
        </div>
        <span class="cs-metric-lbl">Đang tạm giữ (Hold)</span>
      </div>
    </div>

    <div class="cs-metric-card cs-metric-queue highlight">
      <div class="cs-metric-icon-wrap">
        <span class="cs-metric-icon">⏳</span>
      </div>
      <div class="cs-metric-body">
        <div class="cs-metric-top">
          <span class="cs-metric-val" data-stat-waiting>0</span>
          <span class="cs-metric-tag queue">Thời gian thực</span>
        </div>
        <span class="cs-metric-lbl">Hàng đợi cuộc gọi đến</span>
      </div>
    </div>
  `;
  panel.append(metricsBar);

  // Status report toast / message
  const msg = el("p", "", "cs-report-box");
  msg.dataset.msg = "1";
  panel.append(msg);

  // 3. Main 2-Column Desk Grid
  const grid = el("div", "", "cs-desk-grid");

  // Left Column: Active Call Studio & Workspace
  const workspaceCol = el("div", "", "cs-workspace-col");

  // Active call card
  const activeCard = el("section", "", "cs-active-card");
  activeCard.dataset.activeCard = "1";
  activeCard.hidden = true;
  activeCard.innerHTML = `
    <div class="cs-active-header">
      <div class="cs-active-caller">
        <div class="cs-caller-avatar">🛵</div>
        <div class="cs-caller-info">
          <div class="cs-caller-name-row">
            <strong class="cs-caller-name" data-call-rider-name>Tài xế Rider</strong>
            <span class="cs-station-pill" data-call-station-badge>VNHCM1</span>
            <span class="cs-queue-pill" data-call-queue-no>Số chờ #001</span>
          </div>
          <div class="cs-caller-meta">
            <span class="cs-pulse-radar"></span>
            <span class="cs-status-live">Đang kết nối đàm thoại trực tiếp</span>
          </div>
        </div>
      </div>
      <div class="cs-active-timer-box">
        <span class="cs-timer-label">Thời gian</span>
        <span class="cs-timer-badge" data-call-timer>00:00</span>
      </div>
    </div>

    <div class="cs-call-toolbar">
      <button type="button" class="cs-btn-mute" data-btn-mute aria-pressed="false" title="Bấm để tắt hoặc bật micro">
        <span class="btn-icon">🎙️</span> <span class="btn-text">Tắt mic</span>
      </button>
      <button type="button" class="cs-btn-hold" data-btn-hold title="Bấm để tạm giữ cuộc gọi này và nghe cuộc gọi khác">
        <span class="btn-icon">⏸️</span> <span class="btn-text">Tạm giữ cuộc gọi (Hold)</span>
      </button>
      <button type="button" class="cs-btn-end" data-btn-end title="Bấm để kết thúc hỗ trợ cuộc gọi">
        <span class="btn-icon">✕</span> <span class="btn-text">Kết thúc hỗ trợ</span>
      </button>
    </div>

    <div class="cs-active-content" data-active-call-content>
      <div class="cs-assist-workspace" data-assist-workspace="1"></div>
    </div>
  `;

  activeCard.querySelector("[data-btn-mute]").onclick = () => toggleMute();
  activeCard.querySelector("[data-btn-hold]").onclick = () => holdCurrentCall();
  activeCard.querySelector("[data-btn-end]").onclick = () => endCall(false);
  workspaceCol.append(activeCard);

  // Idle state card (shown when no call is active)
  const idleCard = el("section", "", "cs-idle-card");
  idleCard.dataset.idleCard = "1";
  idleCard.innerHTML = `
    <div class="cs-idle-hero">
      <div class="cs-idle-icon-halo">
        <div class="cs-idle-icon">🎧</div>
      </div>
      <h2 class="cs-idle-title">Bàn hỗ trợ sẵn sàng tiếp nhận cuộc gọi</h2>
      <p class="cs-idle-desc">Hệ thống đang trực tuyến và lắng nghe cuộc gọi từ các trạm kho phân công. Khi tài xế quét mã QR và bấm gọi, chuông sẽ reo và yêu cầu xuất hiện ngay tại <strong>Hàng đợi bên phải</strong>.</p>
    </div>
    <div class="cs-idle-features">
      <div class="cs-feature-card">
        <div class="cs-feature-icon">🎙️</div>
        <div class="cs-feature-text">
          <strong>Tắt micro linh hoạt</strong>
          <p>Tắt tiếng nhanh khi cần trao đổi nội bộ với nhân viên kho.</p>
        </div>
      </div>
      <div class="cs-feature-card">
        <div class="cs-feature-icon">⏸️</div>
        <div class="cs-feature-text">
          <strong>Tạm giữ cuộc gọi (Hold)</strong>
          <p>Giữ máy tài xế hiện tại để tiếp nhận cuộc gọi khác khi đông khách.</p>
        </div>
      </div>
      <div class="cs-feature-card">
        <div class="cs-feature-icon">📝</div>
        <div class="cs-feature-text">
          <strong>Nhập hộ & Cấp số thứ tự</strong>
          <p>Nhập mã đơn Shopee trực tiếp và cấp số thứ tự lấy hàng nhanh chóng.</p>
        </div>
      </div>
    </div>
  `;
  workspaceCol.append(idleCard);
  grid.append(workspaceCol);

  // Right Column: Command Sidebar (Held Calls & Incoming Queue)
  const sidebarCol = el("div", "", "cs-sidebar-col");
  const forms = el("div", "", "cs-assist-workspace cs-assist-forms");
  forms.dataset.assistForms = "1";
  forms.hidden = true;
  sidebarCol.append(forms);

  // Held calls card
  const heldSection = el("section", "", "cs-held-section");
  heldSection.dataset.heldSection = "1";
  heldSection.hidden = true;
  heldSection.innerHTML = `
    <div class="cs-section-header held-header">
      <div class="cs-section-title">
        <span class="cs-section-icon">⏸️</span>
        <span>Cuộc gọi đang tạm giữ</span>
        <span class="cs-badge-held" data-held-badge>0</span>
      </div>
      <span class="cs-section-hint">Bấm "Tiếp tục" để quay lại</span>
    </div>
    <div class="cs-held-list" data-held-list></div>
  `;
  sidebarCol.append(heldSection);

  // Waiting queue card
  const queueSection = el("section", "", "cs-queue-section");
  queueSection.innerHTML = `
    <div class="cs-section-header queue-header">
      <div class="cs-section-title">
        <span class="cs-section-icon">⏳</span>
        <span>Hàng đợi cuộc gọi đến</span>
        <span class="cs-badge-queue" data-queue-badge>0</span>
      </div>
      <span class="cs-section-hint">Cập nhật tức thời</span>
    </div>
    <div class="cs-queue-list" data-inbox="1"></div>
  `;
  sidebarCol.append(queueSection);
  const teamSection=el("section","","cs-team-section");teamSection.dataset.teamSection="1";teamSection.hidden=true;
  const teamTitle=el("h3","Đồng nghiệp đang xử lý "),teamCount=el("span","0","cs-station-pill"),teamList=el("div");
  teamCount.dataset.teamCount="1";teamTitle.append(teamCount);teamList.dataset.teamList="1";
  teamSection.append(teamTitle,el("p","Các lượt đã có người phụ trách. Bạn vẫn có thể nhận lượt khác đang chờ.","muted"),teamList);sidebarCol.append(teamSection);

  grid.append(sidebarCol);
  panel.append(grid);

  // Legacy bottom end button support for test compatibility
  const end = el("button", "✕ Kết thúc hỗ trợ", "secondary btn-end-support");
  end.dataset.bottomEnd = "1";
  end.hidden = true;
  end.onclick = () => endCall(false);
  panel.append(end);

  launch = el("button", "🎧 Customer Service");
  launch.id = "ifc-support-launch";
  launch.onclick = async () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) await refreshInbox();
  };
  document.body.append(launch);

  refreshInbox();
  setInterval(() => { if (panel && !panel.hidden) refreshInbox(); }, 10000);
}

function handleSupportEvent(e){
      if(e.type==="support_call"){
        startIncomingCallRingtone(e);
        report(`🚨 Cuộc gọi mới tại ${e.station}: ${e.rider_name||"Rider"} · ${e.issue||"cần hỗ trợ"}`);
        if(panel)panel.hidden=false;
        refreshInbox(true);
      }
      if(e.type==="rider_registered"){
        playScanChime();
        report(`📦 ${e.driver_name||"Rider"} vừa quét đơn mới · Số ${String(e.seq||"").padStart(3,"0")} (${e.order_count||1} kiện)`);
      }
      if(e.type==="support_accepted"){
        if(ringingCallId===e.call_id){stopIncomingCallRingtone();if(e.accepted_by!==me.email)report(`${e.accepted_by||"Đồng nghiệp"} đã nhận lượt này.`);}
        if(e.kiosk_email===me.email){
          targetEmail=e.accepted_by;
          report("Nhân viên đã nhận yêu cầu. Đang kết nối video…");
        }
        refreshInbox(true);
      }
      if(e.type==="support_held"){
        refreshInbox(true);
      }
      if(e.type==="support_ended"){
        if(ringingCallId===e.call_id)stopIncomingCallRingtone();
        if(e.call_id===currentCall){
          report(e.status==="cancelled"?"Yêu cầu đã hủy.":"Cuộc gọi đã kết thúc.");
          stopGuestVideo?.();stopGuestVideo=null;guestCallId=null;
          clearMedia();
          currentCall=null;
          activeCallItem=null;
          updateWorkspace();
        }
        heldCalls.delete(e.call_id);
        refreshInbox(true);
      }
}

function connect(){
  call("/v1/ws-ticket?desk=1",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}).then(({ticket})=>{
    const wsUrl=new URL("/v1/browser/ws",location.href);
    wsUrl.protocol=location.protocol==="https:"?"wss:":"ws:";
    wsUrl.searchParams.set("ticket",ticket);
    socket=new WebSocket(wsUrl);
    socket.onopen=()=>{
      if(me.supportStations?.length)refreshInbox();
      keepAlive=setInterval(()=>{if(socket?.readyState===WebSocket.OPEN)socket.send("ping");},25000);
    };
    socket.onmessage=ev=>{
      if(ev.data==="pong")return;
      let message;
      try{message=JSON.parse(ev.data);}catch{return;}
      if(message.type==="support_signal"){takeIncomingSignal(message);return;}
      if(message.type!=="support_event")return;
      const e=message.event||{};
      handleSupportEvent(e);
    };
    socket.onclose=()=>{
      clearInterval(keepAlive);
      setTimeout(connect,3500);
    };
  }).catch(()=>setTimeout(connect,5000));
}

function setupKiosk(){
  ensurePanel();
  panel.append(el("h2","Gọi video nhân viên hỗ trợ"),el("p","Cho phép camera và micro để nhân viên hỗ trợ trực tiếp."),buildVideo());
  const msg=el("p");msg.dataset.msg="1";panel.append(msg);
  const end=el("button","Kết thúc cuộc gọi","secondary");
  end.onclick=()=>endCall(true);
  panel.append(end);
  launch=el("button","📹 Gọi nhân viên hỗ trợ");
  launch.id="ifc-support-launch";
  launch.onclick=()=>{panel.hidden=false;kioskCall();};
  document.body.append(launch);
}

async function kioskCall(){
  if(currentCall)return report("Đã có cuộc gọi đang mở.");
  try{
    const issue=prompt("Bạn cần nhân viên hỗ trợ việc gì? (Có thể để trống)")||"";
    await ensureMedia();
    const result=await call("/api/support/call",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rider_name:"",issue})});
    setCurrent(result.call_id,"");
    report(result.online_recipients?"Đang gọi Customer Service. Vui lòng chờ nhân viên nhận cuộc gọi…":"Đã gửi yêu cầu. Hiện chưa có Customer Service online; vui lòng chờ hoặc thử lại.");
    if(!result.online_recipients)report("Đã gửi yêu cầu hỗ trợ nhưng chưa có nhân viên Customer Service online tại station này.");
  }catch(e){
    report(e.message);clearMedia();
  }
}

me=await gate();
if(me){
  if(me.role==="kiosk"&&location.pathname.startsWith("/kiosk/")){
    setupKiosk();
    connect();
  }else if(location.pathname.startsWith("/support/")&&me.supportStations?.length){
    setupStaff();
    panel.hidden=false;
    launch.remove();
    document.querySelector("main").append(panel);
    connect();
  }
}

if(me&&location.pathname.startsWith("/support/")&&!me.supportStations?.length){
  document.querySelector("main").textContent="Tài khoản chưa được cấp Customer Service cho station nào.";
}
