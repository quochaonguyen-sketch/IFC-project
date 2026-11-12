// Start signaling as soon as the call is accepted. Each media permission is independent.
export function guestVideo(container, transport, agent = false, options = {}) {
  const el = (tag, label = "") => {
    const node = document.createElement(tag);
    node.textContent = label;
    return node;
  };
  const section = el("section"), status = el("p", "Đang kết nối với bên kia…");
  section.className = "ifc-guest-call";
  section.setAttribute("data-agent", String(agent));
  status.setAttribute("role", "status");
  const start = el("button", "Bật camera / micro và kết nối");
  const retryPlayback = el("button", "Bật âm thanh và hình cuộc gọi");
  const share = el("button", "Chia sẻ màn hình"), stopShare = el("button", "Dừng chia sẻ màn hình");
  const requestShare = el("button", "Yêu cầu rider chia sẻ màn hình");
  for (const button of [start, retryPlayback, share, stopShare, requestShare]) button.type = "button";
  const local = el("video"), remote = el("video"), screen = el("video"), sound = el("audio");
  const cameras = el("div"), screenBox = el("section"), shareStatus = el("p"), cameraStatus = el("p");
  cameras.className = "ifc-call-cameras";
  screenBox.className = "ifc-shared-screen";
  for (const [video, label] of [[remote, agent ? "Rider" : "Lễ tân"], [local, "Bạn"]]) {
    const frame = el("figure");
    frame.append(el("figcaption", label), video);
    cameras.append(frame);
  }
  for (const video of [local, remote, screen]) {
    video.autoplay = true;
    video.playsInline = true;
    // The call's audio plays through a separate audio element.
    video.muted = true;
  }
  sound.autoplay = true;
  cameraStatus.setAttribute("role", "status");
  shareStatus.setAttribute("role", "status");
  screenBox.append(el("h3", agent ? "Màn hình rider" : "Chia sẻ màn hình của bạn"), shareStatus, screen, requestShare, share, stopShare);
  section.append(status, start, cameraStatus, retryPlayback, cameras, sound, screenBox);
  container.append(section);

  const supported = options.screenSharing !== false && typeof navigator.mediaDevices?.getDisplayMedia === "function";
  if(options.screenSharing===false&&!agent)screenBox.hidden=true;
  const unsupportedText = "Trình duyệt này chưa hỗ trợ chia sẻ màn hình qua web. Bạn vẫn có thể nói chuyện với lễ tân để được hướng dẫn.";
  let peer, audioTx, cameraTx, screenTx, media, display, attachedDisplay, attachingDisplay;
  let since = 0, pollTimer, captureTimer, leaseTimer, recoveryTimer, retryDelay = 0, stopped = false, polling = false;
  let revision = 1, recoveryAttempts = 0, makingOffer = false, turnAvailable = false;
  let requestingMedia = false, choosingScreen = false, shareId = "", announcedId = "", receivedId = "", remoteShareId = "";
  let remoteScreenStream;
  let remoteSharing = false, remoteCapable, firstFrameCallback, requestTime = 0;
  const outgoing = [], earlyIce = [];

  share.hidden = agent;
  share.disabled = !supported;
  requestShare.hidden = !agent;
  stopShare.hidden = retryPlayback.hidden = screen.hidden = true;
  shareStatus.textContent = agent ? "Rider chưa chia sẻ màn hình." : supported
    ? "Bấm Chia sẻ màn hình rồi chọn nội dung trên điện thoại. Chọn Toàn bộ màn hình nếu muốn lễ tân xem khi chuyển ứng dụng."
    : unsupportedText;

  function schedule(delay) {
    clearTimeout(pollTimer);
    if (!stopped && !polling) pollTimer = setTimeout(exchange, delay);
  }
  function send(kind, value, extra = {}) {
    if (stopped) return;
    outgoing.push({message_id: crypto.randomUUID(), message: {kind, value, ...extra}});
    schedule(0);
  }
  function updateButtons() {
    share.disabled = agent || !supported || stopped || choosingScreen || !!display;
    stopShare.hidden = !display;
    requestShare.disabled = stopped || remoteCapable === false || remoteSharing;
  }
  function describeLocalScreen() {
    if (!display) return;
    if (receivedId === shareId && peer?.connectionState === "connected") {
      shareStatus.textContent = "Lễ tân đã nhận hình ảnh từ màn hình của bạn.";
    } else if (attachedDisplay && peer?.connectionState === "connected") {
      shareStatus.textContent = "Đã gửi luồng màn hình. Đang chờ máy lễ tân hiển thị hình ảnh.";
    } else {
      shareStatus.textContent = "Bạn đã cho phép chia sẻ. Đang chờ kết nối để gửi hình cho lễ tân.";
    }
  }
  function stopScreen(reason = "Đã dừng chia sẻ. Bạn có thể tiếp tục nói chuyện với lễ tân.") {
    const old = display, id = shareId;
    display = attachedDisplay = null;
    shareId = announcedId = receivedId = "";
    clearTimeout(captureTimer);
    clearTimeout(leaseTimer);
    if (old) {
      for (const track of old.getTracks()) { track.onended = null; track.stop(); }
      screenTx?.sender.replaceTrack(null).catch(() => {});
      send("screen", false, {share_id: id});
      if (!stopped) shareStatus.textContent = reason;
    }
    updateButtons();
  }
  function renewScreenLease() {
    clearTimeout(leaseTimer);
    if (display) leaseTimer = setTimeout(() => stopScreen("Đã dừng chia sẻ vì mất liên lạc với IFC. Khi có mạng, bấm Chia sẻ màn hình để cấp quyền lại."), 45000);
  }
  function checkScreenDeadline() {
    clearTimeout(captureTimer);
    if (!display || (attachedDisplay && peer?.connectionState === "connected")) return;
    const source = display;
    captureTimer = setTimeout(() => {
      if (display === source && (!attachedDisplay || peer?.connectionState !== "connected"))
        stopScreen("Chưa kết nối được máy lễ tân nên IFC đã dừng lấy hình. Khi kết nối lại, bấm Chia sẻ màn hình để thử lại.");
    }, 45000);
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(pollTimer);
    clearTimeout(recoveryTimer);
    stopScreen();
    if (firstFrameCallback != null) screen.cancelVideoFrameCallback?.(firstFrameCallback);
    screen.ontimeupdate = null;
    media?.getTracks().forEach(track => track.stop());
    peer?.close();
    remoteScreenStream = null;
    for (const player of [local, remote, screen, sound]) player.srcObject = null;
    section.remove();
    window.removeEventListener("pagehide", stop);
  }
  window.addEventListener("pagehide", stop, {once: true});

  function showRemoteScreen() {
    if (stopped) return;
    const track = remoteScreenStream?.getVideoTracks()[0];
    const wasHidden = screen.hidden;
    screen.hidden = !remoteSharing || !track || track.muted || track.readyState === "ended";
    if (!remoteSharing) screen.srcObject = null;
    else if (screen.srcObject !== remoteScreenStream) screen.srcObject = remoteScreenStream ?? null;
    if (wasHidden && !screen.hidden) play(screen);
    if (!remoteSharing) {
      shareStatus.textContent = remoteCapable === false
        ? "Trình duyệt của rider không hỗ trợ chia sẻ toàn màn hình."
        : "Rider chưa chia sẻ hoặc đã dừng chia sẻ màn hình.";
    } else if (screen.hidden || !receivedId) {
      shareStatus.textContent = "Rider đã cấp quyền. Đang chờ hình ảnh.";
    } else {
      shareStatus.textContent = "Đang hiển thị màn hình rider. Bạn có thể nhập hộ ở phiếu bên cạnh.";
    }
    updateButtons();
  }
  function watchFirstFrame() {
    if (firstFrameCallback != null) screen.cancelVideoFrameCallback?.(firstFrameCallback);
    firstFrameCallback = null;
    screen.ontimeupdate = null;
    if (!remoteSharing || !screen.srcObject) return;
    const id = remoteShareId, previousTime = screen.currentTime;
    const ack = () => {
      if (stopped || screen.hidden || !remoteSharing || remoteShareId !== id || receivedId === id) return;
      receivedId = id;
      if (id !== "legacy") send("screen-seen", id);
      showRemoteScreen();
    };
    if (typeof screen.requestVideoFrameCallback === "function") {
      firstFrameCallback = screen.requestVideoFrameCallback(() => { firstFrameCallback = null; ack(); });
    } else {
      screen.ontimeupdate = () => {
        if (screen.videoWidth && screen.readyState >= 2 && screen.currentTime > previousTime) ack();
      };
    }
  }
  function play(player) {
    player.play().catch(() => { if (!stopped) retryPlayback.hidden = false; });
  }
  retryPlayback.onclick = async () => {
    const players = [sound, remote, screen].filter(player => player.srcObject && !player.hidden);
    const results = await Promise.allSettled(players.map(player => player.play()));
    retryPlayback.hidden = results.every(result => result.status === "fulfilled");
  };

  async function attachCamera() {
    if (!media || stopped) return;
    await Promise.all([
      audioTx?.sender.replaceTrack(media.getAudioTracks()[0] || null),
      cameraTx?.sender.replaceTrack(media.getVideoTracks()[0] || null)
    ]);
  }
  async function enableCamera() {
    if (stopped || requestingMedia || media) return;
    requestingMedia = start.disabled = true;
    cameraStatus.textContent = "Cho phép camera và micro trên thiết bị để hai bên thấy và nghe nhau.";
    try {
      const source = await navigator.mediaDevices.getUserMedia({audio: true, video: {facingMode: "user"}});
      if (stopped) { source.getTracks().forEach(track => track.stop()); return; }
      media = source;
      local.srcObject = media;
      play(local);
      await attachCamera();
      start.hidden = true;
      cameraStatus.textContent = "Camera và micro đã bật.";
    } catch (error) {
      media?.getTracks().forEach(track => track.stop());
      media = null;
      local.srcObject = null;
      cameraStatus.textContent = error.name === "NotAllowedError"
        ? "Thiết bị chưa cấp quyền camera hoặc micro. Bấm nút Bật camera / micro để thử lại."
        : "Không mở được camera hoặc micro. " + (error.message || String(error));
    } finally { requestingMedia = false; start.disabled = !!media; }
  }
  start.onclick = enableCamera;

  function announceScreen() {
    if (display && attachedDisplay === display && peer?.localDescription?.type === "answer" && announcedId !== shareId) {
      announcedId = shareId;
      send("screen", true, {share_id: shareId});
    }
  }
  async function attachScreen() {
    const source = display;
    if (!source || !screenTx || stopped || source === attachedDisplay || source === attachingDisplay) return;
    attachingDisplay = source;
    try {
      await screenTx.sender.replaceTrack(source.getVideoTracks()[0]);
      if (stopped || display !== source) return;
      attachedDisplay = source;
      announceScreen();
      checkScreenDeadline();
      describeLocalScreen();
    } catch (error) {
      if (display === source) stopScreen("Không truyền được màn hình đã chọn. " + (error.message || String(error)));
    } finally { if (attachingDisplay === source) attachingDisplay = null; }
  }
  share.onclick = async () => {
    if (stopped || agent || !supported || choosingScreen || display) return;
    choosingScreen = true;
    updateButtons();
    shareStatus.textContent = "Chọn màn hình muốn chia sẻ và xác nhận trên thiết bị.";
    try {
      // Call the browser picker inside the actual click, before any network or camera work.
      const source = await navigator.mediaDevices.getDisplayMedia({video: {displaySurface: "monitor"}, audio: false});
      if (stopped) { source.getTracks().forEach(track => track.stop()); return; }
      const track = source.getVideoTracks()[0];
      if (!track || track.readyState === "ended") {
        source.getTracks().forEach(t => t.stop());
        throw Error("Không có màn hình đang chia sẻ.");
      }
      display = source;
      shareId = crypto.randomUUID();
      track.onended = () => stopScreen();
      updateButtons();
      renewScreenLease();
      checkScreenDeadline();
      describeLocalScreen();
      await attachScreen();
    } catch (error) {
      if (!stopped) shareStatus.textContent = error.name === "NotAllowedError"
        ? "Bạn chưa cho phép chia sẻ. Có thể bấm Chia sẻ màn hình để chọn lại."
        : "Không thể mở chia sẻ màn hình. " + (error.message || String(error));
    } finally { choosingScreen = false; updateButtons(); }
  };
  stopShare.onclick = () => stopScreen();
  requestShare.onclick = () => {
    if (!agent || stopped || remoteCapable === false || remoteSharing || Date.now() - requestTime < 10000) return;
    requestTime = Date.now();
    send("screen-request", true);
    shareStatus.textContent = "Đã yêu cầu rider bấm Chia sẻ màn hình trên điện thoại.";
  };

  function mediaStatus() {
    if (!peer || stopped) return;
    const isConnected = peer.connectionState === "connected" || peer.iceConnectionState === "connected" || peer.iceConnectionState === "completed";
    if (isConnected) {
      clearTimeout(recoveryTimer);
      recoveryTimer = null;
      recoveryAttempts = 0;
      status.textContent = agent ? "Đã kết nối với rider." : "Đã kết nối với lễ tân.";
    } else if (["new", "connecting"].includes(peer.connectionState) || ["new", "checking"].includes(peer.iceConnectionState)) {
      status.textContent = "Đang kết nối âm thanh và hình ảnh…";
    } else if (["disconnected", "failed"].includes(peer.connectionState) || ["disconnected", "failed"].includes(peer.iceConnectionState)) {
      const issue = turnAvailable
        ? "Đang thử khôi phục kết nối media. Vui lòng giữ máy trong giây lát…"
        : "Đang thử khôi phục kết nối media. Station chưa cấu hình TURN nên một số mạng không thể gọi trực tiếp.";
      status.textContent = recoveryAttempts >= 3
        ? "Không thể nối lại cuộc gọi sau 3 lần. Vui lòng bấm Kết thúc và thử gọi lại."
        : issue;
      if (agent && !recoveryTimer && recoveryAttempts < 3) {
        recoveryTimer = setTimeout(async () => {
          recoveryTimer = null;
          if (stopped || !peer || peer.connectionState === "connected") return;
          if (peer.signalingState && peer.signalingState !== "stable") {
            mediaStatus(); return;
          }
          try {
            recoveryAttempts++;
            revision++;
            makingOffer = true;
            await peer.setLocalDescription(await peer.createOffer({iceRestart: true}));
            send("offer", peer.localDescription.toJSON(), {revision});
            status.textContent = `Đang nối lại cuộc gọi (lần ${recoveryAttempts}/3)…`;
          } catch (error) {
            status.textContent = "Không thể nối lại media. " + (error.message || String(error));
          } finally {
            makingOffer = false;
            if (!stopped && peer?.connectionState !== "connected") mediaStatus();
          }
        }, peer.connectionState === "failed" ? 1500 : 8000);
      }
    }
    checkScreenDeadline();
    describeLocalScreen();
  }

  async function openPeer(iceServers) {
    turnAvailable = iceServers.some(server => [server.urls].flat().some(url => /^turns?:/.test(url)));
    peer = new RTCPeerConnection({iceServers});
    peer.onicecandidate = event => { if (event.candidate) send("ice", event.candidate.toJSON(), {revision}); };
    peer.onconnectionstatechange = mediaStatus;
    peer.oniceconnectionstatechange = mediaStatus;
    peer.ontrack = event => {
      const player = event.track.kind === "audio" ? sound : agent && event.transceiver === screenTx ? screen : remote;
      const stream = new MediaStream([event.track]);
      if (player === screen) {
        remoteScreenStream = stream;
        const refresh = () => { showRemoteScreen(); watchFirstFrame(); };
        event.track.onmute = event.track.onunmute = refresh;
        refresh();
      } else {
        player.srcObject = stream;
        play(player);
      }
    };
    if (!agent) return;
    audioTx = peer.addTransceiver("audio", {direction: "sendrecv"});
    cameraTx = peer.addTransceiver("video", {direction: "sendrecv"});
    screenTx = peer.addTransceiver("video", {direction: "recvonly"});
    await attachCamera();
    await peer.setLocalDescription(await peer.createOffer());
    send("offer", peer.localDescription.toJSON(), {revision});
    mediaStatus();
  }
  async function addIce(candidate) {
    try { await peer.addIceCandidate(candidate); }
    catch (error) {
      // A bad candidate cannot block delivery of the SDP or remaining candidates.
      if (error.name !== "OperationError" && error.name !== "TypeError") throw error;
    }
  }
  async function apply(message) {
    if (agent && message.kind === "screen") {
      remoteSharing = message.value === true;
      remoteShareId = remoteSharing ? message.share_id || "legacy" : "";
      receivedId = "";
      showRemoteScreen();
      watchFirstFrame();
      return;
    }
    if (agent && message.kind === "screen-capable") {
      remoteCapable = message.value === true;
      showRemoteScreen();
      return;
    }
    if (!agent && message.kind === "screen-request") {
      if (!display && !choosingScreen) {
        shareStatus.textContent = supported ? "Lễ tân muốn xem màn hình. Bấm Chia sẻ màn hình và xác nhận nếu bạn đồng ý." : unsupportedText;
        share.focus?.({preventScroll: true});
      }
      return;
    }
    if (!agent && message.kind === "screen-seen" && display && message.value === shareId) {
      receivedId = shareId;
      describeLocalScreen();
      return;
    }
    const incomingRevision = Number.isSafeInteger(message.revision) && message.revision > 0 ? message.revision : 1;
    if (message.kind === "ice") {
      if (incomingRevision < revision) return;
      if (incomingRevision === revision && peer.remoteDescription && peer.signalingState === "stable") await addIce(message.value);
      else earlyIce.push({candidate: message.value, revision: incomingRevision});
      return;
    }
    if (message.kind !== (agent ? "answer" : "offer")) return;
    if (incomingRevision < revision || (agent && incomingRevision !== revision)) return;
    if (agent && peer.signalingState === "stable") return;
    if (!agent && incomingRevision === revision && peer.remoteDescription && peer.signalingState === "stable") return;
    revision = incomingRevision;
    await peer.setRemoteDescription(message.value);
    if (!agent) {
      const channels = peer.getTransceivers();
      audioTx = channels.find(t => t.receiver.track.kind === "audio");
      [cameraTx, screenTx] = channels.filter(t => t.receiver.track.kind === "video");
      if (!audioTx || !cameraTx || !screenTx) throw Error("Hai bên cần mở cùng phiên bản IFC.");
      audioTx.direction = cameraTx.direction = "sendrecv";
      screenTx.direction = "sendonly";
      await attachCamera();
      await attachScreen();
      await peer.setLocalDescription(await peer.createAnswer());
      send("answer", peer.localDescription.toJSON(), {revision});
      announceScreen();
    }
    for (let i = 0; i < earlyIce.length;) {
      if (earlyIce[i].revision <= revision) {
        const item = earlyIce.splice(i, 1)[0];
        if (item.revision === revision) await addIce(item.candidate);
      } else i++;
    }
    mediaStatus();
  }
  async function exchange() {
    if (stopped || polling) return;
    polling = true;
    const pending = outgoing.slice(0, 20);
    try {
      const result = await transport({since, messages: pending, need_ice: !peer});
      if (stopped) return;
      outgoing.splice(0, pending.length);
      if (!peer) {
        try { await openPeer(result.iceServers || []); }
        catch (error) {
          peer?.close();
          peer = audioTx = cameraTx = screenTx = null;
          throw error;
        }
      }
      for (const item of result.items || []) {
        if (stopped) return;
        await apply(item.message);
        since = item.seq;
      }
      renewScreenLease();
      if (retryDelay) status.textContent = peer.connectionState === "connected" ? "Đã kết nối lại." : "Đang kết nối hai bên…";
      retryDelay = 0;
    } catch (error) {
      if (stopped) return;
      if ([401, 403, 404, 410].includes(error.status)) {
        stop();
        options.onEnded?.(error);
        return;
      }
      retryDelay = Math.min(6000, retryDelay ? retryDelay * 2 : 800);
      status.textContent = "Đang thử kết nối lại với IFC. " + (error.message || String(error));
    } finally {
      polling = false;
      const connected = peer?.connectionState === "connected";
      if (!stopped) schedule(retryDelay || (outgoing.length ? 0 : connected ? 1500 : 250));
    }
  }

  // Signal and receive on an accepted call even while the permission prompt is open.
  if (!agent) outgoing.push({message_id: crypto.randomUUID(), message: {kind: "screen-capable", value: supported}});
  void exchange();
  if (options.autoStart) void enableCamera();
  return stop;
}
