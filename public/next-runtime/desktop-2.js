
let scanAudioCtx = null;

// ==================== WAREHOUSE ORDER ARRIVAL NOTIFICATION SYSTEM ====================
const ORDER_NOTIFY_STORAGE_KEY = "IFC_ORDER_SOUND_NOTIFY_ENABLED_V1";
let orderSoundNotifyEnabled = localStorage.getItem(ORDER_NOTIFY_STORAGE_KEY) !== "0"; // Default: ON (true)
let orderAudioCtx = null;
const alertedOrderTicketIds = new Set();
let orderNotificationTimer = null;

function getOrderAudioContext() {
  try {
    if (!orderAudioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) orderAudioCtx = new AC();
    }
    if (orderAudioCtx && orderAudioCtx.state === "suspended") {
      orderAudioCtx.resume().catch(() => {});
    }
    return orderAudioCtx;
  } catch (_) {
    return null;
  }
}

function playOrderSubmittedChime() {
  try {
    const ctx = getOrderAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    // Melodic warehouse chime: C5 (523.25Hz) -> E5 (659.25Hz) -> G5 (783.99Hz) -> C6 (1046.50Hz)
    const playChimeSequence = (startTime) => {
      const notes = [
        { f: 523.25, start: startTime, dur: 0.16 },
        { f: 659.25, start: startTime + 0.14, dur: 0.16 },
        { f: 783.99, start: startTime + 0.28, dur: 0.22 },
        { f: 1046.50, start: startTime + 0.44, dur: 0.40 }
      ];
      notes.forEach(({ f, start, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.42, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur);
      });
    };

    playChimeSequence(now + 0.02);
    playChimeSequence(now + 0.68);
  } catch (e) {
    console.warn("Order chime error:", e);
  }
}

function speakOrderAnnouncement(driverName, ticketNo, orderCount) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const text = "Có đơn mới từ tài xế " + (driverName || "tài xế") + ". Số phiếu " + (ticketNo || "") + ", " + (orderCount || 1) + " đơn. Staff lấy đơn!";
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "vi-VN";
    utter.rate = 1.05;
    window.speechSynthesis.speak(utter);
  } catch (_) {}
}

function showOrderNotificationToast({ ticketId, ticketNo, driverName, orderCount }) {
  let toast = document.getElementById("orderNotificationToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "orderNotificationToast";
    toast.className = "order-notification-toast";
    toast.innerHTML = '<div class="toast-left"><div class="toast-bell-wrap">🔔</div><div class="toast-info"><div class="toast-title">🚨 CÓ ĐƠN BÀN GIAO MỚI TỪ TÀI XẾ!</div><div class="toast-desc">Tài xế <strong id="toastDriverName">-</strong> vừa gửi phiếu <strong id="toastTicketNo">-</strong> (<span id="toastOrderCount">0</span> đơn). Staff vui lòng lấy đơn!</div></div></div><div class="toast-actions"><button type="button" id="btnToastViewTicket" class="btn-toast-view">📋 Xem phiếu</button><button type="button" id="btnToastDismiss" class="btn-toast-dismiss">✕ Đã biết</button></div>';
    document.body.appendChild(toast);
  }

  const driverEl = toast.querySelector("#toastDriverName");
  const ticketEl = toast.querySelector("#toastTicketNo");
  const countEl = toast.querySelector("#toastOrderCount");
  const dismissBtn = toast.querySelector("#btnToastDismiss");
  const viewBtn = toast.querySelector("#btnToastViewTicket");

  if (driverEl) driverEl.textContent = driverName || "Tài xế";
  if (ticketEl) ticketEl.textContent = ticketNo || "-";
  if (countEl) countEl.textContent = String(orderCount || 1);

  if (dismissBtn) {
    dismissBtn.onclick = () => {
      toast.hidden = true;
      if (orderNotificationTimer) clearTimeout(orderNotificationTimer);
    };
  }

  if (viewBtn) {
    viewBtn.onclick = () => {
      toast.hidden = true;
      if (orderNotificationTimer) clearTimeout(orderNotificationTimer);
      showPage("handover");
      const searchInput = document.getElementById("holdTicketSearchInput");
      if (searchInput && ticketNo) {
        searchInput.value = ticketNo;
        document.getElementById("btnSearchHoldTicket")?.click();
      }
    };
  }

  toast.hidden = false;
  if (orderNotificationTimer) clearTimeout(orderNotificationTimer);
  orderNotificationTimer = setTimeout(() => {
    if (toast) toast.hidden = true;
  }, 15000);
}

function handleIncomingOrderAlert(info = {}) {
  const ticketId = String(info.ticket_id || info.id || info.ticket_no || "").trim();
  const ticketNo = String(info.ticket_no || info.seq || ticketId || "Đơn mới");
  const driverName = String(info.driver_name || info.rider_name || "Tài xế").trim();
  const orderCount = Number(info.order_count || info.orders?.length || info.items?.length || 1);

  if (ticketId && alertedOrderTicketIds.has(ticketId)) return;
  if (ticketId) alertedOrderTicketIds.add(ticketId);

  // 1. Play chime sound if enabled
  if (orderSoundNotifyEnabled) {
    playOrderSubmittedChime();
    setTimeout(() => {
      speakOrderAnnouncement(driverName, ticketNo, orderCount);
    }, 1200);
  }

  // 2. Show floating toast notification banner
  showOrderNotificationToast({ ticketId, ticketNo, driverName, orderCount });

  // 3. Update status message
  setHandoverMessage("🔔 Tài xế " + driverName + " vừa gửi phiếu #" + ticketNo + " (" + orderCount + " đơn). Staff vui lòng lấy đơn!", "green");
}

function setOrderSoundNotifyEnabled(enabled) {
  orderSoundNotifyEnabled = !!enabled;
  localStorage.setItem(ORDER_NOTIFY_STORAGE_KEY, orderSoundNotifyEnabled ? "1" : "0");
  updateOrderNotifyUi();
  getOrderAudioContext();
  if (orderSoundNotifyEnabled) {
    playOrderSubmittedChime();
    setHandoverMessage("Đã BẬT chuông thông báo khi tài xế gửi đơn.", "green");
  } else {
    setHandoverMessage("Đã TẮT chuông thông báo nhận đơn.", "red");
  }
}

function updateOrderNotifyUi() {
  const topBtn = document.getElementById("btnOrderNotifyToggle");
  const topText = document.getElementById("orderNotifyStateText");
  const asideBadge = document.getElementById("asideOrderNotifyBadge");
  const asideToggleBtn = document.getElementById("btnAsideOrderNotifyToggle");

  if (topBtn) {
    topBtn.classList.toggle("active", orderSoundNotifyEnabled);
    topBtn.classList.toggle("muted", !orderSoundNotifyEnabled);
  }
  if (topText) {
    topText.textContent = orderSoundNotifyEnabled ? "BẬT" : "TẮT";
  }
  if (asideBadge) {
    asideBadge.textContent = orderSoundNotifyEnabled ? "BẬT" : "TẮT";
    asideBadge.className = "aside-notify-badge " + (orderSoundNotifyEnabled ? "on" : "off");
  }
  if (asideToggleBtn) {
    asideToggleBtn.textContent = orderSoundNotifyEnabled ? "Tắt chuông" : "Bật chuông";
  }
}

function initOrderArrivalNotificationSystem() {
  updateOrderNotifyUi();

  document.getElementById("btnOrderNotifyToggle")?.addEventListener("click", () => {
    setOrderSoundNotifyEnabled(!orderSoundNotifyEnabled);
  });

  document.getElementById("btnOrderNotifyTest")?.addEventListener("click", () => {
    getOrderAudioContext();
    playOrderSubmittedChime();
    setTimeout(() => {
      speakOrderAnnouncement("Nguyễn Văn A", "20261105-0001", 3);
    }, 1200);
    showOrderNotificationToast({
      ticketId: "test-" + Date.now(),
      ticketNo: "TEST-001",
      driverName: "Tài xế thử nghiệm",
      orderCount: 3
    });
    setHandoverMessage("🔊 Đang thử âm chuông thông báo đơn mới...", "green");
  });

  document.getElementById("btnAsideOrderNotifyToggle")?.addEventListener("click", () => {
    setOrderSoundNotifyEnabled(!orderSoundNotifyEnabled);
  });

  document.getElementById("btnAsideOrderNotifyTest")?.addEventListener("click", () => {
    document.getElementById("btnOrderNotifyTest")?.click();
  });

  document.addEventListener("click", () => {
    getOrderAudioContext();
  }, { passive: true });
}

function playScanChime() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!scanAudioCtx && AC) scanAudioCtx = new AC();
    if (scanAudioCtx && scanAudioCtx.state === "suspended") scanAudioCtx.resume().catch(() => {});
    if (!scanAudioCtx) return;
    const now = scanAudioCtx.currentTime;
    const osc = scanAudioCtx.createOscillator(), gain = scanAudioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1046.5, now);
    osc.frequency.setValueAtTime(1318.5, now + 0.08);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.setValueAtTime(0.35, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    osc.connect(gain); gain.connect(scanAudioCtx.destination);
    osc.start(now); osc.stop(now + 0.25);
  } catch (_) {}
}

    import {
      initializeApp,
      initializeD1,
      getAuth,
      onAuthStateChanged,
      signOut,



      collection,
      doc,
      setDoc,
      getDoc,
      getDocs,
      query,
      limit,
      updateDoc,
      deleteDoc,
      serverTimestamp,
      writeBatch,
      where,
      orderBy,
      runTransaction,
      onSnapshot,
      apiPost,
      getConnectionStatus,
      suspendRealtimeTransportForIdle,
      resumeRealtimeTransportAfterIdle,
      isRealtimeTransportSuspended
    } from "/adapter.js";

    


    // Làm sạch URL hiển thị thành /VNWL/
    if ((window.location.pathname === "/VNWL" || window.location.pathname === "/VNWL/") && window.location.search) {
      window.history.replaceState(null, "", "/VNWL/");
    }
    if (window.location.pathname === "/VNWL") {
      window.history.replaceState(null, "", "/VNWL/");
    }

    const app = initializeApp();

    // =========================
    const auth=getAuth(app);
    let currentAuthUser=null;


    // V52: Server realtime status. Chỉ thêm lớp giám sát, không đổi logic function HTML cũ.
    function setSourceChip(id, isOnline) {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle("online", !!isOnline);
      el.classList.toggle("offline", !isOnline);
    }
    function updateSourceHealthUi(status = {}) {
      // V62: đổi xanh/xám ngay theo trạng thái hiện tại. Không giữ trạng thái cũ để tránh hiểu nhầm.
      const sqlOnline = String(status?.sql?.status || "").toLowerCase() === "online" || status?.sql?.ok === true;
      const cloud_d0_aux1Online = String(status?.cloud_d0_aux1?.status || "").toLowerCase() === "online";
      const cloud_d0_aux2Online = String(status?.cloud_d0_aux2?.status || "").toLowerCase() === "online";
      setSourceChip("chipSqlLive", sqlOnline);
      setSourceChip("chipFmsLive", cloud_d0_aux1Online);
      setSourceChip("chipOmsLive", cloud_d0_aux2Online);
      const text = document.getElementById("sourceHealthText");
      if (text) {
        const ws = status?.websocket || {};
        const mode = (status?.cloud_d0_aux1?.signal_mode || status?.cloud_d0_aux2?.signal_mode) ? " | Tín hiệu nhanh" : "";
        const channel = String(status?.transport || ws.transport || "").toLowerCase().includes("realtime") ? "Server trực tuyến" : (ws.status || "-");
        const listenerText = channel === "Server trực tuyến" ? "" : " | Máy đang nghe: " + (ws.clients ?? 0);
        text.textContent = "Kênh trực tuyến: " + channel + listenerText + mode;
      }
    }
    window.addEventListener("vnwl:connection_status", e => updateSourceHealthUi(e.detail || {}));
    let sourceHealthBusy = false;
    let sourceHealthMissCount = 0;
    let lastGoodSourceHealth = null;
    window.addEventListener("vnwl:ws_state", e => {
      const d = e.detail || {};
      const text = document.getElementById("sourceHealthText");
      if (text && d.status === "offline") text.textContent = "Đường truyền realtime đang nối lại, hệ thống vẫn tự kiểm tra dự phòng.";
    });
    async function pollSourceHealthStatus() {
      if (typeof idleRealtimePaused !== "undefined" && idleRealtimePaused) {
        setSourceChip("chipSqlLive", false);
        setSourceChip("chipFmsLive", false);
        setSourceChip("chipOmsLive", false);
        const text = document.getElementById("sourceHealthText");
        if (text) text.textContent = "Kênh trực tuyến: tạm ngắt sau 30 phút không thao tác";
        return;
      }
      if (sourceHealthBusy) return;
      sourceHealthBusy = true;
      try {
        const d = getConnectionStatus() || {};
        const fresh = Number(d.updated_at_ms || 0) > 0 && Date.now() - Number(d.updated_at_ms || 0) < 40000;
        if (fresh && d && d.ok !== false) updateSourceHealthUi(d);
        else updateSourceHealthUi({ sql:{status:"offline", error:"Server chưa phát tín hiệu trực tuyến"}, cloud_d0_aux1:{status:"offline"}, cloud_d0_aux2:{status:"offline"}, websocket:{status:"offline", clients:0} });
      } catch (e) {
        updateSourceHealthUi({ sql:{status:"offline", error:e.message||String(e)}, cloud_d0_aux1:{status:"offline"}, cloud_d0_aux2:{status:"offline"}, websocket:{status:"offline", clients:0} });
      } finally {
        sourceHealthBusy = false;
      }
    }
    setInterval(pollSourceHealthStatus, 10000);
    setTimeout(pollSourceHealthStatus, 600);


    function showVnwlToast(title, detail = "", kind = "ok", timeoutMs = 7000) {
      const root = document.getElementById("vnwlToastLog");
      if (!root) return;
      const item = document.createElement("div");
      item.className = "vnwl-toast-item " + (kind || "ok");
      item.innerHTML = `<b>${escapeHtml(title || "Thông báo")}</b>${escapeHtml(detail || "")}`;
      root.prepend(item);
      while (root.children.length > 5) root.removeChild(root.lastElementChild);
      setTimeout(() => { try { item.remove(); } catch {} }, Math.max(2500, Number(timeoutMs || 7000)));
    }
    window.showVnwlToast = showVnwlToast;

    function setAuthLoginError(message) {
      const el = document.getElementById("authLoginError");
      if (el) el.textContent = message || "";
    }

    function showAuthLoginScreen() {
      const screen = document.getElementById("authLoginScreen");
      if (screen) screen.style.display = "flex";
      setTimeout(() => {
        const emailInput = document.getElementById("authEmailInput");
        const googleBtn = document.getElementById("btnAuthGoogleLogin");
        if (emailInput) emailInput.focus();
        else if (googleBtn) googleBtn.focus();
      }, 100);
    }

    function hideAuthLoginScreen() {
      const screen = document.getElementById("authLoginScreen");
      if (screen) screen.style.display = "none";
    }

    function friendlyAuthError(error) {
      const code = error?.code || "";
      if (code.includes("vnwl/unauthorized-email")) return "Email đăng nhập chưa được cấp quyền";
      if (code.includes("vnwl/provider-not-supported")) return "Tài khoản này không thuộc phương thức Email/Password hoặc Google";
      if (code.includes("popup-closed-by-user")) return "Bạn đã đóng cửa sổ đăng nhập Google.";
      if (code.includes("popup-blocked")) return "Trình duyệt đang chặn popup Google. Hãy cho phép popup rồi thử lại.";
      if (code.includes("operation-not-allowed")) return "Hệ thống chưa bật phương thức đăng nhập tương ứng. Hãy liên hệ quản trị viên.";
      if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Email hoặc mật khẩu không đúng, hoặc tài khoản chưa được cấp quyền đăng nhập.";
      if (code.includes("too-many-requests")) return "Đăng nhập sai quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.";
      if (code.includes("network-request-failed")) return "Lỗi mạng. Kiểm tra internet rồi thử lại.";
      return "Không đăng nhập được: " + (error?.message || error);
    }

    async function waitForAccessLogin(){
      return new Promise(resolve=>onAuthStateChanged(auth,user=>{
        currentAuthUser=user; hideAuthLoginScreen();updateAuthUserBox();resolve(user);
      }));
    }
    function updateAuthUserBox() {
      const box = document.getElementById("authUserBox");
      if (box) {
        const email = auth.currentUser?.email || "-";
        box.textContent = "Login: " + email + " | IFC_01 Handover";
      }
    }


    function getCurrentOperatorEmail() {
      return auth.currentUser?.email || "";
    }

    function getOrderLastOperator(order) {
      return order?.hold_last_operator || order?.last_operator || order?.last_operator_email || order?.updated_by || order?.updated_operator || order?.received_by || order?.picked_by || order?.handed_over_by || order?.deleted_by || order?.cancelled_by || order?.created_by || order?.created_operator || "-";
    }

    function getOrderLastOperation(order) {
      return order?.last_operation || order?.last_action || order?.operation || "-";
    }

    async function authLogout() {
      await signOut(auth);
      location.reload();
    }


    let db = null;
    let activeDatabaseName = "(default)";
    let allOrders = [];
    let lastSyncTime = null;
    let handoverItems = [];
    let lastHandoverSuccessItems = []; // V1.5.2: giữ DS để người vận hành copy sau khi phiên tự refresh.
    let currentHoldTicket = null;
    let pendingHoldBoxTicketId = ""; // V1.6: phiếu đang chờ scan/gán BOX
    let currentSortingBatch = null; // V2.0.8: batch Sorting while picking, tách theo device
    let holdTicketCache = new Map();
    let holdTicketBusy = false;
    let holdTicketsUnsub = null;
    let holdTicketsLiveStarted = false;
    let holdTicketsPollTimer = null;
    let holdTicketsPollBusy = false;
    let holdAuthoritativeReloadTimer = null;
    let holdAuthoritativeReloadBusy = false;
    let holdAuthoritativeReloadQueuedReason = "";
    let holdAuthoritativeLastReloadAtMs = 0; // V2.0.23 quota-safe: throttle full HOLD snapshot reads.
    let holdTicketsLastSignature = "";
    // V2.0.22 PC HANDOVER SEARCH STABILITY:
    // Khi lễ tân đang scan/tìm mã phiếu hoặc BOX để mở bàn giao, realtime từ phiếu khác
    // không được render lại toàn bộ HTML làm nhảy danh sách/mất nút/mất focus máy scan.
    let holdSearchPinnedValue = "";
    let holdSearchLastRenderedSignature = "";
    let holdSearchUiFreezeUntilMs = 0;
    let holdSearchBlankFreezeUntilMs = 0;
    const HOLD_SEARCH_UI_FREEZE_MS = 45000;
    const HOLD_SEARCH_BLANK_FOCUS_FREEZE_MS = 12000;
    const VNWL_HOLD_FILTER_KEY_V4 = "VNWL_HOLD_FILTER_VALUE_V4";
    let holdMineFilterActive = false;
    let holdWaitingFilterActive = false; // V2.0.1: lọc phiếu CHỜ NHẬN trên View HOLD PC/Mobile. // UI only: lọc phiếu đã nhận bởi tài khoản hiện tại.
    function restoreHoldFilterPreferenceV4() {
      try {
        const value = localStorage.getItem(VNWL_HOLD_FILTER_KEY_V4) || "all";
        holdMineFilterActive = value === "mine";
        holdWaitingFilterActive = value === "waiting";
      } catch (_) {}
    }
    restoreHoldFilterPreferenceV4();
    const HOLD_SORT_ORDER_KEY = "VNWL_HOLD_STT_SORT_ORDER_V2015";
    let holdSttSortOrder = (localStorage.getItem(HOLD_SORT_ORDER_KEY) === "asc") ? "asc" : "desc"; // V2.0.16: mặc định STT lớn → nhỏ.
    let riderOverviewTimer = null;
    let riderOverviewSilentTimer = null;
    let riderOverviewItems = [];
    let riderOverviewLastServerLoadAtMs = 0;
    let riderOverviewLoadBusy = false;
    let riderOverviewLastForceLoadAtMs = 0;
    const RIDER_OVERVIEW_SILENT_MIN_LOAD_GAP_MS = 60000;
    const RIDER_OVERVIEW_MANUAL_MIN_LOAD_GAP_MS = 15000;
    let riderOverviewHoldSyncAt = new Map();
    let riderOverviewSearchKeyword = "";
    let riderOverviewOperatorFilter = "ALL";
    let riderOverviewServerTimeOffsetMs = 0;
    // V86 field fix: lưu các dropdown danh sách đơn đang mở khi Rider Overview realtime render lại.
    let riderOverviewOpenOrderDropdownKeys = new Set();

    // V1.9.9 CALL-NUMBER PATCH: Loa chỉ chạy tại máy được bật và chỉ khi status chuyển sang PICKED.
    const RIDER_CALL_VOICE_ENABLED_KEY = "VNWL_RIDER_CALL_VOICE_ENABLED_V199";
    const RIDER_CALL_SPOKEN_PREFIX = "VNWL_RIDER_CALL_SPOKEN_V199_";
    let riderCallVoiceEnabled = false;
    let riderCallVoiceQueue = [];
    let riderCallVoiceSpeaking = false;

    const INITIAL_LOAD_DAYS_BACK = 7;
    const INDEXEDDB_CLEANUP_DAYS = 15;

    // Khi đổi version app, tự xóa cache IndexedDB cũ để tránh hiển thị dữ liệu cũ.
    // Chỉ xóa dữ liệu local trên máy/profile hiện tại, KHÔNG xóa D1.
    const APP_VERSION = "VNWL-2.0.28-STANDARD-FINAL-V6-QUOTA-HOLD-STABILITY";
    const APP_VERSION_KEY = "WH4H_APP_VERSION";

    // CLEAN START: dùng collection mới để app về dữ liệu mới ngay,
    // không đọc các collection cũ đang bị kẹt quota xóa.
    const DATA_COLLECTION_PREFIX = "orders_v280_";
    const HANDOVER_INDEX_PREFIX = "handover_index_v280_";
    const RECENT_ORDERS_PREFIX = "recent_orders_v280_";
    const RECENT_CACHE_LIMIT = 1500;
    const PENDING_ORDERS_PREFIX = "pending_orders_v280_";
    const HANDOVER_QUEUE_PREFIX = "handover_queue_v280_";
    const LIVE_UPDATES_PREFIX = "live_updates_v281_";
    const HOLD_TICKET_PREFIX = "hold_tickets_v285_";
    const HOLD_COUNTER_COLLECTION = "hold_counters_v285";
    const LOCAL_CACHE_LIMIT = 5000;
    const LIVE_UPDATE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
    const LIVE_UPDATES_QUERY_LIMIT = 100;
    const TODAY_ORDERS_LOAD_LIMIT = 5000;
    const RECENT_ORDERS_LIMIT = TODAY_ORDERS_LOAD_LIMIT;
    const RECENT_ORDERS_PAGE_SIZE = TODAY_ORDERS_LOAD_LIMIT;
    const RECENT_ORDERS_PAGE_COUNT = 1;
    const CODE_VERSION = "VNWL-2.0.28-STANDARD-FINAL-V6-QUOTA-HOLD-STABILITY";

    // V2.0: chặn auto bật bàn phím trên mobile do các lệnh focus() tự động.
    // Người dùng vẫn có thể tự chạm vào ô để nhập khi cần; máy scan/camera vẫn hoạt động qua nút thao tác.
    (function installNoAutoMobileKeyboardPatch(){
      try {
        const isMobileLike = () => (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || window.innerWidth <= 820;
        const nativeFocus = HTMLElement.prototype.focus;
        if (HTMLElement.prototype.__vnwlNoAutoKeyboardPatched) return;
        Object.defineProperty(HTMLElement.prototype, "__vnwlNoAutoKeyboardPatched", { value:true });
        HTMLElement.prototype.focus = function(...args) {
          const tag = String(this?.tagName || "").toUpperCase();
          const type = String(this?.getAttribute?.("type") || "").toLowerCase();
          const isTextInput = tag === "INPUT" || tag === "TEXTAREA" || this?.isContentEditable;
          if (isMobileLike() && isTextInput && this?.dataset?.forceMobileFocus !== "1" && type !== "button" && type !== "submit") return;
          return nativeFocus.apply(this, args);
        };
      } catch (e) { console.warn("No auto mobile keyboard patch warning", e); }
    })();

    const LOCAL_DB_NAME = "WH4H_LOCAL_DB_V280";
    const LOCAL_DB_VERSION = 1;
    const LOCAL_ORDER_STORE = "orders";
    const LOCAL_META_STORE = "meta";
    let localDbPromise = null;
    let isLoadingOrders = false;
    let autoRefreshTimer = null;
    let refreshCountdownValue = 5;
    let todayLoadedOrderCount = 0;
    let ordersLastServerUpdatedAtMs = 0;
    let holdTicketsLastServerUpdatedAtMs = 0;
    let holdTicketsLastFullSnapshotAtMs = 0;
    let holdTicketsServerReloadPromise = null; // VNWL quota guard: join duplicate HOLD reloads in the same tab.
    // VNWL PERFORMANCE SMOOTH V1: debounce + skip duplicate HOLD list renders.
    let holdTicketsRenderTimer = null;
    let holdTicketsRenderQueuedReason = "";
    let holdTicketsLastRenderedSignature = "";
    let holdMineEmptyRecoveryLastAtMs = 0;
    let holdMineViewportReloadTimer = null;
    const refreshIntervalSeconds = 5;
    let createOrderBusy = false;
    let orderScanTimer = null;
    let locationScanTimer = null;
    let justMovedToSubAt = 0;
    const MAX_SUB_PER_LOCATION = 40;
    let currentSuggestedSub = "";
    let currentSuggestedLocation = "";
    let subSuggestionAccepted = false;
    let autoHandoverBusy = false;
    let recentOrdersUnsubs = [];
    let recentOrdersPages = new Map();
    let recentOrdersRenderTimer = null;
    let backgroundFullSyncBusy = false;
    let lastBackgroundFullSyncAt = 0;

    window.addEventListener("error", (e) => {
      setMessage("Lỗi hệ thống: " + e.message, "red");
      console.error(e);
    });
    window.addEventListener("unhandledrejection", (e) => {
      setMessage("Lỗi async: " + (e.reason?.message || e.reason), "red");
      console.error(e.reason);
    });

    window.ifcOnReady(async () => {
      startDailyFullResetCountdown();
      await waitForAccessLogin();
      bindEvents();
      // V1.8: bảng tự cuộn ngang ở zoom lớn/khung màn hình hẹp, không làm bể bố cục.
      ["ordersTable", "handoverTable", "riderOverviewTable"].forEach(bodyId => {
        const table = document.getElementById(bodyId)?.closest("table");
        if (!table || table.parentElement?.classList.contains("responsive-table")) return;
        const wrapper = document.createElement("div");
        wrapper.className = "responsive-table";
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
      });
      addSuffixInput();
      try {
        await connectD1();
        startRecentOrdersListener();
        // V1.4: HOLD/Rider chỉ tải khi mở màn tương ứng; realtime delta xử lý cập nhật sau đó.
        document.getElementById("newOrderCode").focus();
      } catch (error) {
        setMessage("Không kết nối được Server: " + error.message, "red");
        renderOrders([]);
      }
    });

    function bindEvents() {
      const authLogoutBtn = document.getElementById("btnAuthLogout");
      if (authLogoutBtn) authLogoutBtn.addEventListener("click", authLogout);

      document.getElementById("navManage").addEventListener("click", () => showPage("manage"));
      document.getElementById("navHandover").addEventListener("click", () => showPage("handover"));
      document.getElementById("navRiderOverview")?.addEventListener("click", () => showPage("rider"));
      // V83: Rider Overview tự refresh liên tục, không cần nút Refresh thủ công.
      document.getElementById("riderOverviewSearchInput")?.addEventListener("input", () => {
        riderOverviewSearchKeyword = clean(document.getElementById("riderOverviewSearchInput")?.value || "");
        renderRiderOverview();
      });
      document.getElementById("riderOverviewOperatorFilter")?.addEventListener("change", () => {
        riderOverviewOperatorFilter = document.getElementById("riderOverviewOperatorFilter")?.value || "ALL";
        renderRiderOverview();
      });
      riderCallVoiceEnabled = localStorage.getItem(RIDER_CALL_VOICE_ENABLED_KEY) === "1";
      initOrderArrivalNotificationSystem();
      renderRiderCallVoiceButton();
      document.getElementById("btnRiderCallVoiceToggle")?.addEventListener("click", () => {
        setRiderCallVoiceEnabled(!riderCallVoiceEnabled);
      });

      document.getElementById("btnClearRiderOverviewFilter")?.addEventListener("click", () => {
        const searchEl = document.getElementById("riderOverviewSearchInput");
        const opEl = document.getElementById("riderOverviewOperatorFilter");
        if (searchEl) searchEl.value = "";
        if (opEl) opEl.value = "ALL";
        riderOverviewSearchKeyword = "";
        riderOverviewOperatorFilter = "ALL";
        renderRiderOverview();
      });
      document.getElementById("warehouseSelect").addEventListener("change", async () => {
        localStorage.setItem("ifc-warehouse",getWarehouse());
        resetSession();
        allOrders = [];
        lastSyncTime = null;
        stopRecentOrdersListener();
        stopHoldTicketsListener();
        holdTicketCache = new Map();
        currentHoldTicket = null;
        const holdBox = document.getElementById("holdTicketList");
        if (holdBox) holdBox.innerHTML = "";
        riderOverviewItems = [];
        renderRiderOverview();
        startRecentOrdersListener();
        setMessage("Đã chọn kho " + getWarehouse() + " (" + getOrdersCollectionName() + ")", "green");
        document.getElementById("newOrderCode").focus();
      });

      document.getElementById("btnCreate").addEventListener("click", createOrder);
      document.getElementById("btnSearch").addEventListener("click", searchOrders);
      document.getElementById("btnAdvancedSearch").addEventListener("click", advancedSearchOrders);
      document.getElementById("btnRefresh").addEventListener("click", () => loadRecentOrdersPagesOnce(false));
      document.getElementById("statusFilter").addEventListener("change", searchOrders);
      document.getElementById("displayLimit").addEventListener("change", () => renderOrders(applyCurrentFilters(allOrders)));
      document.getElementById("btnCleanupDelivered")?.addEventListener("click", cleanupDeliveredOlderThan15Days);
      document.getElementById("btnResetAllCurrentData")?.addEventListener("click", resetAllCurrentDataNow);

      const orderInput = document.getElementById("newOrderCode");
      const locationInput = document.getElementById("newLocation");
      const subInput = document.getElementById("newSub");

      const orderTypingState = { lastAt: 0, prevValue: "", fastChars: 0, likelyScan: false };
      const locationTypingState = { lastAt: 0, prevValue: "", fastChars: 0, likelyScan: false };
      const subTypingState = { lastAt: 0, prevValue: "", fastChars: 0, likelyScan: false };

      function resetTypingState(state) {
        state.lastAt = 0;
        state.prevValue = "";
        state.fastChars = 0;
        state.likelyScan = false;
      }

      function updateTypingState(event, input, state, minFastChars) {
        const now = Date.now();
        const value = clean(input.value);
        const prevValue = state.prevValue || "";
        const addedChars = Math.max(0, value.length - prevValue.length);
        const delta = state.lastAt ? now - state.lastAt : 9999;
        const inputType = event?.inputType || "";

        if (!value) {
          resetTypingState(state);
          return { value, likelyScan: false };
        }

        const isPaste = inputType.includes("insertFromPaste") || addedChars >= 4;

        if (isPaste) {
          state.fastChars = Math.max(state.fastChars, value.length);
          state.likelyScan = true;
        } else if (addedChars > 0 && delta <= 120) {
          state.fastChars += addedChars;
          if (state.fastChars >= minFastChars) state.likelyScan = true;
        } else if (addedChars > 0 && delta > 160) {
          // Nhập tay chậm: không tự nhảy ô để tránh tạo đơn thiếu mã.
          state.fastChars = addedChars;
          state.likelyScan = false;
        }

        state.prevValue = value;
        state.lastAt = now;

        return { value, likelyScan: state.likelyScan };
      }

      orderInput.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          clearTimeout(orderScanTimer);
          moveToLocationInput();
        }
      });

      orderInput.addEventListener("input", e => {
        clearTimeout(orderScanTimer);
        const state = updateTypingState(e, orderInput, orderTypingState, 4);
        const orderCode = state.value;

        if (!orderCode) return;

        // Chỉ tự nhảy Location khi có dấu hiệu là máy scan/paste nhanh.
        // Nếu nhân viên nhập tay, phải nhấn Enter/Tab để chuyển.
        if (!state.likelyScan || orderCode.length < 5) {
          setMessage("Đang nhập mã đơn. Nhập tay xong hãy nhấn Enter/Tab để qua Location.", "green");
          return;
        }

        setMessage("Đã nhận mã scan, chờ kết thúc để chuyển sang Location...", "green");
        orderScanTimer = setTimeout(() => {
          const currentOrder = clean(orderInput.value);
          if (
            document.activeElement === orderInput &&
            currentOrder.length >= 5 &&
            !clean(locationInput.value) &&
            orderTypingState.likelyScan
          ) {
            moveToLocationInput();
          }
        }, 350);
      });

      locationInput.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          clearTimeout(locationScanTimer);
          moveToSubInput();
        }
      });

      locationInput.addEventListener("input", e => {
        clearTimeout(locationScanTimer);
        const state = updateTypingState(e, locationInput, locationTypingState, 2);

        if (!clean(orderInput.value) || !state.value) return;
        refreshSubSuggestion();

        // Location thường ngắn như A1, 00. Khi scan/paste xong chỉ chuyển qua ô Sub,
        // không tự tạo đơn tại Location để tránh thiếu bước Sub.
        if (!state.likelyScan) {
          setMessage("Đang nhập Location. Nhập tay xong hãy nhấn Enter/Tab để qua Sub.", "green");
          return;
        }

        setMessage("Đã nhận Location bằng scan, chờ kết thúc để chuyển sang Sub...", "green");
        locationScanTimer = setTimeout(() => {
          if (
            document.activeElement === locationInput &&
            clean(orderInput.value) &&
            clean(locationInput.value) &&
            locationTypingState.likelyScan
          ) {
            moveToSubInput();
            resetTypingState(locationTypingState);
          }
        }, 350);
      });

      subInput.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          clearTimeout(locationScanTimer);

          const subValue = clean(subInput.value);
          if (!subValue) {
            // Nếu phím Enter kết thúc của máy scan Location bay sang ô Sub quá nhanh, chỉ hiển thị gợi ý.
            if (justMovedToSubAt && Date.now() - justMovedToSubAt < 180) {
              refreshSubSuggestion({ announce: true });
              return;
            }
            if (acceptSuggestedSubIfAvailable()) return; // Enter lần 1: nhận gợi ý mờ.
            setMessage("Location đã đầy Sub hoặc chưa có gợi ý hợp lệ. Vui lòng kiểm tra lại.", "red");
            playSound("error");
            return;
          }

          createOrder(); // Enter lần 2 hoặc Sub nhập tay: xác nhận tạo đơn.
        }
      });

      subInput.addEventListener("input", e => {
        clearTimeout(locationScanTimer);
        const state = updateTypingState(e, subInput, subTypingState, 1);
        if (!clean(orderInput.value) || !clean(locationInput.value)) return;

        if (!state.value) {
          subSuggestionAccepted = false; refreshSubSuggestion({ announce: true });
          return;
        }

        if (!state.likelyScan) {
          setMessage("Đang nhập Sub. Nhấn Enter/Tab hoặc bấm Tạo đơn để hoàn tất.", "green");
          return;
        }

        setMessage("Đã nhận Sub bằng scan, chờ kết thúc để tự tạo đơn...", "green");
        locationScanTimer = setTimeout(() => {
          if (
            document.activeElement === subInput &&
            clean(orderInput.value) &&
            clean(locationInput.value) &&
            subTypingState.likelyScan
          ) {
            createOrder();
            resetTypingState(orderTypingState);
            resetTypingState(locationTypingState);
            resetTypingState(subTypingState);
          }
        }, 350);
      });

      document.getElementById("ordersTable").addEventListener("click", handleOrderAction);
      document.getElementById("btnAddSuffix").addEventListener("click", () => addSuffixInput());
      // V86 field fix: máy scan thường gửi Enter sau mã. Enter tại dòng mã hiện tại
      // thực hiện cùng luồng với nút + Thêm đơn, không tự Check/Tạo phiếu.
      document.getElementById("suffixContainer")?.addEventListener("keydown", e => {
        const target = e.target;
        if (e.key !== "Enter" || e.repeat || e.isComposing || !target?.classList?.contains("suffix-input")) return;
        e.preventDefault();
        const rows = [...document.querySelectorAll(".suffix-input")];
        const currentIndex = rows.indexOf(target);
        if (currentIndex >= 0 && currentIndex < rows.length - 1) {
          rows[currentIndex + 1].focus();
          rows[currentIndex + 1].select?.();
          return;
        }
        addSuffixInput();
      });
      document.getElementById("btnCameraScanLocation").addEventListener("click", () => openCameraScanner("location"));
      document.getElementById("btnOcrScanLocation").addEventListener("click", () => openOcrScanner("location"));
      document.getElementById("btnCheckOrders").addEventListener("click", checkOrders);
      document.getElementById("btnCreateHoldTicket")?.addEventListener("click", createHoldTicketFromCurrentSession);
      document.getElementById("btnHoldFromModal")?.addEventListener("click", createHoldTicketFromCurrentSession);
      document.getElementById("btnAutoClaimHoldTicket")?.addEventListener("click", autoClaimNextHoldTicket);
      document.getElementById("btnSortingWhilePicking")?.addEventListener("click", startSortingWhilePicking);
      document.getElementById("btnToggleHoldSortOrder")?.addEventListener("click", toggleHoldSttSortOrder);
      document.getElementById("holdTicketFilterSelect")?.addEventListener("change", event => {
        const value = String(event.target?.value || "all");
        try { localStorage.setItem(VNWL_HOLD_FILTER_KEY_V4, value); } catch (_) {}
        holdMineFilterActive = value === "mine";
        holdWaitingFilterActive = value === "waiting";
        updateHoldMineFilterButtonUi();
        renderActiveHoldTicketsFromCache({ force: true });

        if (holdMineFilterActive) {
          // VNWL_MY_TICKETS_PERSIST_AFTER_RELOAD_V3:
          // Khi app/mobile out vào lại, local cache có thể rỗng hoặc cache Worker đang stale.
          // Tab "Phiếu đã nhận của tôi" phải kéo snapshot mới theo email, không phụ thuộc device_id/cache cũ.
          holdTicketsLastServerUpdatedAtMs = 0;
          holdTicketsLastFullSnapshotAtMs = 0;
          setHandoverMessage("Đang tải lại phiếu đã nhận của tài khoản " + getCurrentOperatorEmail() + "...", "green");
          forceReloadTodayHoldTicketsFromServer("mine_filter_force_fresh_after_reload")
            .then(() => renderActiveHoldTicketsFromCache({ force: true }))
            .catch(() => scheduleHoldAuthoritativeReload("mine_filter_retry_after_reload", 800));
          return;
        }

        scheduleHoldAuthoritativeReload("hold_filter_change", 250);
        if (holdWaitingFilterActive) {
          setHandoverMessage("Đang lọc phiếu CHỜ NHẬN PHIẾU, sắp theo " + (holdSttSortOrder === "asc" ? "STT thấp → lớn." : "STT lớn → thấp."), "green");
        }
      });
      document.getElementById("btnSearchHoldTicket")?.addEventListener("click", searchHoldTicketFromInput);
      document.getElementById("btnCameraScanHoldTicket")?.addEventListener("click", () => openCameraScanner("hold_ticket"));
      document.getElementById("btnCameraScanHoldBox")?.addEventListener("click", () => openCameraScanner("hold_box"));
      document.getElementById("btnConfirmHoldBox")?.addEventListener("click", assignBoxToPendingHoldTicket);
      document.getElementById("btnCloseHoldBoxModal")?.addEventListener("click", closeHoldBoxModal);
      document.getElementById("btnCancelHoldBox")?.addEventListener("click", closeHoldBoxModal);
      document.getElementById("holdBoxScanInput")?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); assignBoxToPendingHoldTicket(); } });
      document.getElementById("holdBoxModal")?.addEventListener("click", e => { if (e.target?.id === "holdBoxModal") closeHoldBoxModal(); });
      document.getElementById("btnCloseSortingPickModal")?.addEventListener("click", closeSortingPickModal);
      document.getElementById("btnCancelSortingPick")?.addEventListener("click", closeSortingPickModal);
      document.getElementById("btnFinishSortingPick")?.addEventListener("click", finishSortingBatchPick);
      document.getElementById("sortingPickModal")?.addEventListener("click", handleSortingPickModalAction);
      document.getElementById("sortingPickModal")?.addEventListener("keydown", handleSortingPickModalAction);
      document.getElementById("holdTicketSearchInput")?.addEventListener("input", e => {
        const value = normalizeHoldTicketSearchValue(e.target?.value || "");
        if (value) freezeHoldSearchUi(value, HOLD_SEARCH_UI_FREEZE_MS);
        else clearHoldSearchUiFreeze({ keepInput: true });
      });
      document.getElementById("holdTicketSearchInput")?.addEventListener("focus", e => {
        const value = normalizeHoldTicketSearchValue(e.target?.value || "");
        if (value) freezeHoldSearchUi(value, HOLD_SEARCH_UI_FREEZE_MS);
        else freezeHoldSearchBlankFocus(HOLD_SEARCH_BLANK_FOCUS_FREEZE_MS);
      });
      document.getElementById("holdTicketSearchInput")?.addEventListener("blur", e => {
        const value = normalizeHoldTicketSearchValue(e.target?.value || "");
        if (!value) setTimeout(() => clearHoldSearchUiFreeze({ keepInput: true }), 200);
      });
      document.getElementById("holdTicketSearchInput")?.addEventListener("keydown", e => {
        if (e.key === "Escape") {
          e.preventDefault();
          if (e.target) e.target.value = "";
          clearHoldSearchUiFreeze({ keepInput: true });
          renderActiveHoldTicketsFromCache();
          setHandoverMessage("Đã mở khóa danh sách phiếu HOLD.", "green");
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          freezeHoldSearchUi(e.target?.value || "", HOLD_SEARCH_UI_FREEZE_MS);
          searchHoldTicketFromInput();
        }
      });
      document.getElementById("holdTicketList")?.addEventListener("click", handleHoldTicketAction);
      document.getElementById("riderOverviewTable")?.addEventListener("click", handleRiderOverviewUiAction);
      document.getElementById("btnCloseHoldQrModal")?.addEventListener("click", closeHoldTicketQrModal);
      document.getElementById("btnCloseHoldQrModalBottom")?.addEventListener("click", closeHoldTicketQrModal);
      document.getElementById("btnCopyHoldQrTicketNo")?.addEventListener("click", async () => {
        const ticketNo = clean(document.getElementById("holdQrTicketNo")?.textContent || "");
        if (ticketNo && ticketNo !== "-") await copyTextForUi(ticketNo, "Đã copy mã phiếu " + ticketNo + ".", "hold");
      });
      document.getElementById("holdQrModal")?.addEventListener("click", e => {
        if (e.target?.id === "holdQrModal") closeHoldTicketQrModal();
      });
      document.getElementById("btnCopyHandoverSuccessCodes")?.addEventListener("click", copyHandoverSuccessCodes);
      document.getElementById("btnCloseHandoverSuccessTop")?.addEventListener("click", closeHandoverSuccessModal);
      document.getElementById("btnCloseHandoverSuccess")?.addEventListener("click", closeHandoverSuccessModal);
      document.getElementById("handoverSuccessModal")?.addEventListener("click", e => {
        if (e.target?.id === "handoverSuccessModal") closeHandoverSuccessModal();
      });
      document.getElementById("btnPrintPickList").addEventListener("click", printPickList);
      document.getElementById("btnReset").addEventListener("click", resetSession);
      document.getElementById("btnClearHoldDriverName")?.addEventListener("click", () => {
        const input = document.getElementById("holdDriverName");
        if (input) { input.value = ""; input.focus(); }
        setHandoverMessage("Đã xóa tên tài xế khỏi ô nhập.", "green");
      });
      // V1.8: Enter sau tên tài xế chuyển thẳng xuống ô scan/nhập mã đơn kế tiếp.
      document.getElementById("holdDriverName")?.addEventListener("keydown", e => {
        if (e.key !== "Enter" || e.repeat || e.isComposing) return;
        e.preventDefault();
        const rows = [...document.querySelectorAll(".suffix-input")];
        let nextInput = rows.find(row => !clean(row.value));
        if (!nextInput) {
          addSuffixInput();
          nextInput = [...document.querySelectorAll(".suffix-input")].pop();
        }
        if (nextInput) { nextInput.focus(); nextInput.select?.(); }
        setHandoverMessage("Đã nhận tên tài xế. Vui lòng scan hoặc nhập mã đơn.", "green");
      });
      document.getElementById("btnScan").addEventListener("click", checkScan);
      document.getElementById("btnCameraScanHandover").addEventListener("click", () => openCameraScanner("handover"));
      document.getElementById("btnOcrScanHandover").addEventListener("click", () => openOcrScanner("handover"));
      const scanInputEl = document.getElementById("scanInput");
      let pdaScanTimer = null;

      // PDA scanner: hỗ trợ Enter hoặc Tab suffix
      scanInputEl.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          clearTimeout(pdaScanTimer);

          if (!scanInputEl.disabled && clean(scanInputEl.value)) {
            checkScan();
          }
        }
      });

      // PDA scanner: hỗ trợ scanner không gửi Enter/Tab
      scanInputEl.addEventListener("input", () => {
        clearTimeout(pdaScanTimer);

        if (scanInputEl.disabled) return;

        const value = clean(scanInputEl.value);
        if (!value) return;

        pdaScanTimer = setTimeout(() => {
          const currentValue = clean(scanInputEl.value);

          if (currentValue && !scanInputEl.disabled) {
            checkScan();
          }
        }, 180);
      });
      document.getElementById("btnCloseModal").addEventListener("click", closeModal);
      document.getElementById("btnBackFromModal").addEventListener("click", closeModal);
      document.getElementById("btnScanFocus").addEventListener("click", () => document.getElementById("scanInput").focus());
      document.getElementById("btnCloseCameraScanner").addEventListener("click", closeCameraScanner);
      document.getElementById("btnCameraStop").addEventListener("click", closeCameraScanner);
      document.getElementById("btnCameraPaste").addEventListener("click", pasteIntoCameraScanner);
      document.getElementById("btnCloseOcrScan").addEventListener("click", closeOcrScanner);
      document.getElementById("btnOcrClose2").addEventListener("click", closeOcrScanner);
      document.getElementById("btnOcrCapture").addEventListener("click", captureOcrFrame);
      document.getElementById("btnOcrRead").addEventListener("click", readOcrCapturedImage);
      document.getElementById("btnOcrRetake").addEventListener("click", retakeOcrPhoto);
      document.getElementById("btnOcrSwitchCamera").addEventListener("click", switchOcrCamera);
      document.getElementById("ocrResultList").addEventListener("click", e => {
        const toggle = e.target?.closest?.("[data-o0-toggle]");
        if (toggle) {
          e.preventDefault();
          toggleOcrO0Char(toggle.dataset.o0Toggle);
          return;
        }
        const target = e.target?.closest?.("[data-ocr-use],[data-ocr-copy]");
        if (!target) return;
        const useIndex = target.dataset?.ocrUse;
        const copyIndex = target.dataset?.ocrCopy;
        if (useIndex !== undefined) useOcrCode(getEditedOcrCandidateCode(useIndex));
        if (copyIndex !== undefined) copyOcrCode(getEditedOcrCandidateCode(copyIndex));
      });
    }


    // =========================
    // AUTO IDLE Realtime PAUSE - QUOTA GUARD V2
    // Sau 30 phut khong thao tac: chi ngat ket noi Realtime cua tab nay, GIU NGUYEN DANG NHAP.
    // Cloud/D1/Server/Server van online. Chi noi lai khi nguoi dung bam Co tren popup xac nhan.
    // =========================
    const IDLE_Realtime_PAUSE_MS = 30 * 60 * 1000;
    const RIDER_KEEP_ONLINE_KEY = "VNWL_RIDER_KEEP_ONLINE_V1";
    let idleRealtimeTimer = null;
    let idleRealtimePaused = false;
    let idleRealtimeResumeBusy = false;
    let idleRealtimeStarted = false;
    let idleLastActivityMs = Date.now();

    function setIdleRealtimePanel(suspended, message = "") {
      const panel = document.getElementById("idleRealtimePanel");
      const label = document.getElementById("idleRealtimeMessage");
      if (panel) panel.style.display = suspended ? "block" : "none";
      if (label && message) label.textContent = message;
      if (suspended) {
        const text = document.getElementById("sourceHealthText");
        if (text) text.textContent = "Kênh trực tuyến: tạm ngắt sau 30 phút không thao tác";
        setSourceChip("chipSqlLive", false);
        setSourceChip("chipFmsLive", false);
        setSourceChip("chipOmsLive", false);
      }
    }

    function setIdleReconnectPrompt(open) {
      const modal = document.getElementById("idleReconnectModal");
      if (modal) modal.style.display = open ? "flex" : "none";
    }

    function requestIdleReconnectConfirmation() {
      if (!(idleRealtimePaused || isRealtimeTransportSuspended())) return;
      setIdleReconnectPrompt(true);
    }

    function riderOverviewMustStayOnline() {
      // V1.8: màn Rider Overview luôn giữ kênh trực tuyến khi đang mở; không còn tùy chọn bật/tắt.
      try { return !!document.getElementById("pageRiderOverview")?.classList.contains("active"); }
      catch { return false; }
    }

    function hasPendingBusinessInteraction() {
      return !!(
        createOrderBusy || holdTicketBusy || autoHandoverBusy ||
        document.getElementById("handoverModal")?.classList.contains("show") ||
        document.getElementById("locationToolsModalBackdrop")?.classList.contains("show") ||
        document.getElementById("cameraScannerModal")?.classList.contains("show") ||
        document.getElementById("ocrScanModal")?.classList.contains("show")
      );
    }

    function scheduleIdleRealtimePause(delayMs = IDLE_Realtime_PAUSE_MS) {
      if (idleRealtimeTimer) clearTimeout(idleRealtimeTimer);
      if (idleRealtimePaused) return;
      idleRealtimeTimer = setTimeout(() => pauseRealtimeAfterIdle(), Math.max(1000, Number(delayMs || IDLE_Realtime_PAUSE_MS)));
    }

    async function pauseRealtimeAfterIdle() {
      if (idleRealtimePaused) return;
      const idleMs = Date.now() - idleLastActivityMs;
      if (idleMs < IDLE_Realtime_PAUSE_MS - 1000) {
        scheduleIdleRealtimePause(IDLE_Realtime_PAUSE_MS - idleMs);
        return;
      }
      if (riderOverviewMustStayOnline()) {
        scheduleIdleRealtimePause(60 * 1000);
        return;
      }
      if (hasPendingBusinessInteraction()) {
        scheduleIdleRealtimePause(60 * 1000);
        return;
      }
      idleRealtimePaused = true;
      try { stopRecentOrdersListener(); } catch {}
      try { stopHoldTicketsListener(); } catch {}
      try { if (riderOverviewTimer) clearInterval(riderOverviewTimer); riderOverviewTimer = null; } catch {}
      try { if (riderOverviewSilentTimer) clearTimeout(riderOverviewSilentTimer); riderOverviewSilentTimer = null; } catch {}
      try { if (activeAccessTimer) clearInterval(activeAccessTimer); activeAccessTimer = null; } catch {}
      try { await releaseActiveAccessPresence(); } catch {}
      try {
        const frame = document.getElementById("locationToolsFrame");
        const modal = document.getElementById("locationToolsModalBackdrop");
        if (frame && !modal?.classList.contains("show")) frame.src = "about:blank";
      } catch {}
      try { await suspendRealtimeTransportForIdle("idle_30_minutes"); } catch (e) { console.warn("Suspend Realtime idle warning", e); }
      setIdleRealtimePanel(true, "Đã tạm ngắt cập nhật trực tuyến sau 30 phút không thao tác. Tài khoản vẫn đăng nhập.");
      setIdleReconnectPrompt(true);
      try { setMessage("Đã tạm ngắt cập nhật trực tuyến để tiết kiệm quota. Chỉ kết nối lại khi bạn bấm Có trong popup.", "green"); } catch {}
    }

    async function resumeRealtimeFromIdle(reason = "user_activity") {
      if ((!idleRealtimePaused && !isRealtimeTransportSuspended()) || idleRealtimeResumeBusy) return;
      idleRealtimeResumeBusy = true;
      setIdleRealtimePanel(true, "Đang kết nối lại Realtime và tải dữ liệu mới nhất...");
      try {
        const result = await resumeRealtimeTransportAfterIdle(reason);
        if (!result || result.ok !== true) throw new Error("Chưa nhận được tín hiệu Server trực tuyến");
        idleRealtimePaused = false;
        setIdleReconnectPrompt(false);
        setIdleRealtimePanel(false);
        idleLastActivityMs = Date.now();
        startRecentOrdersListener();
        // V1.4: không bật polling nền/presence write sau reconnect.
        if (isHandoverPageVisible()) setTimeout(() => loadTodayHoldTickets(), 80);
        if (document.getElementById("pageRiderOverview")?.classList.contains("active")) setTimeout(() => loadRiderOverview(true), 100);
        setMessage("Đã kết nối lại Server trực tuyến và đồng bộ dữ liệu mới nhất.", "green");
        scheduleIdleRealtimePause();
      } catch (e) {
        console.warn("Resume Realtime idle warning", e);
        setIdleRealtimePanel(true, "Chưa kết nối lại được. Kiểm tra Server rồi bấm Kết nối lại.");
      } finally {
        idleRealtimeResumeBusy = false;
      }
    }

    function noteClickActivityForIdleRealtime(reason = "pointerdown") {
      if (idleRealtimePaused || isRealtimeTransportSuspended()) {
        requestIdleReconnectConfirmation();
        return;
      }
      idleLastActivityMs = Date.now();
      scheduleIdleRealtimePause();
    }

    function startIdleRealtimePauseControl() {
      if (idleRealtimeStarted) return;
      idleRealtimeStarted = true;
      // V1.8: Rider Overview luôn trực tuyến khi trang này đang mở; không cần lưu thiết lập người dùng.
      document.getElementById("btnResumeRealtime")?.addEventListener("click", () => requestIdleReconnectConfirmation());
      document.getElementById("btnIdleReconnectYes")?.addEventListener("click", () => resumeRealtimeFromIdle("idle_confirm_yes"));
      document.getElementById("btnIdleReconnectNo")?.addEventListener("click", () => setIdleReconnectPrompt(false));
      // Chi click/cham truc tiep tren APP moi duoc tinh la thao tac.
      // Scroll, doi tab, keydown/input va update tu dong KHONG gia han phien va KHONG tu ket noi lai.
      function handleClickActivityForIdleRealtime(event) {
        if (idleRealtimePaused || isRealtimeTransportSuspended()) {
          const target = event?.target;
          const isConfirmButton = !!target?.closest?.("#btnIdleReconnectYes, #btnIdleReconnectNo");
          if (!isConfirmButton) {
            try { event.preventDefault(); event.stopPropagation(); } catch {}
            requestIdleReconnectConfirmation();
          }
          return;
        }
        noteClickActivityForIdleRealtime(event?.type || "pointerdown");
      }
      ["pointerdown", "touchstart"].forEach(evt => {
        window.addEventListener(evt, handleClickActivityForIdleRealtime, { passive: false, capture: true });
      });
      scheduleIdleRealtimePause();
      console.log("[VNWL] Auto pause Realtime enabled: 30 minutes without click/touch; reconnect requires confirmation.");
    }

    // =========================
    // ACTIVE ACCESS COUNTER - v2.8.7
    // Hiển thị số tab/máy đang mở app. Mobile cũng tính là 1 truy cập.
    // Heartbeat 5 phút/lần để hạn chế D1 writes.
    // =========================
    const ACTIVE_ACCESS_COLLECTION = "app_presence_v281";
    const ACTIVE_ACCESS_DOC = "WH1";
    const ACTIVE_ACCESS_HEARTBEAT_MS = 5 * 60 * 1000;
    const ACTIVE_ACCESS_TTL_MS = 10 * 60 * 1000;

    let activeAccessTimer = null;

    function getActiveAccessClientId() {
      try {
        let id = sessionStorage.getItem("WH4H_ACTIVE_ACCESS_CLIENT_ID");
        if (!id) {
          id = "tab_" + Date.now() + "_" + Math.random().toString(36).slice(2);
          sessionStorage.setItem("WH4H_ACTIVE_ACCESS_CLIENT_ID", id);
        }
        return id;
      } catch {
        return "tab_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      }
    }

    function ensureActiveAccessBadge() {
      let badge = document.getElementById("wh4hActiveAccessBadge");
      if (badge) return badge;

      badge = document.createElement("div");
      badge.id = "wh4hActiveAccessBadge";
      badge.style.cssText = `
        position: fixed;
        right: 12px;
        top: 12px;
        z-index: 99999;
        background: rgba(17,24,39,.88);
        color: #fff;
        border: 1px solid rgba(255,255,255,.16);
        border-radius: 999px;
        padding: 6px 10px;
        font: 12px var(--vnwl-ui-font, Arial, "Segoe UI", Tahoma, sans-serif);
        box-shadow: 0 4px 12px rgba(0,0,0,.22);
      `;
      badge.textContent = "Đang truy cập: ...";

      document.documentElement.appendChild(badge);
      return badge;
    }

    function updateActiveAccessBadge(count, realtimeCount) {
      try {
        const badge = ensureActiveAccessBadge();
        const rtText = typeof realtimeCount === "number" ? ` | Trực tuyến: ${realtimeCount}` : "";
        badge.textContent = `Đang truy cập: ${count}${rtText}`;
      } catch {}
    }

    async function updateActiveAccessPresence() {
      // V1.4 QUOTA-SAFE: bỏ heartbeat ghi D1; số máy realtime do Durable Object quản lý.
      return;
    }

    async function releaseActiveAccessPresence() {
      // V1.4 QUOTA-SAFE: không ghi D1 khi đóng tab.
      return;
    }

    function startActiveAccessCounter() {
      // V1.4: connection badge/status lấy từ WebSocket room, không tạo request D1 nền.
      if (activeAccessTimer) clearInterval(activeAccessTimer);
      activeAccessTimer = null;
    }


    async function connectD1() {
      setMessage("Đang kết nối Server...");
      setHandoverMessage("Đang kết nối Server...");
      db = initializeD1(app, { experimentalForceLongPolling: true });
        // READ OPTIMIZED v2.8.7: bỏ query test kết nối D1.
      try {
        const cacheCleared = await clearOldCacheOnVersionChange();
        if (cacheCleared) {
          console.log("[VNWL] Cleared old local cache after version update.");
        }
        const dailyCacheCleared = await clearBrowserOperationalCacheForDailyReset();
        if (dailyCacheCleared) {
          console.log("[VNWL] Cleared browser operation cache for 06:00 daily full reset.");
        }
        await localCleanupOncePerDay();
      } catch (cacheError) {
        console.warn("IndexedDB cache warning:", cacheError);
      }

      setMessage("Đã sẵn sàng: " + getWarehouse(), "green");
        startActiveAccessCounter();
      setHandoverMessage("Đã sẵn sàng: " + getWarehouse(), "green");
        startIdleRealtimePauseControl();
    }



    // =========================
    // IndexedDB Local Cache
    // D1 = database gốc; IndexedDB = database local riêng theo máy/profile.
    // =========================

    function deleteIndexedDbDatabase(dbName) {
      return new Promise((resolve) => {
        if (!("indexedDB" in window)) {
          resolve(false);
          return;
        }

        const req = indexedDB.deleteDatabase(dbName);

        req.onsuccess = () => resolve(true);
        req.onerror = () => {
          console.warn("Không xóa được IndexedDB:", req.error);
          resolve(false);
        };
        req.onblocked = () => {
          console.warn("IndexedDB delete bị blocked. Hãy đóng tab WH4H khác nếu có.");
          resolve(false);
        };
      });
    }

    async function clearOldCacheOnVersionChange() {
      const oldVersion = localStorage.getItem(APP_VERSION_KEY);

      if (oldVersion === APP_VERSION) return false;

      // Nếu code mới chạy, xóa cache local cũ để tránh dữ liệu cũ còn hiện trên web app.
      localDbPromise = null;

      const dbNamesToDelete = [
        "WH4H_LOCAL_DB_V1",
        "WH4H_LOCAL_DB_V2_CLEAN_START",
        "WH4H_LOCAL_DB_V280",
        LOCAL_DB_NAME
      ];

      for (const dbName of Array.from(new Set(dbNamesToDelete))) {
        await deleteIndexedDbDatabase(dbName);
      }

      // Chỉ xóa các key liên quan WH4H, không clear toàn bộ localStorage.
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith("WH4H_")) localStorage.removeItem(key);
      });

      localStorage.setItem(APP_VERSION_KEY, APP_VERSION);

      allOrders = [];
      lastSyncTime = null;

      console.log("[WH4H] App version changed:", oldVersion || "none", "→", APP_VERSION, "| old IndexedDB cache cleared");
      return true;
    }


    function openLocalDb() {
      if (localDbPromise) return localDbPromise;

      localDbPromise = new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
          reject(new Error("Trình duyệt không hỗ trợ IndexedDB"));
          return;
        }

        const req = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);

        req.onupgradeneeded = event => {
          const database = event.target.result;

          if (!database.objectStoreNames.contains(LOCAL_ORDER_STORE)) {
            const store = database.createObjectStore(LOCAL_ORDER_STORE, { keyPath: "id" });
            store.createIndex("warehouse_code", "warehouse_code", { unique: false });
            store.createIndex("updated_at_ms", "updated_at_ms", { unique: false });
            store.createIndex("created_at_ms", "created_at_ms", { unique: false });
            store.createIndex("order_code", "order_code", { unique: false });
            store.createIndex("status", "status", { unique: false });
          }

          if (!database.objectStoreNames.contains(LOCAL_META_STORE)) {
            database.createObjectStore(LOCAL_META_STORE, { keyPath: "key" });
          }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("Không mở được IndexedDB"));
      });

      return localDbPromise;
    }

    function idbRequest(req) {
      return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("IndexedDB request error"));
      });
    }

    function idbTxDone(tx) {
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction error"));
        tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction abort"));
      });
    }

    function cacheMetaKey(name) {
      return getOrdersCollectionName() + "::" + name;
    }

    function getTodayKey() {
      const d = new Date();
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }

    // VNWL V1.8: một ngày vận hành bắt đầu lúc 06:00 Việt Nam; sau mốc này local cache phải rỗng như app mới.
    const DAILY_FULL_RESET_HOUR_VN = 6;
    const DAILY_FULL_RESET_CACHE_KEY = "VNWL_DAILY_FULL_RESET_OPERATION_DAY";
    let dailyFullResetTargetMs = 0;
    let dailyFullResetTimer = null;
    let dailyFullResetBusy = false;

    function getOperationalDayAt0600Vn() {
      const shifted = new Date(Date.now() - DAILY_FULL_RESET_HOUR_VN * 60 * 60 * 1000);
      return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(shifted);
    }

    function getNextDailyFullResetAtMs() {
      const now = Date.now();
      const hourMs = 60 * 60 * 1000;
      const vnClock = new Date(now + 7 * hourMs);
      let next = Date.UTC(vnClock.getUTCFullYear(), vnClock.getUTCMonth(), vnClock.getUTCDate(), DAILY_FULL_RESET_HOUR_VN - 7, 0, 0, 0);
      if (next <= now) next += 24 * hourMs;
      return next;
    }

    async function clearBrowserOperationalCacheForDailyReset() {
      const operationDay = getOperationalDayAt0600Vn();
      if (localStorage.getItem(DAILY_FULL_RESET_CACHE_KEY) === operationDay) return false;
      // Không deleteDatabase khi app đang mở vì kết nối IndexedDB đang active có thể làm thao tác bị blocked.
      // Clear store trực tiếp để tại đúng 06:00 bảng trên PC/Mobile rỗng ngay, cho toàn bộ kho.
      try {
        const localDb = await openLocalDb();
        const tx = localDb.transaction([LOCAL_ORDER_STORE, LOCAL_META_STORE], "readwrite");
        tx.objectStore(LOCAL_ORDER_STORE).clear();
        tx.objectStore(LOCAL_META_STORE).clear();
        await idbTxDone(tx);
      } catch (cacheError) {
        console.warn("Daily reset direct IndexedDB clear warning:", cacheError);
        localDbPromise = null;
        await deleteIndexedDbDatabase(LOCAL_DB_NAME);
      }
      localStorage.setItem(DAILY_FULL_RESET_CACHE_KEY, operationDay);
      allOrders = [];
      lastSyncTime = null;
      recentOrdersPages = new Map();
      holdTicketCache = new Map();
      currentHoldTicket = null;
      return true;
    }

    function renderDailyFullResetCountdown() {
      const el = document.getElementById("dailyFullResetCountdown");
      if (!el || !dailyFullResetTargetMs) return;
      const seconds = Math.max(0, Math.ceil((dailyFullResetTargetMs - Date.now()) / 1000));
      const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
      const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
      const ss = String(seconds % 60).padStart(2, "0");
      el.textContent = hh + ":" + mm + ":" + ss;
    }

    async function runAutomaticDailyFullResetFromScreen() {
      if (dailyFullResetBusy) return;
      dailyFullResetBusy = true;
      try {
        await clearBrowserOperationalCacheForDailyReset();
        if (typeof apiPost === "function") {
          await apiPost("/api/cleanup/daily_retention", {
            warehouse: getWarehouse(),
            trigger: "DAILY_FULL_RESET_0600_HTML",
            full_reset_all_order_and_ticket_statuses: true
          });
        }
      } catch (error) {
        console.warn("VNWL daily 06:00 reset warning:", error);
      } finally {
        window.location.reload();
      }
    }

    function startDailyFullResetCountdown() {
      dailyFullResetTargetMs = getNextDailyFullResetAtMs();
      renderDailyFullResetCountdown();
      if (dailyFullResetTimer) clearInterval(dailyFullResetTimer);
      dailyFullResetTimer = setInterval(() => {
        if (Date.now() >= dailyFullResetTargetMs) {
          clearInterval(dailyFullResetTimer);
          dailyFullResetTimer = null;
          runAutomaticDailyFullResetFromScreen();
          return;
        }
        renderDailyFullResetCountdown();
      }, 1000);
    }

    function dateToMs(value) {
      const d = toDate(value);
      return d ? d.getTime() : 0;
    }

    function serializeOrderForCache(order) {
      const normalized = normalizeOrder(order);
      const createdMs = dateToMs(normalized.created_at || normalized.prepared_at);
      const updatedMs = dateToMs(normalized.updated_at || normalized.created_at || normalized.prepared_at);
      const preparedMs = dateToMs(normalized.prepared_at);
      const riderArrivedMs = dateToMs(normalized.rider_arrived_at);
      const handedOverMs = dateToMs(normalized.handed_over_at);

      return {
        ...normalized,
        suffix_keys: Array.isArray(order.suffix_keys) ? order.suffix_keys : buildSuffixKeys(normalized.order_code),
        created_at: createdMs ? new Date(createdMs).toISOString() : "",
        updated_at: updatedMs ? new Date(updatedMs).toISOString() : "",
        prepared_at: preparedMs ? new Date(preparedMs).toISOString() : "",
        rider_arrived_at: riderArrivedMs ? new Date(riderArrivedMs).toISOString() : "",
        handed_over_at: handedOverMs ? new Date(handedOverMs).toISOString() : "",
        created_at_ms: createdMs,
        updated_at_ms: updatedMs,
        prepared_at_ms: preparedMs,
        rider_arrived_at_ms: riderArrivedMs,
        handed_over_at_ms: handedOverMs,
        cached_at_ms: Date.now()
      };
    }

    async function localGetMeta(name) {
      const localDb = await openLocalDb();
      const tx = localDb.transaction(LOCAL_META_STORE, "readonly");
      const store = tx.objectStore(LOCAL_META_STORE);
      const result = await idbRequest(store.get(cacheMetaKey(name)));
      return result ? result.value : null;
    }

    async function localSetMeta(name, value) {
      const localDb = await openLocalDb();
      const tx = localDb.transaction(LOCAL_META_STORE, "readwrite");
      tx.objectStore(LOCAL_META_STORE).put({
        key: cacheMetaKey(name),
        value,
        updated_at_ms: Date.now()
      });
      await idbTxDone(tx);
    }

    async function localSaveOrders(orders) {
      if (!orders || !orders.length) return;

      const localDb = await openLocalDb();
      const tx = localDb.transaction(LOCAL_ORDER_STORE, "readwrite");
      const store = tx.objectStore(LOCAL_ORDER_STORE);

      orders.forEach(order => {
        store.put(serializeOrderForCache(order));
      });

      await idbTxDone(tx);
    }

    async function localDeleteOrder(id) {
      const localDb = await openLocalDb();
      const tx = localDb.transaction(LOCAL_ORDER_STORE, "readwrite");
      tx.objectStore(LOCAL_ORDER_STORE).delete(id);
      await idbTxDone(tx);
    }


    async function localClearCurrentWarehouseOrders() {
      const localDb = await openLocalDb();
      const tx = localDb.transaction([LOCAL_ORDER_STORE, LOCAL_META_STORE], "readwrite");
      const orderStore = tx.objectStore(LOCAL_ORDER_STORE);
      const metaStore = tx.objectStore(LOCAL_META_STORE);
      const warehouse = getWarehouse();

      await new Promise((resolve, reject) => {
        const cursorReq = orderStore.openCursor();
        cursorReq.onsuccess = event => {
          const cursor = event.target.result;
          if (!cursor) return resolve();
          const order = cursor.value || {};
          if (!warehouse || order.warehouse_code === warehouse) cursor.delete();
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error || new Error("Lỗi clear IndexedDB"));
      });

      try { metaStore.delete(cacheMetaKey("lastSyncTime")); } catch {}
      try { metaStore.delete(cacheMetaKey("liveUpdateLastSeen")); } catch {}
      try { metaStore.delete(cacheMetaKey("lastCleanupDate")); } catch {}
      await idbTxDone(tx);
    }

    async function localReplaceOrdersForCurrentWarehouse(orders) {
      const input = Array.isArray(orders) ? orders : [];
      const localDb = await openLocalDb();
      const tx = localDb.transaction([LOCAL_ORDER_STORE, LOCAL_META_STORE], "readwrite");
      const orderStore = tx.objectStore(LOCAL_ORDER_STORE);
      const metaStore = tx.objectStore(LOCAL_META_STORE);
      const warehouse = getWarehouse();

      await new Promise((resolve, reject) => {
        const cursorReq = orderStore.openCursor();
        cursorReq.onsuccess = event => {
          const cursor = event.target.result;
          if (!cursor) return resolve();
          const order = cursor.value || {};
          if (!warehouse || order.warehouse_code === warehouse) cursor.delete();
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error || new Error("Lỗi replace IndexedDB"));
      });

      input.forEach(order => orderStore.put(serializeOrderForCache(order)));
      metaStore.put({ key: cacheMetaKey("lastSyncTime"), value: new Date().toISOString(), updated_at_ms: Date.now() });
      await idbTxDone(tx);
    }

    async function localLoadOrdersForCurrentWarehouse() {
      const localDb = await openLocalDb();
      const tx = localDb.transaction(LOCAL_ORDER_STORE, "readonly");
      const store = tx.objectStore(LOCAL_ORDER_STORE);
      const allCached = await idbRequest(store.getAll());

      const warehouse = getWarehouse();
      const dMinus3Ms = getDMinus3Start().getTime();

      return allCached
        .filter(order => order.warehouse_code === warehouse)
        .filter(order => Math.max(order.created_at_ms || 0, order.updated_at_ms || 0) >= dMinus3Ms)
        .map(order => normalizeOrder(order))
        .sort((a, b) => getOrderTimestampMs(b) - getOrderTimestampMs(a));
    }

    async function localCleanupOncePerDay() {
      const todayKey = getTodayKey();
      const lastCleanup = await localGetMeta("lastCleanupDate");

      if (lastCleanup === todayKey) return;

      const localDb = await openLocalDb();
      const tx = localDb.transaction([LOCAL_ORDER_STORE, LOCAL_META_STORE], "readwrite");
      const orderStore = tx.objectStore(LOCAL_ORDER_STORE);
      const metaStore = tx.objectStore(LOCAL_META_STORE);

      const cutoffMs = Date.now() - INDEXEDDB_CLEANUP_DAYS * 24 * 60 * 60 * 1000;
      let deleted = 0;

      await new Promise((resolve, reject) => {
        const cursorReq = orderStore.openCursor();

        cursorReq.onsuccess = event => {
          const cursor = event.target.result;
          if (!cursor) {
            resolve();
            return;
          }

          const order = cursor.value;
          const orderMs = Math.max(
            order.updated_at_ms || 0,
            order.created_at_ms || 0,
            order.handed_over_at_ms || 0,
            order.prepared_at_ms || 0
          );

          if (orderMs && orderMs < cutoffMs) {
            cursor.delete();
            deleted++;
          }

          cursor.continue();
        };

        cursorReq.onerror = () => reject(cursorReq.error || new Error("Lỗi cleanup IndexedDB"));
      });

      metaStore.put({
        key: cacheMetaKey("lastCleanupDate"),
        value: todayKey,
        updated_at_ms: Date.now()
      });

      await idbTxDone(tx);

      if (deleted > 0) {
        console.log("[WH4H IndexedDB] Cleanup local cache:", deleted, "records");
      }
    }

    async function localPersistCurrentState() {
      await localSaveOrders(allOrders);
      const newest = allOrders[0] ? toDate(allOrders[0].updated_at || allOrders[0].created_at || allOrders[0].prepared_at) : null;
      if (newest) {
        await localSetMeta("lastSyncTime", newest.toISOString());
      }
    }



    // =========================
    // WH4H Optimized Read Design - VERSION 2.9.4
    // - orders_v280_WHx: database gốc
    // - recent_orders_v280_WHx/page_0: cache 1500 đơn thao tác gần nhất cho màn hình
    // - pending_orders_v280_WHx: index tất cả đơn chưa bàn giao để check location nhanh
    // - handover_queue_v280_WHx: hàng chờ gửi API1/API2, retry đến khi API2 ACK
    // =========================
    function getRecentOrdersCollectionName() {
      return RECENT_ORDERS_PREFIX + getWarehouse();
    }


    function getHoldTicketsCollectionName() {
      return HOLD_TICKET_PREFIX + getWarehouse();
    }

    function getHoldTicketRef(ticketId) {
      return doc(db, getHoldTicketsCollectionName(), ticketId);
    }

    function getHoldCounterRef(dateKey) {
      return doc(db, HOLD_COUNTER_COLLECTION, getWarehouse() + "_" + dateKey);
    }

    async function allocateDailyTicketNumber(nowMs, sourceLabel = "ticket") {
      // Số phiếu được cấp trên Cloudflare D1 bằng thao tác tăng atomic để tất cả máy dùng chung một STT.
      const baseDate = new Date(nowMs || Date.now());
      const dateKey = getHoldDateKey(baseDate);
      const result = await apiPost("/api/hold/allocate_ticket", {
        warehouse: getWarehouse(),
        date_key: dateKey,
        source: sourceLabel
      });
      const nextSeq = Number(result.seq || 0);
      const seqText = String(nextSeq).padStart(4, "0");
      return {
        dateKey,
        seq: nextSeq,
        seqText,
        ticketNo: dateKey + "-" + seqText,
        ticketId: getWarehouse() + "_" + dateKey + "_" + seqText
      };
    }

    function getHoldDuplicateCodeKey(item) {
      return clean(item?.order_code || item?.tracking_no || item?.code || "");
    }

    function getHoldDuplicateIdKey(item) {
      return clean(item?.id || item?.order_id || "");
    }

    function normalizeHoldTicketNoDuplicateItems(ticket) {
      if (!ticket || typeof ticket !== "object") return ticket;
      const out = { ...ticket };
      const rawItems = Array.isArray(ticket.items) ? ticket.items : [];
      const seenCodes = new Set();
      const seenIds = new Set();
      const items = [];
      rawItems.forEach(raw => {
        if (!raw || typeof raw !== "object") return;
        const item = { ...raw };
        const code = getHoldDuplicateCodeKey(item);
        const id = getHoldDuplicateIdKey(item);
        if (!code && !id) return;
        if (code) {
          if (seenCodes.has(code)) return;
          seenCodes.add(code);
        } else if (id) {
          if (seenIds.has(id)) return;
          seenIds.add(id);
        }
        item.seq = items.length + 1;
        if (code) item.order_code = code;
        if (id) {
          item.id = item.id || id;
          item.order_id = item.order_id || id;
        }
        items.push(item);
      });
      const orderCodes = [];
      items.forEach(item => {
        const code = getHoldDuplicateCodeKey(item);
        if (code && !orderCodes.includes(code)) orderCodes.push(code);
      });
      (Array.isArray(ticket.order_codes) ? ticket.order_codes : []).forEach(raw => {
        const code = clean(raw || "");
        if (code && !orderCodes.includes(code)) orderCodes.push(code);
      });
      const orderIds = [];
      items.forEach(item => {
        const id = getHoldDuplicateIdKey(item);
        if (id && !orderIds.includes(id)) orderIds.push(id);
      });
      (Array.isArray(ticket.order_ids) ? ticket.order_ids : []).forEach(raw => {
        const id = clean(raw || "");
        if (id && !orderIds.includes(id)) orderIds.push(id);
      });
      out.items = items;
      out.order_codes = orderCodes;
      out.order_ids = orderIds;
      out.order_count = items.length || orderCodes.length || Number(ticket.order_count || 0);
      const removedCount = Math.max(0, rawItems.length - items.length);
      if (removedCount) {
        out.duplicate_removed_count = Number(ticket.duplicate_removed_count || 0) + removedCount;
        out.duplicate_warning = "Đã ẩn " + removedCount + " mã trùng cũ để tránh bàn giao lặp.";
      }
      return out;
    }

    function findDuplicateOrderCodesInItems(items) {
      const seen = new Set();
      const dupes = [];
      (items || []).forEach(item => {
        const code = getHoldDuplicateCodeKey(item);
        if (!code) return;
        if (seen.has(code) && !dupes.includes(code)) dupes.push(code);
        seen.add(code);
      });
      return dupes;
    }

    function dedupeHandoverItemsByOrderCode(items) {
      const seenCodes = new Set();
      const seenIds = new Set();
      const out = [];
      const duplicates = [];
      (items || []).forEach(item => {
        const code = getHoldDuplicateCodeKey(item);
        const id = getHoldDuplicateIdKey(item);
        if (code) {
          if (seenCodes.has(code)) {
            if (!duplicates.includes(code)) duplicates.push(code);
            return;
          }
          seenCodes.add(code);
        } else if (id) {
          if (seenIds.has(id)) {
            if (!duplicates.includes(id)) duplicates.push(id);
            return;
          }
          seenIds.add(id);
        }
        out.push(item);
      });
      return { items: out, duplicates };
    }

    function upsertHoldTicketCache(ticket) {
      const normalized = normalizeHoldTicketNoDuplicateItems(ticket);
      if (!normalized || !normalized.id) return normalized;
      const previous = holdTicketCache.get(String(normalized.id));
      if (previous && maxHoldTicketUpdatedAtMs([previous]) > maxHoldTicketUpdatedAtMs([normalized])
          && !(isHoldTicketStillNeedsHandover(previous) && !isHoldTicketStillNeedsHandover(normalized))) return previous;
      holdTicketCache.set(String(normalized.id), normalized);
      return normalized;
    }

    function removeHoldTicketFromCache(ticketId) {
      const id = String(ticketId || "");
      if (!id) return;
      holdTicketCache.delete(id);
    }

    function maxHoldTicketUpdatedAtMs(tickets) {
      return (tickets || []).reduce((max, ticket) => Math.max(max, Number(ticket?.updated_at_ms || 0), dateToMs(ticket?.updated_at), dateToMs(ticket?.created_at)), 0);
    }

    function rememberHoldTicketsServerUpdatedAt(tickets) {
      holdTicketsLastServerUpdatedAtMs = Math.max(holdTicketsLastServerUpdatedAtMs || 0, maxHoldTicketUpdatedAtMs(tickets || []));
    }

    function cacheHoldTickets(tickets) {
      (tickets || []).forEach(upsertHoldTicketCache);
      rememberHoldTicketsServerUpdatedAt(tickets || []);
    }

    function replaceHoldTicketCacheForToday(tickets) {
      const todayKey = getHoldDateKey();
      const incomingIds = new Set((tickets || []).map(ticket => String(ticket.id)));
      Array.from(holdTicketCache.entries()).forEach(([id, ticket]) => {
        if (String(ticket?.date_key || "") === todayKey && !incomingIds.has(id)) holdTicketCache.delete(id);
      });
      cacheHoldTickets(tickets || []);
    }

    function getCachedHoldTicket(ticketId) {
      return holdTicketCache.get(String(ticketId || "")) || null;
    }

    function isHandoverModalOpen() {
      return !!document.getElementById("handoverModal")?.classList.contains("show");
    }

    // =========================
    // LIVE UPDATE + LOCAL CACHE MODE v2.8.7
    // - Không count database để làm thống kê.
    // - Local cache giữ tối đa 5000 đơn.
    // - Giao diện hiển thị 100/200/500/1000 theo lựa chọn.
    // - Các máy cùng thấy đơn mới/bàn giao/hủy qua live_updates_v281_WHx.
    // =========================
    function getLiveUpdatesCollectionName() {
      return LIVE_UPDATES_PREFIX + getWarehouse();
    }

    function getLiveUpdateRef(action, orderId, atMs = Date.now()) {
      const safeAction = String(action || "UPDATE").replace(/[^A-Z0-9_]/gi, "_");
      return doc(db, getLiveUpdatesCollectionName(), "evt_" + atMs + "_" + safeAction + "_" + String(orderId || "").slice(0, 120));
    }

    function getLiveUpdateMetaKey() {
      return "lastLiveUpdateMs_" + getWarehouse();
    }

    function getLocalCacheLimit() {
      return LOCAL_CACHE_LIMIT;
    }

    function sortOrdersForLocalCache(orders, max = LOCAL_CACHE_LIMIT) {
      const map = new Map();
      (orders || []).forEach(order => {
        const n = normalizeOrder(order || {});
        if (!n.id) return;
        const prev = map.get(n.id);
        if (!prev || getOrderUpdatedMs(n) >= getOrderUpdatedMs(prev)) {
          map.set(n.id, n);
        }
      });

      return Array.from(map.values())
        .filter(order => !orderHiddenFromHtml(order))
        .filter(order => order.warehouse_code === getWarehouse())
        .sort((a, b) => {
          const updatedDiff = getOrderUpdatedMs(b) - getOrderUpdatedMs(a);
          if (updatedDiff) return updatedDiff;
          return getOrderCreatedMs(b) - getOrderCreatedMs(a);
        })
        .slice(0, max);
    }

    async function loadLocalCacheToScreen() {
      try {
        const cached = await localLoadOrdersForCurrentWarehouse();
        if (cached && cached.length) {
          allOrders = sortOrdersForLocalCache(cached, LOCAL_CACHE_LIMIT);
          updateTodayLoadedOrderMeta(allOrders);
          renderStats(allOrders);
          if (document.getElementById("pageManage")?.classList.contains("active")) {
            renderOrders(applyCurrentFilters(allOrders));
          }
          updateRefreshIndicator("Đã hiển thị cache local. Đang nghe đơn mới...");
        }
      } catch (error) {
        console.warn("Load local cache warning:", error);
      }
    }


    function replaceOrdersFromServer(orders, messageText = "Đã cập nhật dữ liệu từ Server.") {
      const input = Array.isArray(orders) ? orders : [];
      allOrders = sortOrdersForLocalCache(input.map(o => normalizeOrder(o)), LOCAL_CACHE_LIMIT);
      updateTodayLoadedOrderMeta(allOrders);
      renderStats(allOrders);
      if (document.getElementById("pageManage")?.classList.contains("active")) {
        renderOrders(applyCurrentFilters(allOrders));
      }
      localReplaceOrdersForCurrentWarehouse(allOrders).catch(err => console.warn("Local replace cache warning:", err));
      if (messageText) updateRefreshIndicator(messageText);
    }

    async function syncLocalSnapshotToCloud(force = false, options = {}) {
      try {
        if (typeof apiPost !== "function") return null;
        const cached = await localLoadOrdersForCurrentWarehouse();
        const combined = sortOrdersForLocalCache([...(cached || []), ...(allOrders || [])], LOCAL_CACHE_LIMIT);
        if (!combined.length && !force) return null;
        const result = await apiPost("/api/sync/client_snapshot", {
          warehouse: getWarehouse(),
          collection: getOrdersCollectionName(),
          device_id: getDeviceId(),
          force,
          orders: combined.map(o => compactOrderForCache(o))
        });
        if (!options.noRender && result && result.ok && Array.isArray(result.items)) {
          replaceOrdersFromServer(result.items, "Đã gửi dữ liệu lên Server và nhận lại " + result.items.length + " dòng.");
        }
        return result;
      } catch (error) {
        if (!options.silent) console.warn("Client snapshot sync warning:", error);
        return null;
      }
    }

    function buildLiveUpdatePayload(order, action = "UPSERT", atMs = Date.now()) {
      const c = compactOrderForCache(order || {});
      return {
        action,
        order_id: c.id,
        order_code: c.order_code || "",
        warehouse_code: c.warehouse_code || getWarehouse(),
        status: c.status || "NO_RIDER",
        updated_at: serverTimestamp(),
        updated_at_ms: atMs,
        device_id: getDeviceId(),
        code_version: CODE_VERSION,
        order: c
      };
    }

    function applyLiveUpdateToMemory(update) {
      if (!update) return false;
      if (update.type === "reset_all_data") {
        allOrders = [];
        holdTicketCache = new Map();
        currentHoldTicket = null;
        const holdList = document.getElementById("holdTicketList");
        if (holdList) holdList.innerHTML = "";
        clearBrowserOperationalCacheForDailyReset().catch(err => console.warn("Daily reset browser cache warning:", err));
        localClearCurrentWarehouseOrders().catch(err => console.warn("Local reset live warning:", err));
        renderStats(allOrders);
        if (document.getElementById("pageManage")?.classList.contains("active")) renderOrders([]);
        updateRefreshIndicator("Đã nhận reset data từ server.");
        return true;
      }
      const action = String(update.action || "UPSERT").toUpperCase();
      const orderId = update.order_id || update.order?.id;
      if (!orderId) return false;

      if (action === "DELETE") {
        const before = allOrders.length;
        allOrders = allOrders.filter(order => order.id !== orderId);
        localDeleteOrder(orderId).catch(error => console.warn("Local delete live update warning:", error));
        return before !== allOrders.length;
      }

      const orderPayload = update.order || update;
      const normalized = normalizeOrder({
        id: orderId,
        ...orderPayload,
        warehouse_code: orderPayload.warehouse_code || update.warehouse_code || getWarehouse(),
        status: orderPayload.status || update.status || "NO_RIDER"
      });

      if (normalized.warehouse_code !== getWarehouse()) return false;

      if (orderHiddenFromHtml(normalized)) {
        const before = allOrders.length;
        allOrders = allOrders.filter(order => order.id !== normalized.id);
        localDeleteOrder(normalized.id).catch(error => console.warn("Local delete hidden live update warning:", error));
        return before !== allOrders.length;
      }

      mergeOrdersIntoMemory([normalized]);
      localSaveOrders([normalized]).catch(error => console.warn("Local save live update warning:", error));
      return true;
    }

    async function startLiveUpdatesListener() {
      // V1.4 QUOTA-SAFE: bỏ collection live_updates. Worker broadcast thẳng document delta.
      return;
    }


    async function refreshOrdersFromD1AfterExternalUpdate(reason = "external_update", options = {}) {
      try {
        updateRefreshIndicator("Đang đồng bộ nhanh từ Server sau " + reason + "...");
        const direct = await loadInitialD1OrdersDirect({ fast: true, forceReconcile: false });
        if (direct && Array.isArray(direct.items)) {
          replaceOrdersFromServer(direct.items, "Đã cập nhật nhanh màn hình từ Server sau " + reason + ": " + direct.items.length + " dòng.");
        } else {
          await loadRecentOrdersPagesOnce(true);
        }
        if (options.background !== false) {
          setTimeout(() => runStrictBackgroundReconcile(reason), 250);
        }
      } catch (error) {
        console.warn("Refresh D1 after external update failed:", error);
        updateRefreshIndicator("Tải lại Server sau upload lỗi: " + (error.message || error));
      }
    }
    window.refreshOrdersFromD1AfterExternalUpdate = refreshOrdersFromD1AfterExternalUpdate;

    window.addEventListener("message", event => {
      if (event.origin !== location.origin) return;
      const msg = event && event.data;
      if (!msg) return;
      if (msg.type === "VNWL_CLOSE_LOCATION_TOOLS") {
        try { closeLocationTools(); } catch (_) {}
        return;
      }
      if (msg.type !== "VNWL_LOCATION_UPLOAD_DONE") return;
      const pct = msg.cloud_d0_aux1_progress && msg.cloud_d0_aux1_progress.percent ? ` | Server: ${msg.cloud_d0_aux1_progress.percent}%` : "";
      const detail = `Tạo mới: ${msg.created || 0} | Cập nhật: ${msg.updated || 0} | Bị chặn: ${msg.blocked || 0}${pct}`;
      showVnwlToast(msg.blocked ? "Upload location hoàn tất, có dòng bị chặn" : "Upload location đã xong", detail, msg.blocked ? "warn" : "ok", 9000);
      if (Array.isArray(msg.items) && msg.items.length) {
        mergeOrdersIntoMemory(msg.items.map(item => normalizeOrder(item)));
        scheduleLiveDomRender("Upload xong: đã cập nhật " + msg.items.length + " dòng trực tiếp.");
      } else {
        updateRefreshIndicator("Upload xong. Các máy sẽ nhận delta realtime.");
      }
      // V1.4: không tải lại full snapshot sau upload; Worker phát đúng document delta.
    });


    // V23: no-page-reload realtime DOM updater.
    // Máy A thao tác -> Cloud WebSocket -> máy B update bảng ngay trong DOM.
    // Không dùng location.reload(), không đọc D1 khi D1 LIVE.
    let liveDomRenderTimer = null;
    let liveMetaPersistTimer = null;
    function scheduleLiveMetaPersist() {
      // V1.9 ANTI-LAG: delta đã được ghi riêng vào IndexedDB trong applyWsDirectDocsToDom().
      // Không ghi lại toàn bộ 1.500-5.000 đơn sau mỗi sự kiện realtime.
      if (liveMetaPersistTimer) return;
      liveMetaPersistTimer = setTimeout(() => {
        liveMetaPersistTimer = null;
        const newest = allOrders[0] ? toDate(allOrders[0].updated_at || allOrders[0].created_at || allOrders[0].prepared_at) : null;
        if (newest) localSetMeta("lastSyncTime", newest.toISOString()).catch(e => console.warn("Live meta persist warning", e));
      }, 400);
    }
    function scheduleLiveDomRender(messageText = "Đã nhận live update realtime từ máy khác.") {
      if (liveDomRenderTimer) clearTimeout(liveDomRenderTimer);
      // Gộp các thao tác từ nhiều máy trong một nhịp render để tránh giật bảng.
      liveDomRenderTimer = setTimeout(() => {
        liveDomRenderTimer = null;
        allOrders = sortOrdersForLocalCache(allOrders, LOCAL_CACHE_LIMIT);
        renderStats(allOrders);
        if (document.getElementById("pageManage")?.classList.contains("active")) {
          renderOrders(applyCurrentFilters(allOrders));
        }
        updateRefreshIndicator(messageText);
        scheduleLiveMetaPersist();
      }, 60);
    }

    function applyWsDirectDocsToDom(msg = {}) {
      const wh = getWarehouse();
      const docs = Array.isArray(msg.docs) ? msg.docs : [];
      let changed = false;
      const upserts = [];
      const deletes = [];
      let holdChanged = false;
      let currentHoldInvalidated = false;

      if (msg.type === "reset_all_data") {
        allOrders = [];
        holdTicketCache = new Map();
        currentHoldTicket = null;
        const holdList = document.getElementById("holdTicketList");
        if (holdList) holdList.innerHTML = "";
        try { clearBrowserOperationalCacheForDailyReset().catch(() => {}); } catch {}
        try { localClearCurrentWarehouseOrders().catch(() => {}); } catch {}
        renderStats(allOrders);
        if (document.getElementById("pageManage")?.classList.contains("active")) renderOrders([]);
        updateRefreshIndicator("Đã nhận reset toàn bộ data từ máy khác.");
        return true;
      }

      for (const rawDoc of docs) {
        if (!rawDoc || typeof rawDoc !== "object") continue;
        const collectionPath = String(rawDoc.collection_path || rawDoc.collection || msg.collection || "");
        const data = rawDoc.data || rawDoc.order || rawDoc;

        if ((rawDoc.deleted || rawDoc.op === "delete") && collectionPath === getOrdersCollectionName()) {
          const deletedId = String(rawDoc.id || rawDoc.doc_id || "");
          if (deletedId) deletes.push(deletedId);
          continue;
        }

        if (collectionPath === getLiveUpdatesCollectionName()) {
          if (applyLiveUpdateToMemory(data)) changed = true;
          continue;
        }

        if (collectionPath === getOrdersCollectionName()) {
          const normalized = normalizeOrder({ id: rawDoc.id || data.id || data.order_id || data.order_code, ...data });
          if (!normalized.id || normalized.warehouse_code !== wh) continue;
          if (orderHiddenFromHtml(normalized)) {
            deletes.push(normalized.id);
          } else {
            upserts.push(normalized);
          }
          continue;
        }

        if (collectionPath === getHoldTicketsCollectionName()) {
          const ticketId = String(rawDoc.id || rawDoc.doc_id || data.id || data.ticket_id || data.ticket_no || "");
          if (!ticketId) continue;
          const currentId = String(currentHoldTicket?.id || currentHoldTicket?.ticket_id || currentHoldTicket?.ticket_no || "");
          if (rawDoc.deleted || rawDoc.op === "delete") {
            removeHoldTicketFromCache(ticketId);
            if (ticketId === currentId) currentHoldInvalidated = true;
          } else {
            const ticket = normalizeHoldTicketNoDuplicateItems({ id: ticketId, ...data });
            if (!ticket.warehouse_code || String(ticket.warehouse_code).toUpperCase() === wh) {
              upsertHoldTicketCache(ticket);
              if (ticketId === currentId && !isActiveHoldTicket(ticket)) currentHoldInvalidated = true;
            }
          }
          holdChanged = true;
          continue;
        }

        if (collectionPath === getRecentOrdersCollectionName()) {
          const items = Array.isArray(data.items) ? data.items : [];
          if (items.length) {
            replaceOrdersFromServer(items, "Đã nhận dữ liệu realtime từ Server: " + items.length + " dòng.");
            changed = false;
          }
          continue;
        }
      }

      if (deletes.length) {
        const deleteSet = new Set(deletes);
        const before = allOrders.length;
        allOrders = allOrders.filter(order => !deleteSet.has(order.id));
        deletes.forEach(id => { try { localDeleteOrder(id).catch(() => {}); } catch {} });
        if (before !== allOrders.length) changed = true;
      }

      if (upserts.length) {
        mergeOrdersIntoMemory(upserts);
        try { localSaveOrders(upserts).catch(() => {}); } catch {}
        changed = true;
      }

      if (holdChanged) {
        if (currentHoldInvalidated) {
          currentHoldTicket = null;
          try { if (typeof closeHoldBoxModal === "function") closeHoldBoxModal(); } catch {}
          try { if (isHandoverModalOpen() && typeof closeModal === "function") closeModal(); } catch {}
        }
        if (isHandoverPageVisible()) scheduleRenderActiveHoldTicketsFromCache("ws_hold_delta", 120);
        mergeHoldTicketsIntoRiderOverview(getTodayHoldTicketsFromCache(true), { pushToCloud: false, reason: "ws_hold_delta" });
        // V2.0.11 STRICT AUTHORITATIVE: delta chỉ cập nhật nhanh, sau đó kéo full snapshot D0 để PC/Mobile tuyệt đối giống nhau.
        scheduleHoldAuthoritativeReload("ws_hold_delta_authoritative_snapshot", isHoldSearchUiFrozen() ? 900 : 220);
        if (isHandoverPageVisible() && !isHoldSearchUiFrozen()) setHandoverMessage("View phiếu HOLD đã nhận realtime; đang đối chiếu snapshot Server để PC/Mobile luôn giống nhau.", "green");
      }

      if (changed) {
        refreshSubSuggestion();
        scheduleLiveDomRender("Đã nhận live update realtime từ máy khác.");
      }
      return changed || holdChanged;
    }

    function getRiderCallWorkDayKey() {
      try { return getHoldDateKey(new Date()); } catch (_) { return new Date().toISOString().slice(0, 10).replaceAll("-", ""); }
    }

    function getRiderCallSpokenStorageKey() {
      return RIDER_CALL_SPOKEN_PREFIX + getRiderCallWorkDayKey();
    }

    function getRiderCallTicketKey(ticket) {
      return clean(ticket?.ticket_no || ticket?.id || ticket?.ticket_id || "");
    }

    function getRiderCallNumber(ticket) {
      const digits = getRiderCallTicketKey(ticket).replace(/\D/g, "");
      return (digits.slice(-4) || "0000").padStart(4, "0");
    }

    function loadRiderCallSpokenSet() {
      try {
        const list = JSON.parse(localStorage.getItem(getRiderCallSpokenStorageKey()) || "[]");
        return new Set(Array.isArray(list) ? list : []);
      } catch (_) { return new Set(); }
    }

    function saveRiderCallSpokenSet(set) {
      try { localStorage.setItem(getRiderCallSpokenStorageKey(), JSON.stringify(Array.from(set))); } catch (_) {}
    }

    function renderRiderCallVoiceButton() {
      const button = document.getElementById("btnRiderCallVoiceToggle");
      if (!button) return;
      button.textContent = riderCallVoiceEnabled ? "🔊 Loa gọi số: Bật" : "🔇 Loa gọi số: Tắt";
      button.className = riderCallVoiceEnabled ? "btn-green" : "btn-dark";
    }

    function setRiderCallVoiceEnabled(enabled) {
      riderCallVoiceEnabled = !!enabled;
      try { localStorage.setItem(RIDER_CALL_VOICE_ENABLED_KEY, riderCallVoiceEnabled ? "1" : "0"); } catch (_) {}
      if (!riderCallVoiceEnabled) {
        riderCallVoiceQueue = [];
        riderCallVoiceSpeaking = false;
        try { window.speechSynthesis?.cancel(); } catch (_) {}
      }
      renderRiderCallVoiceButton();
      setRiderOverviewMessage(
        riderCallVoiceEnabled
          ? "🔊 Đã bật loa gọi số tại máy này. Phiếu chuyển sang Vui lòng vào lấy hàng sẽ được đọc 2 lần."
          : "🔇 Đã tắt loa gọi số tại máy này.",
        "green"
      );
    }

    function speakNextRiderCallVoice() {
      if (!riderCallVoiceEnabled || riderCallVoiceSpeaking || !riderCallVoiceQueue.length) return;
      if (!("speechSynthesis" in window)) {
        setRiderOverviewMessage("Trình duyệt máy này không hỗ trợ loa gọi số.", "red");
        riderCallVoiceQueue = [];
        return;
      }
      riderCallVoiceSpeaking = true;
      const utterance = new SpeechSynthesisUtterance(riderCallVoiceQueue.shift());
      utterance.lang = "vi-VN";
      utterance.rate = 0.78;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onend = () => {
        riderCallVoiceSpeaking = false;
        setTimeout(speakNextRiderCallVoice, 180);
      };
      utterance.onerror = () => {
        riderCallVoiceSpeaking = false;
        setTimeout(speakNextRiderCallVoice, 180);
      };
      try { window.speechSynthesis.speak(utterance); } catch (_) { riderCallVoiceSpeaking = false; }
    }

    function maybeAnnounceRiderReady(ticket, previousTicket, source = "realtime") {
      if (!riderCallVoiceEnabled || !ticket || !previousTicket) return;
      const stage = getHoldTicketWorkflowForRider(ticket);
      const previousStage = getHoldTicketWorkflowForRider(previousTicket);
      if (stage !== "PICKED" || previousStage === "PICKED") return;

      const ticketKey = getRiderCallTicketKey(ticket);
      if (!ticketKey) return;
      const spoken = loadRiderCallSpokenSet();
      if (spoken.has(ticketKey)) return;

      spoken.add(ticketKey);
      saveRiderCallSpokenSet(spoken);

      const stt = getRiderCallNumber(ticket);
      const digits = stt.split("").join(", ");
      // Người dùng yêu cầu đọc đúng 2 lần.
      const announcement = `Xin mời số ${digits}. Xin mời số ${digits}.`;
      riderCallVoiceQueue.push(announcement);
      setRiderOverviewMessage(`🔊 Xin mời số ${stt} · đọc 2 lần · ${ticket.driver_name || "-"}`, "green");
      console.log("[VNWL RIDER CALL TWICE]", source, ticketKey, stt);
      speakNextRiderCallVoice();
    }

    function isRiderOverviewWsMessage(msg) {
      const type = String(msg?.type || "");
      const reason = String(msg?.reason || "");
      return type === "rider_overview_changed" || reason.includes("rider_overview");
    }

    function applyRiderOverviewWsMessage(msg) {
      try {
        if (!isRiderOverviewWsMessage(msg)) return false;
        const docs = Array.isArray(msg.docs) ? msg.docs : [];
        if (!docs.length) return false;
        const now = Date.now();
        const map = new Map((riderOverviewItems || []).map(t => [String(t.id || t.ticket_id || t.ticket_no || ""), t]).filter(x => x[0]));
        let changed = false;
        for (const doc of docs) {
          const data = { id: doc.id || doc.doc_id || doc.ticket_id || "", ...(doc.data || doc) };
          const id = String(data.id || data.ticket_id || data.ticket_no || "");
          if (!id) continue;
          if (doc.deleted || doc.op === "delete") {
            map.delete(id);
            changed = true;
            continue;
          }
          const previousData = map.get(id) || null;
          const visibleUntil = Number(data.visible_until_ms || 0);
          const stage = String(data.workflow_status || data.status || "").toUpperCase();
          if ((visibleUntil && visibleUntil <= now) || ["CANCELLED", "CANCELED", "DELETED", "REMOVED"].includes(stage)) map.delete(id);
          else {
            map.set(id, data);
            if (!previousData) playScanChime(); maybeAnnounceRiderReady(data, previousData, "ws_delta");
          }
          changed = true;
        }
        if (changed) {
          riderOverviewItems = Array.from(map.values()).sort(compareTicketDriverSequenceAsc);
          // V1.9: chỉ vẽ bảng khi người dùng đang xem Rider Overview.
          if (isRiderOverviewPageVisible()) {
            renderRiderOverview();
            setRiderOverviewMessage("Rider Overview đã cập nhật trực tuyến.", "green");
          }
        }
        return changed;
      } catch (e) {
        console.warn("Apply Rider Overview WS warning:", e);
        return false;
      }
    }

    function scheduleRiderOverviewRefresh(delayMs = 250) {
      // READ GUARD: WS delta là nguồn realtime chính; không để mỗi WS event kéo lại /api/rider/overview/list.
      if (riderOverviewSilentTimer) clearTimeout(riderOverviewSilentTimer);
      const nowMs = Date.now();
      const gapLeft = Math.max(0, RIDER_OVERVIEW_SILENT_MIN_LOAD_GAP_MS - (nowMs - Number(riderOverviewLastServerLoadAtMs || 0)));
      riderOverviewSilentTimer = setTimeout(() => {
        riderOverviewSilentTimer = null;
        loadRiderOverview(true);
      }, Math.max(1000, Number(delayMs || 250), gapLeft));
    }

    let wsSilentRefreshTimer = null;
    function scheduleFullD1BootstrapFromWs(reason = "ws_update", delayMs = 120) {
      if (wsSilentRefreshTimer) clearTimeout(wsSilentRefreshTimer);
      wsSilentRefreshTimer = setTimeout(() => {
        wsSilentRefreshTimer = null;
        // V86 AUDIT FIX: replace the whole local cache from /api/orders/bootstrap.
        // Do not render compact WebSocket payload after upload/Server release, otherwise
        // Máy B/C/D can show enough rows but miss columns compared with Máy A.
        refreshOrdersFromD1AfterExternalUpdate(reason, { background: false });
      }, Math.max(50, Number(delayMs || 120)));
    }

    function wsMessageRequiresFullD1Bootstrap(msg = {}) {
      const type = String(msg.type || "");
      const reason = String(msg.reason || type || "ws_update");
      return !!(
        msg.force_bootstrap || msg.bootstrap_required || msg.reload_d1 ||
        type === "bulk_location_upload_done" ||
        type === "bulk_order_sn_update_done" ||
        type === "d1_full_reload_required" ||
        reason.includes("upload_gate_released") ||
        reason.includes("location_upload_gate_released") ||
        reason.includes("gate_released_full_bootstrap") ||
        reason.includes("cloud_d0_aux2_order_sn_update_bulk") ||
        reason.includes("daily_retention") ||
        reason.includes("manual_reset_current_data") ||
        reason.includes("cleanup") ||
        reason.includes("location_upload_bulk")
      );
    }

    window.addEventListener("vnwl:ws_message", event => {
      const msg = event && event.detail;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "rider_registered" || msg.type === "order_submitted_notification") {
        handleIncomingOrderAlert(msg);
      }
      if (msg.type === "fs_delta" && Array.isArray(msg.docs)) {
        for (const d of msg.docs) {
          const rowData = d?.data || d || {};
          const rowCol = String(d?.collection_path || d?.collection || msg.collection || "");
          if (rowCol.includes("hold_tickets_") && String(rowData.status || rowData.workflow_status || "").toUpperCase() === "HOLD") {
            const createdMs = Number(rowData.created_at_ms || 0);
            if (!createdMs || (Date.now() - createdMs) < 60000) {
              handleIncomingOrderAlert(rowData);
            }
          }
        }
      }
      if (isRiderOverviewWsMessage(msg)) {
        const appliedRider = applyRiderOverviewWsMessage(msg);
        // V1.9 ANTI-LAG: document delta realtime đã đủ dữ liệu, không để 20 máy cùng đọc lại toàn bộ Rider Overview.
        // Chỉ fallback đọc lại khi nhận sự kiện cũ/thiếu payload trực tiếp.
        if (!appliedRider && !msg.direct_delta) scheduleRiderOverviewRefresh(350);
      }

      const reason = String(msg.reason || msg.type || "ws_update");
      if (wsMessageRequiresFullD1Bootstrap(msg)) {
        // IMPORTANT: handle this before applyWsDirectDocsToDom(). Upload release payloads
        // must be replaced by the full D1/bootstrap payload, not merged as compact docs.
        scheduleFullD1BootstrapFromWs(reason, 120);
        return;
      }

      const handled = applyWsDirectDocsToDom(msg);
      if (handled) return;
    });

    function getPendingOrdersCollectionName() {
      return PENDING_ORDERS_PREFIX + getWarehouse();
    }

    function getHandoverQueueCollectionName() {
      return HANDOVER_QUEUE_PREFIX + getWarehouse();
    }

    function getRecentPageRef(pageIndex) {
      return doc(db, getRecentOrdersCollectionName(), "page_" + pageIndex);
    }

    function getPendingOrderRef(orderId) {
      return doc(db, getPendingOrdersCollectionName(), orderId);
    }

    function getHandoverQueueRef(orderId) {
      return doc(db, getHandoverQueueCollectionName(), orderId);
    }

    function getOrderCreatedMs(order) {
      return Number(order?.created_at_ms || 0) || dateToMs(order?.created_at || order?.prepared_at) || Date.now();
    }

    function getOrderUpdatedMs(order) {
      return Number(order?.updated_at_ms || 0) || dateToMs(order?.updated_at || order?.created_at || order?.prepared_at) || Date.now();
    }

    function compactOrderForCache(order) {
      const n = normalizeOrder(order || {});
      const createdMs = getOrderCreatedMs(order || n);
      const updatedMs = getOrderUpdatedMs(order || n);
      const handedOverMs = dateToMs(n.handed_over_at);
      const riderArrivedMs = dateToMs(n.rider_arrived_at);
      return {
        id: n.id,
        order_code: n.order_code,
        order_sn: n.order_sn || n.cloud_d0_aux2_order_sn || n.shopee_order_sn || n.shopee_order_code || "",
        cloud_d0_aux2_order_sn: n.cloud_d0_aux2_order_sn || n.order_sn || n.shopee_order_sn || n.shopee_order_code || "",
        shopee_order_sn: n.shopee_order_sn || n.order_sn || n.cloud_d0_aux2_order_sn || n.shopee_order_code || "",
        order_sn_display: n.order_sn_display || n.shopee_order_sn_display || n.cloud_d0_aux2_order_sn_display || "",
        shopee_order_sn_display: n.shopee_order_sn_display || n.order_sn_display || n.cloud_d0_aux2_order_sn_display || "",
        cloud_d0_aux2_order_sn_lookup_attempts: Number(n.cloud_d0_aux2_order_sn_lookup_attempts || n.order_sn_lookup_attempts || 0),
        order_sn_lookup_status: n.order_sn_lookup_status || n.cloud_d0_aux2_order_sn_lookup_status || "",
        // V31 no longer uses sls_tn for Mã đơn hàng.
        sls_tn: "",
        cloud_d0_aux2_sls_tn: "",
        warehouse_code: n.warehouse_code || getWarehouse(),
        location_code: n.location_code || "",
        sub_code: n.sub_code || "",
        note: n.note || "",
        status: n.status || "NO_RIDER",
        created_at: createdMs ? new Date(createdMs).toISOString() : "",
        updated_at: updatedMs ? new Date(updatedMs).toISOString() : "",
        prepared_at: n.prepared_at ? (toDate(n.prepared_at)?.toISOString?.() || n.prepared_at) : "",
        rider_arrived_at: riderArrivedMs ? new Date(riderArrivedMs).toISOString() : "",
        handed_over_at: handedOverMs ? new Date(handedOverMs).toISOString() : "",
        created_at_ms: createdMs,
        updated_at_ms: updatedMs,
        rider_arrived_at_ms: riderArrivedMs || 0,
        handed_over_at_ms: handedOverMs || 0
      };
    }

    function buildPendingOrderData(order) {
      const c = compactOrderForCache(order);
      return {
        ...c,
        suffix_keys: buildSuffixKeys(c.order_code),
        indexed_at_ms: Date.now(),
        indexed_at: serverTimestamp()
      };
    }

    function sortLatestCreated(orders, max = RECENT_ORDERS_LIMIT) {
      const map = new Map();
      (orders || []).forEach(order => {
        const c = compactOrderForCache(order);
        if (!c.id) return;
        const prev = map.get(c.id);
        if (!prev || getOrderUpdatedMs(c) >= getOrderUpdatedMs(prev)) map.set(c.id, c);
      });
      return Array.from(map.values())
        .filter(order => !orderHiddenFromHtml(order))
        .filter(order => order.warehouse_code === getWarehouse())
        .sort((a, b) => {
          const updatedDiff = getOrderUpdatedMs(b) - getOrderUpdatedMs(a);
          if (updatedDiff) return updatedDiff;
          return getOrderCreatedMs(b) - getOrderCreatedMs(a);
        })
        .slice(0, max)
        .map(order => normalizeOrder(order));
    }

    function renderOptimizedOrders(orders, messageText = "Cache local đã cập nhật.") {
      // v2.8.7 FIX: không để recent cache 1500 đơn ghi đè live update vừa nhận.
      // Recent cache chỉ dùng để bổ sung dữ liệu nền; live update/local cache là nguồn đang hiển thị.
      const input = Array.isArray(orders) ? orders : [];
      const merged = [...allOrders, ...input];
      allOrders = sortLatestCreated(merged, LOCAL_CACHE_LIMIT);
      updateTodayLoadedOrderMeta(allOrders);
      renderStats(allOrders);
      if (document.getElementById("pageManage")?.classList.contains("active")) {
        renderOrders(applyCurrentFilters(allOrders));
      }
      localSaveOrders(allOrders).then(() => localPersistCurrentState()).catch(err => console.warn("Local recent cache warning:", err));
      if (messageText) updateRefreshIndicator(messageText);
    }

    function renderRecentOrdersFromPages() {
      const merged = [];
      for (let i = 0; i < RECENT_ORDERS_PAGE_COUNT; i++) {
        const pageItems = recentOrdersPages.get(i) || [];
        merged.push(...pageItems);
      }
      renderOptimizedOrders(merged, "Đã tải cache local của ca hôm nay + đang nghe live update.");
    }

    function scheduleRecentOrdersRender() {
      if (recentOrdersRenderTimer) clearTimeout(recentOrdersRenderTimer);
      recentOrdersRenderTimer = setTimeout(renderRecentOrdersFromPages, 80);
    }

    function stopRecentOrdersListener() {
      recentOrdersUnsubs.forEach(unsub => {
        try { unsub(); } catch {}
      });
      recentOrdersUnsubs = [];
      recentOrdersPages.clear();
      if (recentOrdersRenderTimer) {
        clearTimeout(recentOrdersRenderTimer);
        recentOrdersRenderTimer = null;
      }
    }


    function startRecentOrdersListener() {
      stopRecentOrdersListener();
      if (!db) return;

      // Mở app:
      // 1) Hiện local cache trước.
      // 2) Đọc đúng 1 page recent_orders, page_0 = 1500 đơn thao tác gần nhất.
      // 3) Sau đó mới nghe live update nhỏ cho đơn mới/bàn giao/hủy.
      loadLocalCacheToScreen()
        .then(() => loadRecentOrdersPagesOnce(true))
        .then(() => startLiveUpdatesListener())
        .catch(error => {
          console.warn("Initial local/recent/live load warning:", error);
          updateRefreshIndicator("Load cache/live update lỗi: " + (error.message || error));
          startLiveUpdatesListener();
        });
    }


    async function loadInitialD1OrdersDirect(options = {}) {
      // Fast path: Cloud returns D1 timeline immediately without D1 reads.
      // Strict path is used only in background after the first render.
      if (typeof apiPost !== "function") return null;
      const payload = {
        warehouse: getWarehouse(),
        limit: TODAY_ORDERS_LOAD_LIMIT,
        since_updated_at_ms: Math.max(0, Number(options.sinceUpdatedAtMs || 0)),
        days: INITIAL_LOAD_DAYS_BACK,
        fast: options.fast !== false,
        d1_fast: options.fast !== false,
        force_reconcile: !!options.forceReconcile
      };
      const result = await apiPost("/api/orders/bootstrap", payload);
      if (result && result.ok && Array.isArray(result.items)) {
        return { items: result.items.map(order => normalizeOrder(order)), result };
      }
      return null;
    }

    async function runStrictBackgroundReconcile(reason = "background") {
      // V1.4: D1 đã là nguồn duy nhất; không đọc bootstrap lần hai.
      return null;
    }


    async function loadRecentOrdersPagesOnce(silent = false) {
      if (!db) return;
      if (!silent) setMessage("Đang tải nhanh dữ liệu từ Server...");

      // 1) TODAY READ: lần đầu tải toàn bộ dữ liệu ca hôm nay; các lần sau chỉ hỏi delta theo updated_at_ms.
      try {
        const sinceMs = allOrders && allOrders.length ? (ordersLastServerUpdatedAtMs || maxOrderUpdatedAtMsFromList(allOrders)) : 0;
        const direct = await loadInitialD1OrdersDirect({ fast: true, forceReconcile: false, sinceUpdatedAtMs: sinceMs });
        if (direct && Array.isArray(direct.items)) {
          const isDelta = !!direct.result?.delta;
          if (isDelta) {
            if (direct.items.length) {
              renderOptimizedOrders(direct.items, "Đã cập nhật " + direct.items.length + " thay đổi mới trong ca hôm nay. Đang nghe live update.");
              if (!silent) setMessage("Đã cập nhật " + direct.items.length + " thay đổi mới từ Server.", "green");
            } else {
              updateTodayLoadedOrderMeta(allOrders);
              updateRefreshIndicator("Đã kiểm tra: chưa có đơn mới. Đang nghe live update.");
            }
          } else {
            replaceOrdersFromServer(direct.items, "Đã tải " + direct.items.length + " đơn của ca hôm nay từ Server. Đang nghe live update.");
            if (!silent) setMessage("Đã tải " + direct.items.length + " đơn của ca hôm nay từ Server.", "green");
          }
          ordersLastServerUpdatedAtMs = Math.max(ordersLastServerUpdatedAtMs || 0, Number(direct.result?.max_updated_at_ms || 0), maxOrderUpdatedAtMsFromList(direct.items));
          // V1.4: sau bootstrap, cập nhật tiếp theo nhận bằng WebSocket delta; reconnect chỉ đọc delta.
          return;
        }
      } catch (directError) {
        console.warn("D1 today bootstrap/delta failed, fallback recent page:", directError);
      }

      // 3) Fallback only when Cloud route fails: adapter may read D1 backup/pending_ops.
      const items = [];
      for (let i = 0; i < RECENT_ORDERS_PAGE_COUNT; i++) {
        const snap = await getDoc(getRecentPageRef(i));
        if (snap.exists()) {
          const data = snap.data() || {};
          if (Array.isArray(data.items)) items.push(...data.items);
        }
      }
      replaceOrdersFromServer(items, "Đã tải fallback cache hôm nay = " + items.length + " dòng.");
      if (!silent) setMessage("Đã tải fallback cache hôm nay = " + items.length + " dòng.", "green");
    }

    async function updateRecentOrdersCache(changedOrders = [], action = "UPSERT") {
      if (!db) return;
      const input = Array.isArray(changedOrders) ? changedOrders : [changedOrders];
      const validInput = input.filter(Boolean);
      if (!validInput.length) return;

      await runTransaction(db, async transaction => {
        const all = [];
        const refs = [];
        for (let i = 0; i < RECENT_ORDERS_PAGE_COUNT; i++) {
          const ref = getRecentPageRef(i);
          refs.push(ref);
          const snap = await transaction.get(ref);
          if (snap.exists()) {
            const data = snap.data() || {};
            if (Array.isArray(data.items)) all.push(...data.items);
          }
        }

        const map = new Map();
        all.forEach(item => {
          const c = compactOrderForCache(item);
          if (c.id) map.set(c.id, c);
        });

        validInput.forEach(order => {
          const c = compactOrderForCache(order);
          if (!c.id) return;
          if (action === "DELETE") map.delete(c.id);
          else map.set(c.id, { ...(map.get(c.id) || {}), ...c });
        });

        const latest = Array.from(map.values())
          .filter(item => item.warehouse_code === getWarehouse())
          .sort((a, b) => {
            const updatedDiff = getOrderUpdatedMs(b) - getOrderUpdatedMs(a);
            if (updatedDiff) return updatedDiff;
            return getOrderCreatedMs(b) - getOrderCreatedMs(a);
          })
          .slice(0, RECENT_ORDERS_LIMIT);

        for (let i = 0; i < RECENT_ORDERS_PAGE_COUNT; i++) {
          const start = i * RECENT_ORDERS_PAGE_SIZE;
          const chunk = latest.slice(start, start + RECENT_ORDERS_PAGE_SIZE);
          transaction.set(refs[i], {
            page: i,
            page_size: RECENT_ORDERS_PAGE_SIZE,
            total_cached: latest.length,
            updated_at: serverTimestamp(),
            updated_at_ms: Date.now(),
            code_version: CODE_VERSION,
            items: chunk
          }, { merge: true });
        }
      });
    }

    async function resetRecentOrdersCacheFromLatestOrders() {
      if (!db) return;
      const q = query(collection(db, getOrdersCollectionName()), orderBy("updated_at_ms", "desc"), limit(RECENT_ORDERS_LIMIT));
      const snap = await getDocs(q);
      const orders = snap.docs.map(d => normalizeOrder({ id: d.id, ...d.data() }));
      const latest = sortLatestCreated(orders, RECENT_ORDERS_LIMIT);
      await updateRecentOrdersCache(latest, "UPSERT");
    }


    function getDMinus3Start() {
      // Lấy dữ liệu 7 ngày gần nhất để tránh risk đơn cũ trong ca vận hành.
      // Ví dụ hiện tại 10/05 15:00 thì lấy từ 07/05 00:00.
      const d = new Date();
      d.setDate(d.getDate() - INITIAL_LOAD_DAYS_BACK);
      d.setHours(0, 0, 0, 0);
      return d;
    }

    function getOrderTimestampMs(order) {
      const updatedMs = Number(order?.updated_at_ms || 0);
      const createdMs = Number(order?.created_at_ms || order?.prepared_at_ms || 0);
      if (updatedMs || createdMs) return Math.max(updatedMs, createdMs);
      const updated = toDate(order.updated_at);
      const created = toDate(order.created_at || order.prepared_at);
      return (updated || created || new Date(0)).getTime();
    }

    function mergeOrdersIntoMemory(newOrders) {
      const map = new Map(allOrders.map(o => [o.id, o]));
      (newOrders || []).forEach(order => {
        const n = normalizeOrder(order);
        if (!n.id) return;
        map.set(n.id, { ...(map.get(n.id) || {}), ...n });
      });

      allOrders = sortOrdersForLocalCache(Array.from(map.values()), LOCAL_CACHE_LIMIT);
      updateTodayLoadedOrderMeta(allOrders);

      const newest = allOrders[0] ? toDate(allOrders[0].updated_at || allOrders[0].created_at || allOrders[0].prepared_at) : null;
      if (newest && (!lastSyncTime || newest.getTime() > lastSyncTime.getTime())) {
        lastSyncTime = newest;
      }
    }

    async function loadOrders(silent = false, force = false) {
      if (!db) return;
      // Optimized mode: không query orders 500 docs nữa. loadOrders chỉ refresh 5 page recent cache.
      if (db && typeof loadRecentOrdersPagesOnce === "function") {
        await loadRecentOrdersPagesOnce(silent);
        return;
      }
      if (isLoadingOrders && !force) return;

      isLoadingOrders = true;
      updateRefreshIndicator("Đang kiểm tra dữ liệu...");
      if (!silent) {
        setMessage("Đang tải dữ liệu...");
        const tbody = document.getElementById("ordersTable");
        tbody.innerHTML = `<tr><td colspan="7">Đang tải dữ liệu...</td></tr>`;
      }

      try {
        let localOrders = [];
        let loadedFromCache = false;

        if (force || allOrders.length === 0) {
          try {
            localOrders = await localLoadOrdersForCurrentWarehouse();
            if (localOrders.length) {
              allOrders = localOrders;
              const metaLastSync = await localGetMeta("lastSyncTime");
              const newestLocal = allOrders[0] ? toDate(allOrders[0].updated_at || allOrders[0].created_at || allOrders[0].prepared_at) : null;
              lastSyncTime = metaLastSync ? new Date(metaLastSync) : newestLocal;
              loadedFromCache = true;

              renderStats(allOrders);
              if (document.getElementById("pageManage").classList.contains("active")) {
                renderOrders(applyCurrentFilters(allOrders));
              }

              if (!silent) {
                setMessage("Đã tải " + allOrders.length + " đơn. Đang kiểm tra đơn mới...", "green");
              }
            }
          } catch (cacheError) {
            console.warn("Không đọc được IndexedDB cache:", cacheError);
          }
        }

        let snapshot;
        let modeText = "";

        if (!lastSyncTime || allOrders.length === 0) {
          // Chỉ khi máy/profile chưa có cache mới tải D-7 từ D1.
          const dMinus3Start = getDMinus3Start();
          const q = query(
            collection(db, getOrdersCollectionName()),
            where("created_at", ">=", dMinus3Start),
            limit(500)
          );

          snapshot = await withTimeout(getDocs(q), 15000, "Tải dữ liệu D-7 lần đầu");
          modeText = loadedFromCache ? "D-7 fallback" : "D-7 lần đầu";
        } else {
          // Bình thường refresh 5s chỉ lấy đơn mới/đơn vừa thay đổi.
          const q = query(
            collection(db, getOrdersCollectionName()),
            where("updated_at", ">", lastSyncTime),
            limit(300)
          );

          snapshot = await withTimeout(getDocs(q), 15000, "Tải đơn mới");
          modeText = "đơn mới";
        }

        const newOrders = snapshot.docs.map(d => normalizeOrder({ id: d.id, ...d.data() }));

        if ((!lastSyncTime || allOrders.length === 0) && !loadedFromCache) {
          allOrders = [];
        }

        mergeOrdersIntoMemory(newOrders);

        if (newOrders.length) {
          await localSaveOrders(newOrders);
          await localPersistCurrentState();
        } else if (allOrders.length && !lastSyncTime) {
          await localPersistCurrentState();
        }

        renderStats(allOrders);

        if (document.getElementById("pageManage").classList.contains("active")) {
          renderOrders(applyCurrentFilters(allOrders));
        }

        if (!silent) {
          const showing = applyCurrentFilters(allOrders).length;
          setMessage(
            "Đã cập nhật: " + newOrders.length +
            " đơn mới/thay đổi. Đang hiển thị " + showing + " dòng.",
            "green"
          );
        }
      } catch (error) {
        console.error(error);
        if (!silent) setMessage("Lỗi tải dữ liệu: " + error.message, "red");
        if (!allOrders.length) {
          try {
            const localOrders = await localLoadOrdersForCurrentWarehouse();
            allOrders = localOrders;
            renderStats(allOrders);
            renderOrders(applyCurrentFilters(allOrders));
            setMessage("Mất kết nối tạm thời, đang hiển thị dữ liệu đã lưu trên máy.", "green");
          } catch {
            renderStats([]);
            renderOrders([]);
          }
        }
      } finally {
        isLoadingOrders = false;
        updateRefreshIndicator();
      }
    }

    function createOrderTerminalStatus(data) {
      const raw = String(data?.status || data?.queue_status || data?.order_status || "").trim();
      const st = raw.toUpperCase().replace(/[\s-]+/g, "_");
      return [
        "HANDED_OVER", "HANDEDOVER", "HANDOVER", "HANDOVERED", "HANDED",
        "DELIVERED", "DONE", "COMPLETED", "FINISHED", "SUCCESS",
        "DELETED", "DELETE", "REMOVED", "VOID",
        "CANCELLED", "CANCELED", "CANCEL", "CANCELLED_ORDER", "CANCELED_ORDER",
        "DA_BAN_GIAO", "DABANGIAO", "ĐÃ_BÀN_GIAO", "DA_HUY", "DAHUY", "ĐÃ_HỦY"
      ].includes(st) || [
        "HANDED_OVER", "HANDEDOVER", "HANDOVER", "HANDOVERED", "HANDED",
        "DELIVERED", "DONE", "COMPLETED", "FINISHED", "SUCCESS",
        "DELETED", "DELETE", "REMOVED", "VOID",
        "CANCELLED", "CANCELED", "CANCEL", "CANCELLED_ORDER", "CANCELED_ORDER",
        "ĐÃ BÀN GIAO", "DA BAN GIAO", "ĐÃ HỦY", "DA HUY"
      ].includes(raw.toUpperCase());
    }

    function hasRealMarkerForCreate(value) {
      if (value === null || value === undefined || value === false) return false;
      if (typeof value === "number") return value > 0;
      const s = String(value).trim().toLowerCase();
      return !["", "-", "--", "null", "none", "nan", "0", "false", "undefined"].includes(s);
    }

    function orderCanBeRecreatedFromTerminal(data) {
      if (!data || typeof data !== "object") return false;
      if (createOrderTerminalStatus(data)) return true;
      if (data.deleted === true || data.is_deleted === true || data.cancelled === true || data.canceled === true || data.is_cancelled === true || data.is_canceled === true || data.handed_over === true || data.is_handed_over === true) return true;
      // delete_at là lịch dọn sau bàn giao, không tự coi là xóa thật. handed_over_at/deleted_at/cancelled_at mới là terminal thật.
      return hasRealMarkerForCreate(data.handed_over_at_ms) || hasRealMarkerForCreate(data.handed_over_at) ||
        hasRealMarkerForCreate(data.delivered_at_ms) || hasRealMarkerForCreate(data.delivered_at) ||
        hasRealMarkerForCreate(data.deleted_at_ms) || hasRealMarkerForCreate(data.deleted_at) ||
        hasRealMarkerForCreate(data.cancelled_at_ms) || hasRealMarkerForCreate(data.cancelled_at) ||
        hasRealMarkerForCreate(data.canceled_at_ms) || hasRealMarkerForCreate(data.canceled_at);
    }

    function stripTerminalFieldsForRecreate(data) {
      const cleanData = { ...(data || {}) };
      [
        "handed_over_at", "handed_over_at_ms", "delivered_at", "delivered_at_ms",
        "deleted_at", "deleted_at_ms", "delete_at", "delete_at_ms",
        "cancelled_at", "cancelled_at_ms", "canceled_at", "canceled_at_ms",
        "deleted", "is_deleted", "cancelled", "canceled", "is_cancelled", "is_canceled",
        "handed_over", "is_handed_over", "driver_name", "rider_name", "handover_by", "handover_note"
      ].forEach(k => { delete cleanData[k]; });
      return cleanData;
    }

    function slotLocationKey(value) {
      return clean(value).toUpperCase();
    }

    function slotSubNumber(value) {
      const raw = clean(value);
      if (!/^\d+$/.test(raw)) return null;
      const number = Number(raw);
      return Number.isInteger(number) && number >= 1 && number <= MAX_SUB_PER_LOCATION ? number : null;
    }

    function orderOccupiesSubSlot(order) {
      if (!order || orderHiddenFromHtml(order) || orderCanBeRecreatedFromTerminal(order)) return false;
      const status = normalizeStatusForUi(order.status || order.queue_status || order.order_status || "NO_RIDER");
      return !["HANDED_OVER", "DELETED", "CANCELLED"].includes(status);
    }

    function usedSubsAtLocation(location, excludeOrderId = "") {
      const locationKey = slotLocationKey(location);
      const used = new Set();
      if (!locationKey) return used;
      (allOrders || []).forEach(order => {
        if (!orderOccupiesSubSlot(order)) return;
        if (excludeOrderId && String(order.id || "") === String(excludeOrderId)) return;
        const orderLocation = slotLocationKey(order.location_base || order.location || order.location_code || "");
        if (orderLocation !== locationKey) return;
        const number = slotSubNumber(order.sub_code || order.sub);
        if (number) used.add(number);
      });
      return used;
    }

    function findLocalSuggestedSub(location, excludeOrderId = "") {
      const used = usedSubsAtLocation(location, excludeOrderId);
      for (let number = 1; number <= MAX_SUB_PER_LOCATION; number++) {
        if (!used.has(number)) return String(number);
      }
      return "";
    }

    function refreshSubSuggestion(options = {}) {
      const subInput = document.getElementById("newSub");
      const hint = document.getElementById("subSuggestionHint");
      const location = clean(document.getElementById("newLocation")?.value || "");
      if (!subInput || !hint) return "";
      currentSuggestedLocation = slotLocationKey(location);
      subInput.classList.remove("sub-suggestion-ready", "sub-suggestion-full");
      if (!location) {
        currentSuggestedSub = "";
        subInput.placeholder = "Sub";
        hint.textContent = "👉 Scan Location để hệ thống gợi ý Sub trống nhỏ nhất từ 1 đến 40.";
        hint.classList.remove("full");
        return "";
      }
      const suggested = findLocalSuggestedSub(location);
      currentSuggestedSub = suggested;
      if (suggested) {
        subInput.placeholder = "Gợi ý: " + suggested;
        subInput.classList.add("sub-suggestion-ready");
        hint.textContent = "💡 Gợi ý Sub trống: " + suggested + ". Nhấn Enter lần 1 để chọn, Enter lần 2 để tạo đơn.";
        hint.classList.remove("full");
        if (options.announce) setMessage("Location " + location + " đang gợi ý Sub " + suggested + ". Nhấn Enter để chọn Sub.", "green");
      } else {
        subInput.placeholder = "Đã đầy 40/40";
        subInput.classList.add("sub-suggestion-full");
        hint.textContent = "⛔ Location " + location + " đã đầy " + MAX_SUB_PER_LOCATION + "/" + MAX_SUB_PER_LOCATION + " Sub active.";
        hint.classList.add("full");
        if (options.announce) setMessage("Location " + location + " không còn Sub trống.", "red");
      }
      return suggested;
    }

    function acceptSuggestedSubIfAvailable() {
      const subInput = document.getElementById("newSub");
      if (!subInput || clean(subInput.value)) return false;
      const suggested = refreshSubSuggestion();
      if (!suggested) return false;
      subInput.value = suggested;
      subSuggestionAccepted = true;
      subInput.classList.remove("sub-suggestion-ready");
      setMessage("Đã chọn Sub gợi ý: " + suggested + ". Nhấn Enter lần nữa để tạo đơn.", "green");
      playSound("scan");
      return true;
    }

    async function createOrder() {
      if (createOrderBusy) return;
      createOrderBusy = true;
      try {
        const orderCode = clean(document.getElementById("newOrderCode").value);
        const orderSn = orderCode;
        const locationCode = clean(document.getElementById("newLocation").value);
        const subCode = clean(document.getElementById("newSub").value);
        const warehouseCode = getWarehouse();

        if (!orderCode) { setMessage("Vui lòng nhập Mã đơn hàng Shopee", "red"); playSound("error"); return; }
        if (!locationCode) { setMessage("Vui lòng nhập location", "red"); playSound("error"); return; }
        const orderId = safeOrderId(orderCode);

        // Rule: Location alone may contain many orders. Location + Sub may contain only one active order.
        function locationSubKey(location, sub) {
          // V1.9.3 FIX: khóa slot theo TOÀN BỘ Location + Sub.
          // Không cắt segment cuối của Location, vì -02 và -03 là hai vị trí khác nhau.
          const fullLocation = clean(location).toUpperCase();
          const normalizedSub = clean(sub);
          if (!fullLocation || !normalizedSub) return "";
          return fullLocation + "||" + normalizedSub;
        }
        if (subCode) {
          const key = locationSubKey(locationCode, subCode);
          const conflict = (allOrders || []).find(o => {
            if (!o) return false;
            if (String(o.id || "") === String(orderId || "")) return false;
            if (clean(o.order_sn || o.shopee_order_sn || o.cloud_d0_aux2_order_sn).toUpperCase() === orderCode.toUpperCase()) return false;
            if (orderCanBeRecreatedFromTerminal(o)) return false;
            return locationSubKey(o.location_code || o.location || o.location_base || "", o.sub_code || o.sub || "") === key;
          });
          if (conflict) {
            setMessage(`Đúng Location + Sub này đã có đơn ${conflict.order_code || conflict.id}. Location khác vẫn được dùng cùng số Sub.`, "red");
            playSound("error");
            document.getElementById("newSub").select();
            return;
          }
        }

        setMessage("Đang tạo/cập nhật đơn...");
        const now = new Date();
        const baseData = {
          id: orderId,
          order_code: orderCode,
          tracking_no: "",
          order_sn: orderSn,
          shopee_order_sn: orderSn,
          cloud_d0_aux2_order_sn: orderSn,
          order_sn_display: orderSn,
          shopee_order_sn_display: orderSn,
          sls_tn: "",
          cloud_d0_aux2_sls_tn: "",
          warehouse_code: warehouseCode,
          location_code: locationCode,
          location: locationCode,
          sub_code: subCode,
          sub: subCode,
          note: subCode,
          suffix_keys: buildSuffixKeys(orderCode),
          status: "NO_RIDER",
          handed_over_at: "",
          delete_at: null,
          prepared_at: serverTimestamp(),
          updated_at: serverTimestamp(),
          updated_at_ms: Date.now(),
          code_version: CODE_VERSION,
          device_id: getDeviceId(),
          created_by: getCurrentOperatorEmail(),
          updated_by: getCurrentOperatorEmail(),
          last_operator: getCurrentOperatorEmail(),
          last_operation: "CREATE",
          last_operation_at: serverTimestamp(),
          last_operation_at_ms: Date.now()
        };

        if (!subCode) {
          const suggestion = refreshSubSuggestion({ announce: true });
          if (suggestion) {
            document.getElementById("newSub").focus();
            setMessage("Vui lòng nhấn Enter để nhận Sub gợi ý " + suggestion + ", sau đó Enter lần nữa để tạo đơn.", "green");
          } else {
            setMessage("Location này đã đầy Sub 1–" + MAX_SUB_PER_LOCATION + ". Vui lòng chọn Location khác.", "red");
          }
          playSound("error");
          return;
        }
        if (!slotSubNumber(subCode)) {
          setMessage("Sub phải là số từ 1 đến " + MAX_SUB_PER_LOCATION + ".", "red");
          playSound("error");
          document.getElementById("newSub").focus();
          return;
        }

        const result = await apiPost("/api/orders/create_with_slot", {
          warehouse: warehouseCode,
          item: {
            ...baseData,
            location_base: locationCode,
            location: locationCode,
            location_code: locationCode,
            sub_code: subCode,
            sub: subCode
          }
        });
        const txAction = String(result.action || "CREATE").toUpperCase();
        const finalData = result.item || baseData;

        const localOrder = normalizeOrder({
          id: orderId,
          ...finalData,
          prepared_at: now,
          created_at: now,
          updated_at: now
        });

        mergeOrdersIntoMemory([localOrder]);
        await localSaveOrders([localOrder]);
        await localPersistCurrentState();

        document.getElementById("searchInput").value = "";
        document.getElementById("statusFilter").value = "ALL";
        renderStats(allOrders);
        renderOrders(applyCurrentFilters(allOrders));

        document.getElementById("newOrderCode").value = "";
        document.getElementById("newLocation").value = "";
        document.getElementById("newSub").value = "";
        currentSuggestedSub = "";
        currentSuggestedLocation = "";
        subSuggestionAccepted = false;
        refreshSubSuggestion();
        document.getElementById("newOrderCode").focus();

        const actionText = txAction === "UPDATE" ? "Cập nhật đơn thành công: " : "Tạo đơn thành công: ";
        setMessage(actionText + orderCode + ". Đã sync realtime cho các máy khác.", "green");
        playSound("success");
        // V1.4: các máy khác nhận delta, máy hiện tại đã render local; không reload D1.
      } catch (error) {
        console.error(error);
        const errText = String(error.message || error);
        const suggested = String(error?.payload?.suggested_sub || "");
        const msg = errText.includes("LOCATION_SUB_OCCUPIED")
          ? (suggested
              ? "Sub vừa được máy khác sử dụng. Gợi ý mới: " + suggested + ". Nhấn Enter để chọn rồi Enter lần nữa để tạo đơn."
              : "Location này đã đầy Sub 1–" + MAX_SUB_PER_LOCATION + ".")
          : errText.includes("LOCKED_ACTIVE_ORDER_LOCATION_SUB")
            ? "Đơn đang HOLD/Đã pick nên không thể đổi Location hoặc Sub."
            : "Lỗi tạo/cập nhật đơn: " + (error.message || error);
        if (errText.includes("LOCATION_SUB_OCCUPIED")) {
          const subInput = document.getElementById("newSub");
          subInput.value = "";
          currentSuggestedSub = suggested;
          subInput.placeholder = suggested ? "Gợi ý: " + suggested : "Đã đầy 40/40";
          subInput.classList.toggle("sub-suggestion-ready", !!suggested);
          subInput.classList.toggle("sub-suggestion-full", !suggested);
          subInput.focus();
        }
        setMessage(msg, "red");
        playSound("error");
      } finally {
        createOrderBusy = false;
      }
    }

    

    function moveToLocationInput() {
      const orderCode = clean(document.getElementById("newOrderCode").value);
      const orderSn = orderCode;
      if (!orderCode) {
        setMessage("Vui lòng nhập Mã đơn hàng Shopee trước.", "red");
        playSound("error");
        document.getElementById("newOrderCode").focus();
        return;
      }
      const locationInput = document.getElementById("newLocation");
      locationInput.focus();
      locationInput.select();
      setTimeout(() => { locationInput.focus(); locationInput.select(); }, 80);
      playSound("scan");
      setMessage("Đã nhận Mã đơn hàng Shopee: " + orderSn + ". Tiếp tục nhập/scan Location.", "green");
    }

    function moveToSubInput() {
      const orderCode = clean(document.getElementById("newOrderCode").value);
      const orderSn = orderCode;
      const locationCode = clean(document.getElementById("newLocation").value);
      if (!orderCode) {
        setMessage("Vui lòng nhập Mã đơn hàng Shopee trước.", "red");
        playSound("error");
        document.getElementById("newOrderCode").focus();
        return;
      }
      if (!locationCode) {
        setMessage("Vui lòng nhập Location trước khi qua Sub.", "red");
        playSound("error");
        document.getElementById("newLocation").focus();
        return;
      }
      const subInput = document.getElementById("newSub");
      justMovedToSubAt = Date.now();
      subSuggestionAccepted = false;
      subInput.value = "";
      subInput.focus();
      subInput.select();
      setTimeout(() => { subInput.focus(); subInput.select(); }, 80);
      playSound("scan");
      refreshSubSuggestion({ announce: true });
    }


    function getRealShopeeOrderSn(order) {
      return clean(order?.order_sn || order?.cloud_d0_aux2_order_sn || order?.shopee_order_sn || order?.shopee_order_code || "");
    }

    function getShopeeOrderSn(order) {
      return getRealShopeeOrderSn(order) || clean(order?.order_sn_display || order?.shopee_order_sn_display || order?.cloud_d0_aux2_order_sn_display || "");
    }

    function isShopeeOrderSnDash(order) {
      const real = getRealShopeeOrderSn(order);
      const display = clean(order?.order_sn_display || order?.shopee_order_sn_display || order?.cloud_d0_aux2_order_sn_display || "");
      const status = clean(order?.order_sn_lookup_status || order?.cloud_d0_aux2_order_sn_lookup_status || "").toUpperCase();
      return !real && (display === "-" || status === "NOT_FOUND_2X");
    }

    function isShopeeOrderSnNoCode(order) {
      const real = getRealShopeeOrderSn(order);
      const display = clean(order?.order_sn_display || order?.shopee_order_sn_display || order?.cloud_d0_aux2_order_sn_display || "");
      const status = clean(order?.order_sn_lookup_status || order?.cloud_d0_aux2_order_sn_lookup_status || "").toUpperCase();
      return !real && (display.toLowerCase() === "không có mã này" || status === "NO_PARCEL_ID" || status === "BAD_TRACKING_CODE");
    }

    function isShopeeOrderSnBad(order) {
      return isShopeeOrderSnDash(order) || isShopeeOrderSnNoCode(order);
    }

    function renderShopeeOrderSnCell(order) {
      const value = getShopeeOrderSn(order);
      if (!value) return `<span style="color:#94a3b8;font-size:12px;">Đang lấy</span>`;
      if (isShopeeOrderSnBad(order)) return `<b style="color:#ef4444;">${escapeHtml(value)}</b>`;
      return `<b>${escapeHtml(value)}</b>`;
    }

    function scanMatchesHandoverItem(item, scanValue) {
      const v = clean(scanValue);
      if (!v || !item) return false;
      const tracking = clean(item.order_code || item.tracking_no || item.code || "");
      const orderSn = getRealShopeeOrderSn(item) || clean(item.order_sn || item.cloud_d0_aux2_order_sn || item.shopee_order_sn || "");
      // Bàn giao tài xế: nhân viên được scan Mã vận đơn hoặc Mã đơn hàng, miễn là khớp đúng dữ liệu đã check location.
      return (tracking && exactEqual(tracking, v)) || (orderSn && exactEqual(orderSn, v));
    }

    function scanLabelForHandoverItem(item, scanValue) {
      const v = clean(scanValue);
      const tracking = clean(item?.order_code || item?.tracking_no || item?.code || "");
      const orderSn = getRealShopeeOrderSn(item) || clean(item?.order_sn || item?.cloud_d0_aux2_order_sn || item?.shopee_order_sn || "");
      if (tracking && exactEqual(tracking, v)) return "Mã vận đơn";
      if (orderSn && exactEqual(orderSn, v)) return "Mã đơn hàng";
      return "mã scan";
    }

    function renderOrders(orders) {
      const tbody = document.getElementById("ordersTable");
      tbody.innerHTML = "";
      if (!orders.length) {
        tbody.innerHTML = `<tr><td colspan="10">Không có dữ liệu</td></tr>`;
        return;
      }

      orders.forEach(order => {
        const tr = document.createElement("tr");
        const statusUpper = normalizeStatusForUi(order.status || "");
        const isDelivered = statusUpper === "HANDED_OVER" || statusUpper === "DELIVERED";
        const canOperate = orderCanBeOperated(order);

        const handoverButton = isDelivered
          ? `<button class="btn-disabled-action" disabled>Đã bàn giao</button>`
          : canOperate
            ? `<button class="btn-green" data-action="handover" data-id="${escapeHtml(order.id)}" data-code="${escapeHtml(order.order_code)}">Bàn giao</button>`
            : `<button class="btn-disabled-action" disabled>Không thao tác</button>`;
        const deleteButton = canOperate
          ? `<button class="btn-red" data-action="delete" data-id="${escapeHtml(order.id)}" data-code="${escapeHtml(order.order_code)}">Hủy đơn</button>`
          : `<button class="btn-disabled-action" disabled>Không hủy</button>`;

        tr.innerHTML = `
          <td><b>${escapeHtml(order.order_code)}</b></td>
          <td>${renderShopeeOrderSnCell(order)}</td>
          <td>${escapeHtml(order.warehouse_code || getWarehouse())}</td>
          <td>${renderStatus(order.status, true, order)}</td>
          <td>${escapeHtml(order.location_code || "-")}</td>
          <td>${escapeHtml(order.sub_code || "-")}</td>
          <td>${formatDate(order.prepared_at || order.created_at)}</td>
          <td>${formatDate(order.handed_over_at)}</td>
          <td><div><b>${escapeHtml(getOrderLastOperator(order))}</b></div><div style="font-size:11px;color:#64748b;">${escapeHtml(getOrderLastOperation(order))}</div></td>
          <td>
            <div class="action-buttons">
              ${handoverButton}
              ${deleteButton}
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    async function handleOrderAction(e) {
      const btn = e.target.closest("button[data-action]");
      if (!btn || btn.disabled) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const code = btn.dataset.code;
      if (action === "handover") await handoverSingle(id, code);
      if (action === "delete") await deleteOrder(id, code);
    }

    async function handoverSingle(id, code) {
      const currentOrder = allOrders.find(order => order.id === id);

      if (currentOrder && (currentOrder.status === "HANDED_OVER" || currentOrder.status === "DELIVERED")) {
        setMessage("Đơn đã bàn giao: " + code, "green");
        playSound("success");
        return;
      }
      if (currentOrder && !orderCanBeOperated(currentOrder)) {
        setMessage("Đơn không còn active, không thể bàn giao: " + code, "red");
        playSound("error");
        return;
      }

      if (!confirm("Bàn giao đơn " + code + "?")) return;

      try {
        const item = normalizeOrder({
          ...(currentOrder || {}),
          id,
          order_code: code,
          warehouse_code: currentOrder?.warehouse_code || getWarehouse(),
          status: "NO_RIDER",
          valid: true,
          scanned: true
        });

        const result = await commitHandoverTransaction([item], "PC_SINGLE");

        if (result.successItems.length) {
          renderStats(allOrders);
          renderOrders(applyCurrentFilters(allOrders));
          setMessage("Bàn giao thành công: " + code, "green");
          playSound("handover");
          // Realtime recent_orders đã cập nhật, không loadOrders lại để giảm read.
        } else {
          const reason = result.skippedItems[0]?.skip_reason || "Đơn đã được xử lý bởi máy khác.";
          setMessage("Không bàn giao: " + reason, "red");
          playSound("error");
          // Không loadOrders lại để giảm read; recent_orders listener sẽ cập nhật.
        }
      } catch (error) {
        setMessage("Lỗi bàn giao: " + error.message, "red");
        playSound("error");
      }
    }

    async function deleteOrder(id, code) {
      const currentOrder = allOrders.find(order => order.id === id);
      if (currentOrder && !orderCanBeOperated(currentOrder)) {
        setMessage("Đơn không còn active, không thể hủy: " + code, "red");
        playSound("error");
        return;
      }
      if (!confirm("Hủy và xóa đơn " + code + " khỏi dữ liệu hệ thống?")) return;
      try {
        await runTransaction(db, async transaction => {
          transaction.delete(doc(db, getOrdersCollectionName(), id));
          transaction.delete(getHandoverQueueRef(id));
          // V1.4: không ghi live_updates; order delta được Worker broadcast trực tiếp.
        });
        await localDeleteOrder(id);
        allOrders = allOrders.filter(order => order.id !== id);
        renderStats(allOrders);
        renderOrders(applyCurrentFilters(allOrders));
        setMessage("Đã xóa đơn: " + code, "green");
        playSound("success");
      } catch (error) {
        setMessage("Lỗi xóa đơn: " + error.message, "red");
        playSound("error");
      }
    }

    

    // =========================
    // Pick sequence helper
    // Sequence chuẩn: pathway ↑, kệ ↑, floor ↑, vị trí ↑, sub ↑.
    // Nếu Location chỉ có "Vị trí" và Sub nằm riêng, vẫn sort Vị trí ↑ rồi Sub ↑.
    // =========================
    function extractFirstNumber(value, fallback = 999999) {
      const match = String(value || "").match(/\d+/);
      return match ? Number(match[0]) : fallback;
    }

    function parsePickLocation(itemOrLocation) {
      const item = (itemOrLocation && typeof itemOrLocation === "object") ? itemOrLocation : { location_code: itemOrLocation };
      const raw = clean(item?.location_code || item?.location || item?.location_base || "");
      const subRaw = item?.sub_code ?? item?.sub ?? item?.sub_no ?? "";
      const parts = raw.split("-").map(x => String(x || "").trim()).filter(Boolean);
      const firstIsWarehouse = parts.length && /[A-Za-z]/.test(parts[0]) && !/^\d+$/.test(parts[0]);
      const warehouse = firstIsWarehouse ? parts[0] : (item?.warehouse_code || "");
      const numericParts = parts.slice(firstIsWarehouse ? 1 : 0).map(x => extractFirstNumber(x)).filter(n => Number.isFinite(n) && n !== 999999);
      let pathway = 999999, shelf = 999999, floor = 999999, position = 999999, sub = extractFirstNumber(subRaw);
      if (numericParts.length >= 5) [pathway, shelf, floor, position, sub] = numericParts.slice(0, 5);
      else if (numericParts.length === 4) [pathway, shelf, floor, position] = numericParts;
      else if (numericParts.length === 3) [pathway, shelf, position] = numericParts;
      else if (numericParts.length === 2) [pathway, position] = numericParts;
      else if (numericParts.length === 1) position = numericParts[0];
      return { raw, valid: !!(raw || String(subRaw || "").trim()), warehouse: warehouse || "", pathway, shelf, floor, position, sub };
    }

    function comparePickSequence(a, b) {
      const la = parsePickLocation(a || {});
      const lb = parsePickLocation(b || {});
      if (la.valid !== lb.valid) return la.valid ? -1 : 1;
      const warehouseCompare = String(la.warehouse).localeCompare(String(lb.warehouse), "en", { numeric: true });
      if (warehouseCompare) return warehouseCompare;
      for (const key of ["pathway", "shelf", "floor", "position", "sub"]) {
        if (la[key] !== lb[key]) return la[key] - lb[key];
      }
      const locationCompare = String(la.raw).localeCompare(String(lb.raw), "en", { numeric: true });
      if (locationCompare) return locationCompare;
      return String(a?.order_code || "").localeCompare(String(b?.order_code || ""), "en", { numeric: true });
    }

    function sortHandoverItemsByPickSequence(items) {
      return [...(items || [])]
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
          const aReady = !!(a.item?.valid && a.item?.status === "NO_RIDER" && (a.item?.location_code || a.item?.sub_code || a.item?.sub));
          const bReady = !!(b.item?.valid && b.item?.status === "NO_RIDER" && (b.item?.location_code || b.item?.sub_code || b.item?.sub));
          if (aReady !== bReady) return aReady ? -1 : 1;
          if (aReady && bReady) {
            const pickCompare = comparePickSequence(a.item, b.item);
            if (pickCompare) return pickCompare;
          }
          return a.index - b.index;
        })
        .map(entry => entry.item);
    }
async function checkOrders() {
      const suffixes = getSuffixInputs();
      if (!suffixes.length) {
        setHandoverMessage("Vui lòng nhập ít nhất 1 mã cuối đơn", "red");
        playSound("error");
        return;
      }

      handoverItems = [];
      currentHoldTicket = null;
      updateHoldButtons();
      setHandoverMessage("Đang kiểm tra location...");

      try {
        for (const suffix of suffixes) {
          let result = await findNoRiderOrdersBySuffixLocalFirst(suffix);
          let matches = result.orders;
          let dbVerifiedNote = matches.length === 1
            ? "DB verified 100%: mã khớp duy nhất với dữ liệu đơn thật" + (matches[0].matched_by ? " (tìm bằng " + matches[0].matched_by + ")" : "")
            : "";

          if (!matches.length) {
            const dbVerified = await findUniqueNoRiderOrderByDbVerifiedOcr(suffix);
            if (dbVerified.orders.length === 1) {
              matches = dbVerified.orders;
              dbVerifiedNote = buildDbVerifiedOcrNote(suffix, dbVerified);
            } else if (dbVerified.ambiguous) {
              handoverItems.push({
                suffix, id: "", order_code: "", warehouse_code: "", location_code: "", status: "",
                scanned: false, valid: false,
                note: buildDbVerifiedOcrAmbiguousNote(suffix, dbVerified)
              });
              continue;
            }
          }

          if (!matches.length) {
            handoverItems.push({
              suffix, id: "", order_code: "", warehouse_code: "", location_code: "", status: "",
              scanned: false, valid: false,
              note: "Không tìm thấy đơn. Có thể nhập Mã đơn hàng/order_sn hoặc nhập thêm ký tự cuối Mã vận đơn."
            });
            continue;
          }

          if (matches.length > 1) {
            const requiredLength = suffix.length <= 5 ? 6 : suffix.length + 1;
            handoverItems.push({
              suffix,
              id: "",
              order_code: matches.map(o => o.order_code).join(", "),
              warehouse_code: "",
              location_code: "",
              status: "",
              scanned: false,
              valid: false,
              note: "Trùng " + matches.length + " đơn. Vui lòng nhập " + requiredLength + " ký tự cuối để phân biệt."
            });
            continue;
          }

          handoverItems.push({ ...matches[0], suffix, scanned: false, valid: true, note: dbVerifiedNote || ("DB verified 100%: mã khớp duy nhất với dữ liệu đơn thật" + (matches[0].matched_by ? " (tìm bằng " + matches[0].matched_by + ")" : "")) });
        }

        // WRITE OPTIMIZED: không ghi check location để giảm write quota
        // await markCheckLocationTimeForValidOrders();
        handoverItems = sortHandoverItemsByPickSequence(handoverItems);
        const dedupeResult = dedupeHandoverItemsByOrderCode(handoverItems);
        handoverItems = dedupeResult.items;
        const removedDuplicateCodes = dedupeResult.duplicates;

        renderHandoverItems();
        updateHoldButtons();

        const validCount = getValidHandoverCount();
        document.getElementById("btnPrintPickList").disabled = handoverItems.length === 0;
        document.getElementById("scanInput").disabled = validCount === 0;
        document.getElementById("btnScan").disabled = validCount === 0;
        document.getElementById("btnCameraScanHandover").disabled = validCount === 0;
        document.getElementById("btnOcrScanHandover").disabled = validCount === 0;

        if (validCount > 0) {
          openModal();
          setTimeout(() => document.getElementById("scanInput").focus(), 150);
          const duplicateNote = removedDuplicateCodes.length
            ? " Đã loại mã trùng: " + removedDuplicateCodes.slice(0, 5).join(", ") + (removedDuplicateCodes.length > 5 ? "..." : "")
            : "";
          setHandoverMessage("Đã check xong. Cần scan " + validCount + " đơn để bàn giao." + duplicateNote, "green");
          playSound("success");
        } else {
          closeModal();
          setHandoverMessage("Không có đơn hợp lệ để scan. Kiểm tra lại ký tự cuối hoặc nhập thêm ký tự.", "red");
          playSound("error");
        }

        setScanMessage("");
        updateHandoverStats();

        // Refresh nhẹ để bảng quản lý cập nhật trạng thái check location mới.
        // READ OPTIMIZED v2.8.7: tạo đơn xong cập nhật local/realtime, không loadOrders lại.
        // // READ OPTIMIZED v2.8.7: disabled loadOrders after create.
      } catch (error) {
        console.error(error);
        setHandoverMessage("Lỗi check location: " + error.message, "red");
        playSound("error");
      }
    }




    function getHoldDateKey(date = new Date()) {
      return date.getFullYear() + String(date.getMonth() + 1).padStart(2, "0") + String(date.getDate()).padStart(2, "0");
    }

    function getHoldValidItems() {
      return (handoverItems || []).filter(i => i && i.valid && i.id && i.status === "NO_RIDER" && i.order_code && i.location_code);
    }

    function updateHoldButtons() {
      const enabled = getHoldValidItems().length > 0 && !holdTicketBusy;
      ["btnCreateHoldTicket", "btnHoldFromModal"].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !enabled;
      });
    }


    function buildHoldActivityEntry(action, operator, detail = "", atMs = Date.now()) {
      const labels = {
        AUTO_RECEIVE: "Tu nhan phieu / Cho scan BOX",
        BOX_ASSIGNED: "Scan BOX / Dang pick",
        BOX_SKIP: "Bo qua BOX / Dang pick",
        BOX_SKIPPED: "Bo qua BOX / Dang pick",
        DIRECT_HANDOVER: "Ban giao truc tiep",
        CANCELLED: "Xoa/Huy phieu",
        CREATE_HOLD: "Tạo phiếu / Chờ nhận phiếu",
        RECEIVE: "Nhận phiếu / Chờ scan BOX",
        BOX_ASSIGN: "Scan BOX / Đang pick",
        PICKED: "Đã pick / Đang xử lý",
        HANDOVER: "Đã bàn giao",
        CANCEL: "Xóa/Hủy phiếu"
      };
      return { action, label: labels[action] || action, operator: clean(operator || "-") || "-", detail: clean(detail || ""), at_ms: Number(atMs || Date.now()) };
    }

    function appendHoldActivityLog(ticket, action, operator, detail = "", atMs = Date.now()) {
      const logs = Array.isArray(ticket?.activity_log) ? ticket.activity_log.slice(-49) : [];
      logs.push(buildHoldActivityEntry(action, operator, detail, atMs));
      return logs;
    }

    function renderHoldActivityLog(ticket) {
      const logs = Array.isArray(ticket?.activity_log) ? ticket.activity_log.slice().sort((a, b) => Number(b.at_ms || 0) - Number(a.at_ms || 0)) : [];
      if (!logs.length) return "";
      return `<details class="hold-transaction-log"><summary>📝 Log transaction (${logs.length})</summary><div class="hold-log-list">${logs.map(log => `<div class="hold-log-line"><b>${escapeHtml(log.label || log.action || "-")}</b> · ${escapeHtml(log.operator || "-")} · ${escapeHtml(formatDate(new Date(Number(log.at_ms || Date.now()))))}${log.detail ? `<div>${escapeHtml(log.detail)}</div>` : ""}</div>`).join("")}</div></details>`;
    }

    function getHoldStatusText(status) {
      const s = String(status || "HOLD").toUpperCase();
      if (s === "HOLD") return "CHỜ NHẬN PHIẾU";
      if (s === "RECEIVED") return "ĐÃ NHẬN PHIẾU / CHỜ SCAN BOX";
      if (s === "BOX_ASSIGNED") return "ĐÃ SCAN BOX / ĐANG PICK";
      if (s === "PICKED") return "ĐÃ PICK / CHỜ SCAN BÀN GIAO";
      if (s === "WAITING_RECEIVE") return "CHỜ NHẬN";
      if (s === "HANDED_OVER") return "ĐÃ BÀN GIAO";
      if (s === "CANCELLED") return "ĐÃ HỦY";
      return s;
    }


    function isActiveHoldTicket(ticket) {
      // V2.0.12 STRICT: “Tất cả phiếu HOLD” phải hiển thị cả trạng thái cuối
      // như HANDED_OVER/DONE trong thời gian visible_until_ms. Chỉ ẩn phiếu bị xóa/hủy
      // hoặc đã hết thời gian hiển thị.
      const status = String(ticket?.status || "HOLD").toUpperCase();
      const workflow = String(ticket?.workflow_status || "").toUpperCase();
      const visibleUntil = Number(ticket?.visible_until_ms || 0);
      if (visibleUntil && visibleUntil <= Date.now()) return false;
      if (ticket?.deleted || ticket?.is_deleted || ticket?.cancelled || ticket?.canceled || ticket?.is_cancelled || ticket?.is_canceled) return false;
      return !["CANCELLED", "CANCELED", "DELETED", "REMOVED"].includes(status)
        && !["CANCELLED", "CANCELED", "DELETED", "REMOVED"].includes(workflow);
    }



    function isHoldTicketBlockingDuplicate(ticket) {
      // V2.0.17: Duplicate check chỉ chặn phiếu còn đang xử lý thật.
      // Phiếu đã bàn giao/HANDED_OVER vẫn còn hiển thị 10 phút trong “Tất cả phiếu HOLD”
      // nhưng KHÔNG được chặn tạo lại đơn đó cho tài xế/lượt mới.
      const status = String(ticket?.status || ticket?.workflow_status || "HOLD").toUpperCase();
      const workflow = String(ticket?.workflow_status || ticket?.status || "HOLD").toUpperCase();
      const blocking = new Set(["HOLD", "WAITING_RECEIVE", "RECEIVED", "BOX_ASSIGNED", "PICKED", "READY_PICK", "READY_TO_PICK"]);
      if (ticket?.deleted || ticket?.is_deleted || ticket?.cancelled || ticket?.canceled || ticket?.is_cancelled || ticket?.is_canceled) return false;
      return blocking.has(status) || blocking.has(workflow);
    }

    function getTicketSequenceNumber(ticket) {
      const direct = Number(ticket?.seq || 0);
      if (Number.isFinite(direct) && direct > 0) return direct;
      const raw = clean(ticket?.ticket_no || ticket?.id || ticket?.ticket_id || "");
      const m = raw.match(/(\d{4,})$/);
      return m ? Number(m[1]) : 999999999;
    }

    function compareTicketDriverSequenceAsc(a, b) {
      const sa = getTicketSequenceNumber(a), sb = getTicketSequenceNumber(b);
      if (sa !== sb) return sa - sb;
      return clean(a?.ticket_no || a?.id || "").localeCompare(clean(b?.ticket_no || b?.id || ""), "en", { numeric:true });
    }

    function compareTicketDriverSequenceDesc(a, b) {
      const sa = getTicketSequenceNumber(a), sb = getTicketSequenceNumber(b);
      if (sa !== sb) return sb - sa;
      return clean(b?.ticket_no || b?.id || "").localeCompare(clean(a?.ticket_no || a?.id || ""), "en", { numeric:true });
    }

    function getHoldSttComparator() {
      return holdSttSortOrder === "asc" ? compareTicketDriverSequenceAsc : compareTicketDriverSequenceDesc;
    }

    function updateHoldSortOrderButtonUi() {
      const btn = document.getElementById("btnToggleHoldSortOrder");
      if (!btn) return;
      btn.textContent = holdSttSortOrder === "asc" ? "⇅ STT: Nhỏ → Lớn" : "⇅ STT: Lớn → Nhỏ";
      btn.title = holdSttSortOrder === "asc" ? "Đang sắp STT từ thấp đến lớn. Bấm để đổi sang lớn xuống thấp." : "Đang sắp STT từ lớn xuống thấp. Bấm để đổi sang thấp đến lớn.";
    }

    function toggleHoldSttSortOrder() {
      holdSttSortOrder = holdSttSortOrder === "asc" ? "desc" : "asc";
      try { localStorage.setItem(HOLD_SORT_ORDER_KEY, holdSttSortOrder); } catch (_) {}
      updateHoldSortOrderButtonUi();
      renderActiveHoldTicketsFromCache({ force: true });
      setHandoverMessage(holdSttSortOrder === "asc" ? "Đang sắp phiếu HOLD theo STT từ thấp đến lớn." : "Đang sắp phiếu HOLD theo STT từ lớn xuống thấp.", "green");
    }

    function isRiderReadyToPickStage(ticket) {
      const stage = String(ticket?.workflow_status || ticket?.status || "").toUpperCase();
      return ["PICKED", "READY_PICK", "READY_TO_PICK", "WAITING_RECEIVE"].includes(stage);
    }

    function compareRiderOverviewDisplayOrder(a, b) {
      // V2.0.1: riêng Rider Overview ưu tiên phiếu "Vui lòng vào lấy hàng" lên đầu.
      // View HOLD vẫn giữ STT tăng dần, không nhảy phiếu.
      const pa = isRiderReadyToPickStage(a) ? 0 : 1;
      const pb = isRiderReadyToPickStage(b) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (pa === 0) {
        const ua = Number(a?.updated_at_ms || a?.picked_at_ms || a?.created_at_ms || 0);
        const ub = Number(b?.updated_at_ms || b?.picked_at_ms || b?.created_at_ms || 0);
        if (ua !== ub) return ub - ua;
      }
      return compareTicketDriverSequenceAsc(a, b);
    }

    function getTodayHoldTicketsFromCache(includeInactive = false) {
      const todayKey = getHoldDateKey();
      return Array.from(holdTicketCache.values())
        .filter(ticket => String(ticket?.date_key || "") === todayKey)
        .filter(ticket => includeInactive || isActiveHoldTicket(ticket))
        .sort(getHoldSttComparator());
    }

    function getHoldTicketSearchInputNormalizedValue() {
      const input = document.getElementById("holdTicketSearchInput");
      return normalizeHoldTicketSearchValue(input?.value || holdSearchPinnedValue || "");
    }

    function freezeHoldSearchBlankFocus(ms = HOLD_SEARCH_BLANK_FOCUS_FREEZE_MS) {
      holdSearchBlankFreezeUntilMs = Math.max(holdSearchBlankFreezeUntilMs || 0, Date.now() + Math.max(1000, Number(ms || HOLD_SEARCH_BLANK_FOCUS_FREEZE_MS)));
    }

    function clearHoldSearchUiFreeze(options = {}) {
      holdSearchPinnedValue = "";
      holdSearchLastRenderedSignature = "";
      holdSearchUiFreezeUntilMs = 0;
      holdSearchBlankFreezeUntilMs = 0;
      if (!options.keepInput) {
        const input = document.getElementById("holdTicketSearchInput");
        if (input) input.value = "";
      }
    }

    function freezeHoldSearchUi(value = "", ms = HOLD_SEARCH_UI_FREEZE_MS) {
      const normalized = normalizeHoldTicketSearchValue(value || getHoldTicketSearchInputNormalizedValue());
      if (normalized) {
        holdSearchPinnedValue = normalized;
        holdSearchUiFreezeUntilMs = Math.max(holdSearchUiFreezeUntilMs || 0, Date.now() + Math.max(1000, Number(ms || HOLD_SEARCH_UI_FREEZE_MS)));
        holdSearchBlankFreezeUntilMs = 0;
      } else {
        freezeHoldSearchBlankFocus(HOLD_SEARCH_BLANK_FOCUS_FREEZE_MS);
      }
    }

    function isHoldSearchUiFrozen() {
      if (!isHandoverPageVisible()) return false;
      const input = document.getElementById("holdTicketSearchInput");
      const value = getHoldTicketSearchInputNormalizedValue();
      const modalOpen = !!document.getElementById("handoverModal")?.classList.contains("show");
      if (modalOpen) return true;
      const searchFocused = document.activeElement === input;
      const stillFrozen = Date.now() < Number(holdSearchUiFreezeUntilMs || 0);
      const blankFrozen = Date.now() < Number(holdSearchBlankFreezeUntilMs || 0);
      return (!!value && (searchFocused || stillFrozen)) || (!value && blankFrozen);
    }

    function findCachedHoldTicketForSearchValue(value) {
      const code = normalizeHoldTicketSearchValue(value || "");
      const boxCode = normalizeHoldBoxCode(value || code);
      if (!code && !boxCode) return null;
      const fromTicketNo = buildHoldTicketIdFromTicketNo(code);
      const list = Array.from(holdTicketCache.values());
      return list.find(ticket => {
        const id = String(ticket?.id || ticket?.ticket_id || "");
        const ticketNo = String(ticket?.ticket_no || "");
        const ticketBox = normalizeHoldBoxCode(ticket?.box_code || "");
        return exactEqual(id, code) || exactEqual(ticketNo, code) || (fromTicketNo && exactEqual(id, fromTicketNo)) || (boxCode && exactEqual(ticketBox, boxCode) && isActiveHoldTicket(ticket));
      }) || null;
    }

    function renderPinnedHoldSearchResultIfNeeded() {
      if (!isHoldSearchUiFrozen()) return false;
      // Keep the selected ticket stable, but reconcile changes to that ticket itself.
      const ticket = findCachedHoldTicketForSearchValue(getHoldTicketSearchInputNormalizedValue());
      const signature = ticket ? getHoldTicketsSignature([ticket]) : "";
      if (signature !== holdSearchLastRenderedSignature) {
        holdSearchLastRenderedSignature = signature;
        renderHoldTicketList(ticket ? [ticket] : [], true);
      }
      return true;
    }

    function getHoldActiveRenderSignature(tickets) {
      return [
        holdMineFilterActive ? "mine" : (holdWaitingFilterActive ? "waiting" : "all"),
        holdSttSortOrder || "desc",
        getHoldTicketsSignature(tickets || []),
        getCurrentOperatorEmail() || ""
      ].join("||");
    }

    function maybeRecoverMineHoldTicketsAfterEmptyRender(tickets, reason = "mine_empty_after_render") {
      if (!holdMineFilterActive) return;
      if (typeof isHandoverPageVisible === "function" && !isHandoverPageVisible()) return;
      const activeTickets = Array.isArray(tickets) ? tickets : [];
      if (activeTickets.some(isHoldTicketMineAndStillNeedsHandover)) return;
      if (!getCurrentOperatorEmail()) return;
      const now = Date.now();
      if (now - Number(holdMineEmptyRecoveryLastAtMs || 0) < 15000) return;
      holdMineEmptyRecoveryLastAtMs = now;
      holdTicketsLastServerUpdatedAtMs = 0;
      holdTicketsLastFullSnapshotAtMs = 0;
      forceReloadTodayHoldTicketsFromServer(reason)
        .then(() => renderActiveHoldTicketsFromCache({ force: true }))
        .catch(() => scheduleHoldAuthoritativeReload(reason + "_retry", 800));
    }

    function scheduleHoldMineReloadAfterViewportChange() {
      if (!holdMineFilterActive) return;
      if (typeof isHandoverPageVisible === "function" && !isHandoverPageVisible()) return;
      if (holdMineViewportReloadTimer) clearTimeout(holdMineViewportReloadTimer);
      holdMineViewportReloadTimer = setTimeout(() => {
        holdMineViewportReloadTimer = null;
        if (!holdMineFilterActive) return;
        holdTicketsLastServerUpdatedAtMs = 0;
        holdTicketsLastFullSnapshotAtMs = 0;
        forceReloadTodayHoldTicketsFromServer("mine_filter_viewport_change")
          .then(() => renderActiveHoldTicketsFromCache({ force: true }))
          .catch(() => scheduleHoldAuthoritativeReload("mine_filter_viewport_retry", 800));
      }, 450);
    }

    try {
      window.addEventListener("orientationchange", scheduleHoldMineReloadAfterViewportChange, { passive: true });
      window.addEventListener("resize", scheduleHoldMineReloadAfterViewportChange, { passive: true });
      window.visualViewport?.addEventListener?.("resize", scheduleHoldMineReloadAfterViewportChange, { passive: true });
    } catch (_) {}

    function renderActiveHoldTicketsFromCache(options = {}) {
      if (renderPinnedHoldSearchResultIfNeeded()) return;
      const force = options === true || !!options.force;
      const tickets = getTodayHoldTicketsFromCache(false);
      const sig = getHoldActiveRenderSignature(tickets);
      if (!force && sig && sig === holdTicketsLastRenderedSignature) return;
      holdTicketsLastRenderedSignature = sig;
      renderHoldTicketList(tickets);
      maybeRecoverMineHoldTicketsAfterEmptyRender(tickets);
    }

    function scheduleRenderActiveHoldTicketsFromCache(reason = "hold_render_debounce", delayMs = 120) {
      if (renderPinnedHoldSearchResultIfNeeded()) return;
      holdTicketsRenderQueuedReason = String(reason || "hold_render_debounce");
      if (holdTicketsRenderTimer) clearTimeout(holdTicketsRenderTimer);
      holdTicketsRenderTimer = setTimeout(() => {
        holdTicketsRenderTimer = null;
        renderActiveHoldTicketsFromCache();
      }, Math.max(30, Number(delayMs || 120)));
    }

    function stopHoldTicketsListener() {
      if (holdTicketsUnsub) {
        try { holdTicketsUnsub(); } catch (e) { console.warn(e); }
      }
      holdTicketsUnsub = null;
      holdTicketsLiveStarted = false;
      if (holdTicketsPollTimer) {
        try { clearInterval(holdTicketsPollTimer); } catch (_) {}
      }
      holdTicketsPollTimer = null;
      holdTicketsPollBusy = false;
      if (holdTicketsRenderTimer) {
        try { clearTimeout(holdTicketsRenderTimer); } catch (_) {}
      }
      holdTicketsRenderTimer = null;
      holdTicketsLastRenderedSignature = "";
      holdTicketsLastSignature = "";
    }

    function findDuplicateHoldItems(items) {
      const activeTickets = getTodayHoldTicketsFromCache(true).filter(isHoldTicketBlockingDuplicate);
      if (!activeTickets.length || !Array.isArray(items) || !items.length) return [];
      const wantedIds = new Set(items.map(i => String(i.id || i.order_id || "")).filter(Boolean));
      const wantedCodes = new Set(items.map(i => String(i.order_code || "")).filter(Boolean));
      const found = [];
      activeTickets.forEach(ticket => {
        const ticketItems = Array.isArray(ticket.items) ? ticket.items : [];
        const ticketOrderIds = Array.isArray(ticket.order_ids) ? ticket.order_ids : [];
        const ticketOrderCodes = Array.isArray(ticket.order_codes) ? ticket.order_codes : [];
        const candidates = [
          ...ticketItems.map(i => ({ id: String(i.id || i.order_id || ""), code: String(i.order_code || "") })),
          ...ticketOrderIds.map(id => ({ id: String(id || ""), code: "" })),
          ...ticketOrderCodes.map(code => ({ id: "", code: String(code || "") }))
        ];
        candidates.forEach(c => {
          if ((c.id && wantedIds.has(c.id)) || (c.code && wantedCodes.has(c.code))) {
            const code = c.code || ticketItems.find(i => String(i.id || i.order_id || "") === c.id)?.order_code || c.id;
            found.push({ code, ticket_no: ticket.ticket_no || ticket.id || "-" });
          }
        });
      });
      const uniq = new Map();
      found.forEach(x => uniq.set(String(x.code) + "|" + String(x.ticket_no), x));
      return Array.from(uniq.values());
    }

    async function ensureTodayHoldTicketsCachedForDuplicateCheck(dateKey) {
      // Nếu View phiếu HOLD đang mở live thì dùng cache hiện tại, không đọc thêm.
      if (holdTicketsLiveStarted) return;
      // Nếu cache đã có phiếu hôm nay thì dùng cache, tránh đọc lại.
      if (getTodayHoldTicketsFromCache(true).length) return;
      const q = query(collection(db, getHoldTicketsCollectionName()), where("date_key", "==", dateKey), limit(1000));
      const snap = await getDocs(q);
      cacheHoldTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    function clearHandoverWorkAreaAfterHold() {
      handoverItems = [];
      const suffixBox = document.getElementById("suffixContainer");
      if (suffixBox) {
        suffixBox.innerHTML = "";
        addSuffixInput();
      }
      const scanInput = document.getElementById("scanInput");
      if (scanInput) {
        scanInput.value = "";
        scanInput.disabled = true;
      }
      ["btnScan", "btnCameraScanHandover", "btnOcrScanHandover", "btnPrintPickList"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
      });
      renderHandoverItems();
      updateHandoverStats();
      updateHoldButtons();
    }

    function getHoldTicketSubCode(item) {
      return clean(item?.sub_code || item?.sub || item?.pick_sub || "");
    }

    function normalizeHoldTicketSearchValue(value) {
      let raw = clean(value || "");
      if (!raw) return "";
      try {
        const obj = JSON.parse(raw);
        raw = clean(obj.ticket_no || obj.ticketNo || obj.ticket || obj.id || raw);
      } catch {}
      raw = raw.replace(/^HOLD\s*[:#\-]?\s*/i, "").trim();
      raw = raw.replace(/^TICKET\s*[:#\-]?\s*/i, "").trim();
      raw = raw.replace(/^PHIEU\s*[:#\-]?\s*/i, "").trim();
      return raw;
    }

    function normalizeHoldBoxCode(value) {
      let raw = clean(value || "");
      if (!raw) return "";
      try {
        const obj = JSON.parse(raw);
        raw = clean(obj.box_code || obj.box || obj.code || raw);
      } catch {}
      raw = raw.replace(/^BOX\s*[:#]\s*/i, "").trim();
      return raw.toUpperCase();
    }

    function buildHoldTicketIdFromTicketNo(ticketNo) {
      const v = normalizeHoldTicketSearchValue(ticketNo);
      const m = v.match(/^(\d{8})[-_](\d{1,6})$/);
      if (!m) return "";
      return getWarehouse() + "_" + m[1] + "_" + String(m[2]).padStart(4, "0");
    }

    async function findHoldTicketByCode(value) {
      const code = normalizeHoldTicketSearchValue(value);
      if (!code) throw new Error("Vui lòng scan/nhập mã phiếu HOLD.");

      const boxCode = normalizeHoldBoxCode(value);
      const cached = Array.from(holdTicketCache.values()).find(ticket =>
        exactEqual(ticket.ticket_no || "", code) || exactEqual(ticket.id || "", code) ||
        (boxCode && exactEqual(normalizeHoldBoxCode(ticket.box_code || ""), boxCode) && isActiveHoldTicket(ticket))
      );
      if (cached) return cached;

      const possibleIds = [];
      if (code.includes("_")) possibleIds.push(code);
      const fromTicketNo = buildHoldTicketIdFromTicketNo(code);
      if (fromTicketNo) possibleIds.push(fromTicketNo);

      for (const id of [...new Set(possibleIds)]) {
        const snap = await getDoc(getHoldTicketRef(id));
        if (snap.exists()) return upsertHoldTicketCache({ id: snap.id, ...snap.data() });
      }

      const q = query(collection(db, getHoldTicketsCollectionName()), where("ticket_no", "==", code), limit(5));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const tickets = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => Number(b.updated_at_ms || b.created_at_ms || 0) - Number(a.updated_at_ms || a.created_at_ms || 0));
        cacheHoldTickets(tickets);
        return tickets[0];
      }

      if (boxCode && typeof apiPost === "function") {
        const byBox = await apiPost("/api/hold/find_by_box", { warehouse: getWarehouse(), box_code: boxCode });
        if (byBox?.found && (byBox.ticket || byBox.item)) return upsertHoldTicketCache(byBox.ticket || byBox.item);
      }
      throw new Error("Không tìm thấy phiếu HOLD hoặc BOX đang sử dụng: " + code);
    }

    async function searchHoldTicketFromInput() {
      const input = document.getElementById("holdTicketSearchInput");
      const value = normalizeHoldTicketSearchValue(input?.value || "");
      if (input) input.value = value;
      freezeHoldSearchUi(value, HOLD_SEARCH_UI_FREEZE_MS);
      try {
        setHandoverMessage("Đang tìm phiếu HOLD " + (value || "...") + "...");
        const ticket = await findHoldTicketByCode(value);
        holdSearchPinnedValue = normalizeHoldTicketSearchValue(ticket.ticket_no || ticket.id || value);
        if (input) input.value = holdSearchPinnedValue;
        freezeHoldSearchUi(holdSearchPinnedValue, HOLD_SEARCH_UI_FREEZE_MS);
        renderHoldTicketList([ticket], true);
        setHandoverMessage("Đã tìm thấy phiếu " + (ticket.ticket_no || ticket.id) + (ticket.box_code ? " — BOX: " + ticket.box_code : "") + " — " + getHoldStatusText(ticket.status) + ". Đã khóa cứng danh sách tạm thời: realtime phiếu khác chỉ cập nhật cache, không thay HTML/nút bàn giao.", "green");
        try { input?.focus(); input?.select?.(); } catch (_) {}
        playSound("success");
      } catch (error) {
        console.error(error);
        setHandoverMessage("Lỗi tìm phiếu: " + (error.message || error), "red");
        playSound("error");
      }
    }

    function buildCode128BarcodeSvg(value, widthMm = 88, heightMm = 18) {
      // V1.9.7: Code 128-B nội tuyến, không gọi thư viện/CDN nên in nhanh và ổn định.
      const raw = String(value || "").replace(/[^\x20-\x7E]/g, "").trim();
      if (!raw) return "";
      const patterns = [
        "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
        "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
        "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
        "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
        "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
        "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
        "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
        "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
        "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
        "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
        "114131","311141","411131","211412","211214","211232","2331112"
      ];
      const codes = [104];
      for (const ch of raw) codes.push(ch.charCodeAt(0) - 32);
      let checksum = 104;
      for (let i = 1; i < codes.length; i++) checksum += codes[i] * i;
      checksum %= 103;
      codes.push(checksum, 106);
      let x = 10;
      const bars = [];
      for (const code of codes) {
        const p = patterns[code] || "";
        for (let i = 0; i < p.length; i++) {
          const width = Number(p[i]);
          if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${width}" height="46" fill="#111"/>`);
          x += width;
        }
      }
      const total = x + 10;
      return `<svg class="code128" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 46" preserveAspectRatio="none" role="img" aria-label="Barcode ${escapeHtml(raw)}" style="width:${Number(widthMm)}mm;height:${Number(heightMm)}mm;display:block">${bars.join("")}</svg>`;
    }

    function getRiderPrintSequence(ticketNo) {
      const digits = String(ticketNo || "").replace(/\D/g, "");
      return (digits.slice(-4) || "0000").padStart(4, "0");
    }

    function buildPrintAutoRunScript() {
      // Chrome thường bắt buộc hiển thị Print Preview. Chrome --kiosk-printing sẽ in thẳng
      // bằng thiết lập printer/profile đã lưu lần đầu.
      return `<script>(function(){
        document.title = "";
        window.onafterprint = function(){ setTimeout(function(){ try { window.close(); } catch (_) {} }, 80); };
        function runPrint(){
          try { window.focus(); } catch (_) {}
          setTimeout(function(){ try { window.print(); } catch (_) {} }, 100);
        }
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(runPrint).catch(runPrint);
        } else { runPrint(); }
      })();<\/script>`;
    }

    function buildRiderCodePrintHtml(ticket) {
      const items = Array.isArray(ticket?.items) ? ticket.items : [];
      const ticketNo = String(ticket?.ticket_no || ticket?.id || "-");
      const stt = getRiderPrintSequence(ticketNo);
      const driverName = String(ticket?.driver_name || "-");
      const orderCount = Number(ticket?.order_count || items.length || 0);
      // Barcode thấp hơn và có quiet zone để không cắt thông tin khi printer chừa vùng in.
      const barcode = buildCode128BarcodeSvg(ticketNo, 84, 14);
      return `
        <!doctype html>
        <html><head><meta charset="utf-8"><title>IFC_01 Handover</title>
        <style>
          @media print {
            @page { size:100mm 50mm; margin:0 !important; }
            html, body { width:100mm !important; height:50mm !important; margin:0 !important; padding:0 !important; }
          }
          * { box-sizing:border-box; }
          html, body {
            margin:0 !important; padding:0 !important;
            width:100mm !important; height:50mm !important;
            min-width:100mm !important; min-height:50mm !important;
            overflow:hidden !important;
            background:#fff !important; color:#000 !important;
            font-family:Arial,'Segoe UI',Tahoma,sans-serif !important;
            writing-mode:horizontal-tb !important;
            transform:none !important; rotate:none !important; zoom:1 !important;
          }
          body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
          .sheet {
            position:relative; width:100mm; height:50mm; overflow:hidden;
            padding:3mm 5mm 2mm 5mm;
          }
          .top { display:flex; justify-content:space-between; align-items:flex-start; gap:2mm; height:12mm; }
          .head { min-width:0; flex:1; overflow:hidden; }
          .label-title { font-size:7.2pt; line-height:1; font-weight:900; letter-spacing:.25mm; margin-bottom:1.1mm; }
          .ticket-no { font-size:17pt; line-height:1; font-weight:900; letter-spacing:.18mm; white-space:nowrap; }
          .stt-box {
            width:24mm; height:12mm; flex:none;
            border:.45mm solid #000; border-radius:1.1mm;
            display:flex; flex-direction:column; justify-content:center; align-items:center;
          }
          .stt-label { font-size:6.5pt; line-height:1; font-weight:900; margin-bottom:.35mm; }
          .stt { font-size:22pt; line-height:.86; font-weight:900; letter-spacing:.45mm; }
          .meta {
            width:90mm; height:8mm; margin-top:1.2mm;
            border-top:.35mm solid #000; border-bottom:.35mm solid #000;
            display:grid; grid-template-columns:minmax(0,1fr) 29mm; gap:2.5mm; align-items:center;
          }
          .m-label { font-size:6pt; line-height:1; font-weight:900; margin-bottom:.55mm; }
          .m-value { font-size:10.5pt; line-height:1; font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .count .m-value { font-size:13pt; text-align:center; }
          .barcode {
            width:84mm; height:14mm; margin:1.9mm auto .45mm;
            display:flex; justify-content:center; align-items:center; overflow:hidden;
          }
          .barcode svg { width:84mm !important; height:14mm !important; display:block !important; }
          .human { font-size:8pt; line-height:1; text-align:center; letter-spacing:1mm; font-weight:900; }
        </style></head><body>
          <div class="sheet">
            <div class="top">
              <div class="head">
                <div class="label-title">MÃ RIDER</div>
                <div class="ticket-no">${escapeHtml(ticketNo)}</div>
              </div>
              <div class="stt-box"><div class="stt-label">STT</div><div class="stt">${escapeHtml(stt)}</div></div>
            </div>
            <div class="meta">
              <div><div class="m-label">TÀI XẾ</div><div class="m-value">${escapeHtml(driverName)}</div></div>
              <div class="count"><div class="m-label">ĐƠN ĐỢI LẤY</div><div class="m-value">${orderCount}</div></div>
            </div>
            <div class="barcode">${barcode}</div>
            <div class="human">${escapeHtml(ticketNo)}</div>
          </div>
          ${buildPrintAutoRunScript()}
        </body></html>
      `;
    }

    function buildHoldTicketPrintHtml(ticket) {
      const items = Array.isArray(ticket?.items) ? ticket.items : [];
      const ticketNo = String(ticket?.ticket_no || ticket?.id || "-");
      const stt = getRiderPrintSequence(ticketNo);
      const barcode = buildCode128BarcodeSvg(ticketNo, 86, 15);
      const rows = items.map((item, index) => `
        <tr><td>${Number(item.seq || index + 1)}</td><td>${escapeHtml(item.order_code || "-")}</td><td>${escapeHtml(item.location_code || "-")}</td><td>${escapeHtml(getHoldTicketSubCode(item) || "-")}</td></tr>
      `).join("");
      return `
        <!doctype html>
        <html><head><meta charset="utf-8"><title>IFC_01 Handover</title>
        <style>
          @media print {
            @page { size:100mm 150mm; margin:0 !important; }
            html, body { width:100mm !important; height:150mm !important; margin:0 !important; padding:0 !important; }
          }
          * { box-sizing:border-box; }
          html, body {
            margin:0 !important; padding:0 !important;
            width:100mm !important; height:150mm !important;
            min-width:100mm !important; min-height:150mm !important;
            overflow:hidden !important; background:#fff !important; color:#000 !important;
            font-family:Arial,'Segoe UI',Tahoma,sans-serif !important;
            writing-mode:horizontal-tb !important; transform:none !important; rotate:none !important; zoom:1 !important;
          }
          body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
          .ticket { width:100mm; height:150mm; padding:5mm 5mm 4mm; overflow:hidden; }
          .head { display:flex; justify-content:space-between; align-items:flex-start; gap:2mm; margin-bottom:1.5mm; }
          .title { font-size:15pt; line-height:1.05; font-weight:900; }
          .stt { border:.45mm solid #000; border-radius:1mm; padding:1mm 1.7mm; font-size:18pt; line-height:1; font-weight:900; white-space:nowrap; }
          .ticket-no { text-align:center; font-size:20pt; line-height:1; font-weight:900; letter-spacing:.2mm; margin:0 0 1.5mm; }
          .barcode { display:flex; justify-content:center; width:86mm; height:15mm; margin:0 auto .7mm; overflow:hidden; }
          .barcode svg { width:86mm !important; height:15mm !important; display:block !important; }
          .human { text-align:center; font-size:9pt; font-weight:900; letter-spacing:1mm; margin-bottom:2.2mm; }
          .meta {
            display:grid; grid-template-columns:1fr 1fr; gap:1.5mm 2.5mm;
            border:.4mm solid #000; border-radius:1mm; padding:2mm;
            font-size:11pt; line-height:1.15; margin-bottom:2.4mm;
          }
          .meta div { min-width:0; overflow-wrap:anywhere; }
          .meta b { font-weight:900; }
          table { width:100%; border-collapse:collapse; table-layout:fixed; margin-top:1mm; }
          th, td {
            border:.35mm solid #000; padding:1.6mm 1mm; text-align:left;
            font-size:10pt; line-height:1.15; word-break:break-word; vertical-align:top;
          }
          th { background:#f3f4f6; font-weight:900; }
          th:nth-child(1), td:nth-child(1) { width:10mm; text-align:center; }
          th:nth-child(2), td:nth-child(2) { width:29mm; }
          th:nth-child(4), td:nth-child(4) { width:13mm; text-align:center; }
          tr { page-break-inside:avoid; break-inside:avoid; }
          .note { margin-top:2.4mm; padding-top:1.6mm; border-top:.35mm dashed #000; font-size:9.5pt; line-height:1.22; font-weight:800; }
        </style></head><body>
          <div class="ticket">
            <div class="head"><div class="title">IFC_01 Handover · PHIẾU PICK</div><div class="stt">STT ${escapeHtml(stt)}</div></div>
            <div class="ticket-no">${escapeHtml(ticketNo)}</div>
            <div class="barcode">${barcode}</div>
            <div class="human">${escapeHtml(ticketNo)}</div>
            <div class="meta">
              <div><b>Kho:</b> ${escapeHtml(ticket.warehouse_code || getWarehouse())}</div><div><b>BOX:</b> ${escapeHtml(ticket.box_code || "-")}</div>
              <div><b>Tài xế:</b> ${escapeHtml(ticket.driver_name || "-")}</div><div><b>Số đơn:</b> ${items.length}</div>
              <div><b>Trạng thái:</b> ${escapeHtml(getHoldStatusText(ticket.status))}</div><div><b>Ngày:</b> ${escapeHtml(formatDate(new Date()))}</div>
            </div>
            <table><thead><tr><th>STT</th><th>Mã đơn</th><th>Location</th><th>Sub</th></tr></thead><tbody>${rows || `<tr><td colspan="4">Phiếu chưa có đơn.</td></tr>`}</tbody></table>
            <div class="note">Quy trình: Nhận phiếu → Scan BOX hoặc Bỏ qua BOX → Đã pick → Scan bàn giao.</div>
          </div>
          ${buildPrintAutoRunScript()}
        </body></html>
      `;
    }

    function openImmediatePrintWindow() {
      const w = window.open("", "_blank");
      if (!w) { setHandoverMessage("Trình duyệt chặn cửa sổ in. Hãy cho phép popup rồi bấm in lại.", "red"); return null; }
      try { w.document.open(); w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>IFC_01 Handover</title></head><body style="font-family:Arial,sans-serif;padding:20px">Đang chuẩn bị dữ liệu in...</body></html>`); w.document.close(); } catch (_) {}
      return w;
    }
    function writePrintHtml(w, html) {
      if (!w || w.closed) return false;
      w.document.open(); w.document.write(html); w.document.close(); return true;
    }
    function printRiderCode(ticket, preparedWindow = null) {
      if (!ticket) { try { preparedWindow?.close(); } catch (_) {} setHandoverMessage("Chưa có phiếu HOLD để in mã Rider.", "red"); return; }
      const w = preparedWindow || openImmediatePrintWindow(); if (!w) return; writePrintHtml(w, buildRiderCodePrintHtml(ticket));
    }
    function printHoldTicket(ticket, preparedWindow = null) {
      if (!ticket || !(ticket.items || []).length) { try { preparedWindow?.close(); } catch (_) {} setHandoverMessage("Chưa có phiếu HOLD để in.", "red"); return; }
      const w = preparedWindow || openImmediatePrintWindow(); if (!w) return; writePrintHtml(w, buildHoldTicketPrintHtml(ticket));
    }

    function getUiTicketOrderCodes(ticket) {
      const normalized = normalizeHoldTicketNoDuplicateItems(ticket || {});
      const items = Array.isArray(normalized?.items) ? normalized.items : [];
      const codes = [];
      items.forEach(item => {
        const code = clean(getHoldDuplicateCodeKey(item) || item?.order_code || item?.tracking_no || "");
        if (code && !codes.includes(code)) codes.push(code);
      });
      (Array.isArray(normalized?.order_codes) ? normalized.order_codes : []).forEach(raw => {
        const code = clean(raw || "");
        if (code && !codes.includes(code)) codes.push(code);
      });
      return codes;
    }

    async function copyTextForUi(text, successMessage, context = "hold") {
      const value = String(text || "");
      if (!value) return false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(value);
        } else {
          const input = document.createElement("textarea");
          input.value = value;
          input.setAttribute("readonly", "");
          input.style.position = "fixed";
          input.style.opacity = "0";
          document.body.appendChild(input);
          input.select();
          document.execCommand("copy");
          input.remove();
        }
        if (context === "rider") setRiderOverviewMessage(successMessage, "green");
        else setHandoverMessage(successMessage, "green");
        return true;
      } catch (error) {
        const msg = "Không copy được. Hãy thử lại hoặc copy thủ công.";
        if (context === "rider") setRiderOverviewMessage(msg, "red");
        else setHandoverMessage(msg, "red");
        return false;
      }
    }

    async function copyTicketOrderCodes(ticket, context = "hold") {
      const codes = getUiTicketOrderCodes(ticket);
      if (!codes.length) {
        if (context === "rider") setRiderOverviewMessage("Phiếu chưa có danh sách đơn để copy.", "red");
        else setHandoverMessage("Phiếu chưa có danh sách đơn để copy.", "red");
        return;
      }
      await copyTextForUi(codes.join("\n"), "Đã copy " + codes.length + " mã đơn của phiếu " + (ticket.ticket_no || ticket.id || "-") + ".", context);
    }

    // =========================
    // VNWL V1.5.2 - SUCCESS POPUP SAU BÀN GIAO
    // Dùng chính successItems đã commit thành công; không gọi thêm API, không tăng read D1.
    // "Mã đơn" bám đúng giá trị order_code/tracking_no đã hiển thị trong popup bàn giao.
    // =========================
    function getHandoverSuccessOrderCodes(items = lastHandoverSuccessItems) {
      const codes = [];
      (Array.isArray(items) ? items : []).forEach(item => {
        const code = clean(item?.order_code || item?.tracking_no || item?.code || getRealShopeeOrderSn(item) || "");
        if (code && !codes.includes(code)) codes.push(code);
      });
      return codes;
    }

    function showHandoverSuccessModal(successItems, totalRequested = 0, skippedCount = 0) {
      lastHandoverSuccessItems = Array.isArray(successItems) ? successItems.slice() : [];
      const codes = getHandoverSuccessOrderCodes();
      const successCount = lastHandoverSuccessItems.length;
      const total = Number(totalRequested || successCount);
      const skipped = Number(skippedCount || 0);

      const summary = document.getElementById("handoverSuccessSummary");
      const subtitle = document.getElementById("handoverSuccessSubtitle");
      const list = document.getElementById("handoverSuccessOrderList");
      const copyMessage = document.getElementById("handoverSuccessCopyMessage");
      const copyButton = document.getElementById("btnCopyHandoverSuccessCodes");

      if (summary) {
        summary.textContent = skipped > 0
          ? "✅ Đã bàn giao thành công " + successCount + "/" + total + " đơn. Bỏ qua " + skipped + " đơn đã xử lý trước."
          : "✅ Đã bàn giao thành công " + successCount + "/" + total + " đơn.";
      }
      if (subtitle) subtitle.textContent = "Trạng thái đã ghi nhận thành công. Bạn có thể copy danh sách mã đơn ngay bên dưới.";
      if (copyMessage) {
        copyMessage.textContent = "";
        copyMessage.className = "message handover-success-copy-message";
      }
      if (list) {
        list.innerHTML = "";
        codes.forEach((code, index) => {
          const div = document.createElement("div");
          div.className = "handover-success-order";
          div.innerHTML = `<span class="handover-success-order-index">${index + 1}.</span><span>${escapeHtml(code)}</span>`;
          list.appendChild(div);
        });
        if (!codes.length) {
          list.innerHTML = `<div class="handover-success-order" style="color:#64748b;">Không có mã để copy.</div>`;
        }
      }
      if (copyButton) copyButton.disabled = !codes.length;

      const modal = document.getElementById("handoverSuccessModal");
      if (modal) {
        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
      }
    }

    async function copyHandoverSuccessCodes() {
      const codes = getHandoverSuccessOrderCodes();
      const message = document.getElementById("handoverSuccessCopyMessage");
      if (!codes.length) {
        if (message) {
          message.textContent = "Không có danh sách mã đơn để copy.";
          message.className = "message red handover-success-copy-message";
        }
        return;
      }
      const ok = await copyTextForUi(codes.join("\n"), "Đã copy " + codes.length + " mã đơn bàn giao thành công.", "hold");
      if (message) {
        message.textContent = ok
          ? "✅ Đã copy " + codes.length + " mã đơn."
          : "Không copy được. Hãy thử lại hoặc copy thủ công.";
        message.className = "message " + (ok ? "green" : "red") + " handover-success-copy-message";
      }
    }

    function closeHandoverSuccessModal() {
      const modal = document.getElementById("handoverSuccessModal");
      if (modal) {
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
      }
    }

    async function showHoldTicketQrModal(ticket) {
      const ticketNo = clean(ticket?.ticket_no || ticket?.id || "");
      if (!ticketNo) {
        setHandoverMessage("Không tìm thấy mã phiếu để tạo QR.", "red");
        return;
      }
      const qrData = "HOLD:" + ticketNo;
      const image = document.getElementById("holdQrImage");
      const text = document.getElementById("holdQrTicketNo");
      if (image) image.src = await window.QRCode.toDataURL(qrData,{width:320});
      if (text) text.textContent = ticketNo;
      const modal = document.getElementById("holdQrModal");
      if (modal) {
        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
      }
    }

    function closeHoldTicketQrModal() {
      const modal = document.getElementById("holdQrModal");
      if (modal) {
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
      }
    }

    function setHoldBoxMessage(text, color = "") {
      const el = document.getElementById("holdBoxMessage");
      if (!el) return;
      el.textContent = text || "";
      el.className = "message" + (color ? " " + color : "");
    }

    function openHoldBoxModal(ticket) {
      if (!ticket?.id) return;
      pendingHoldBoxTicketId = ticket.id;
      const info = document.getElementById("holdBoxTicketInfo");
      const input = document.getElementById("holdBoxScanInput");
      if (info) info.textContent = "Phiếu: " + (ticket.ticket_no || ticket.id) + " · Tài xế: " + (ticket.driver_name || "-");
      if (input) input.value = ticket.box_code || "";
      setHoldBoxMessage(ticket.box_code ? "Phiếu đã có BOX " + ticket.box_code + "." : "Vui lòng scan mã BOX để bắt đầu đi pick.", ticket.box_code ? "green" : "");
      const modal = document.getElementById("holdBoxModal");
      if (modal) { modal.classList.add("show"); modal.setAttribute("aria-hidden", "false"); }
      setTimeout(() => input?.focus(), 120);
    }

    function closeHoldBoxModal() {
      const modal = document.getElementById("holdBoxModal");
      if (modal) { modal.classList.remove("show"); modal.setAttribute("aria-hidden", "true"); }
      if (cameraScannerMode === "hold_box") closeCameraScanner();
    }

    async function assignBoxToPendingHoldTicket() {
      if (!pendingHoldBoxTicketId) { setHoldBoxMessage("Không có phiếu đang chờ gắn BOX.", "red"); return; }
      const input = document.getElementById("holdBoxScanInput");
      const boxCode = normalizeHoldBoxCode(input?.value || "");
      if (!boxCode) { setHoldBoxMessage("Vui lòng scan mã BOX.", "red"); input?.focus(); playSound("error"); return; }
      if (input) input.value = boxCode;
      try {
        setHoldBoxMessage("Đang xác nhận BOX " + boxCode + "...", "");
        const ticket = await readHoldTicket(pendingHoldBoxTicketId);
        const status = String(ticket.status || "HOLD").toUpperCase();
        if (!["RECEIVED", "BOX_ASSIGNED"].includes(status)) throw new Error("Phiếu chưa ở bước Nhận phiếu hoặc đã chuyển trạng thái khác.");
        const nowMs = Date.now();
        const operator = getCurrentOperatorEmail();
        const activityLog = appendHoldActivityLog(ticket, "BOX_ASSIGN", operator, "Đã gắn BOX " + boxCode + " để đi pick.", nowMs);
        const result = await apiPost("/api/hold/claim_box", { warehouse: getWarehouse(), ticket_id: ticket.id, box_code: boxCode, activity_log: activityLog });
        const updated = upsertHoldTicketCache(result.ticket || result.item || { ...ticket, status:"BOX_ASSIGNED", workflow_status:"BOX_ASSIGNED", box_code:boxCode, box_assigned_at_ms:nowMs, box_assigned_by:operator, activity_log:activityLog });
        currentHoldTicket = updated;
        renderActiveHoldTicketsFromCache();
        await pushHoldTicketStageToRiderOverview(updated, "BOX_ASSIGNED");
        setHoldBoxMessage("Đã gắn BOX " + boxCode + ". Có thể đi pick.", "green");
        setHandoverMessage("Đã scan BOX " + boxCode + " cho phiếu " + (updated.ticket_no || updated.id) + ". Nhân viên bắt đầu đi pick; BOX sẽ tự giải phóng sau bàn giao hoặc xóa phiếu.", "green");
        showVnwlToast("Đã gắn BOX", boxCode + " — Phiếu " + (updated.ticket_no || updated.id), "ok", 8000);
        playSound("success");
        forceReloadTodayHoldTicketsFromServer("box_assigned_confirm").catch(() => undefined);
        setTimeout(closeHoldBoxModal, 450);
      } catch (error) {
        const message = error?.payload?.message || error.message || String(error);
        setHoldBoxMessage(message, "red");
        setHandoverMessage("Lỗi scan BOX: " + message, "red");
        playSound("error");
        input?.select();
      }
    }

    async function skipBoxForPendingHoldTicket(ticketIdInput = "") {
      const ticketId = ticketIdInput || pendingHoldBoxTicketId;
      if (!ticketId) { setHoldBoxMessage("Không xác định được phiếu cần bỏ qua BOX.", "red"); return; }
      try {
        const cachedTicket = getCachedHoldTicket(ticketId) || null;
        if (cachedTicket && String(cachedTicket.status || "HOLD").toUpperCase() !== "RECEIVED") {
          setHoldBoxMessage("Chỉ bỏ qua BOX khi phiếu đang ở bước Đã nhận phiếu / Chờ scan BOX.", "red");
          setHandoverMessage("Phiếu " + (cachedTicket.ticket_no || cachedTicket.id) + " không ở trạng thái chờ BOX.", "red");
          return;
        }
        if (cachedTicket && normalizeHoldBoxCode(cachedTicket.box_code || "")) {
          setHoldBoxMessage("Phiếu đã gắn BOX " + cachedTicket.box_code + ", không thể bỏ qua BOX.", "red");
          return;
        }
        const nowMs = Date.now();
        const operator = getCurrentOperatorEmail();
        const activityLog = cachedTicket ? appendHoldActivityLog(cachedTicket, "BOX_SKIP", operator, "Không dùng BOX; tiếp tục đi pick và vẫn phải bấm Đã pick.", nowMs) : null;
        setHoldBoxMessage("Đang bỏ qua BOX...", "green");
        const result = await apiPost("/api/hold/skip_box", {
          warehouse: getWarehouse(),
          ticket_id: ticketId,
          operator,
          activity_log: activityLog,
          device_id: getDeviceId(),
          device_kind: getClientDeviceKind()
        });
        if (!result?.ok || !result?.ticket) throw new Error(result?.error || result?.message || "Không bỏ qua được BOX.");
        const updated = upsertHoldTicketCache(result.ticket);
        currentHoldTicket = updated;
        renderActiveHoldTicketsFromCache();
        setHandoverMessage("Đã bỏ qua BOX cho phiếu " + (updated.ticket_no || updated.id) + ". Tiếp tục pick hàng, sau đó vẫn phải bấm Đã pick theo flow cũ.", "green");
        setHoldBoxMessage("✅ Đã bỏ qua BOX. Sau khi pick xong hãy bấm Đã pick.", "green");
        playSound("success");
        setTimeout(closeHoldBoxModal, 350);
      } catch (error) {
        console.error(error);
        setHoldBoxMessage("Lỗi bỏ qua BOX: " + (error.message || error), "red");
        setHandoverMessage("Lỗi bỏ qua BOX: " + (error.message || error), "red");
        playSound("error");
      }
    }



    function vnwlSafeToast(title, detail = "", kind = "ok", timeoutMs = 7000) {
      try {
        if (typeof showVnwlToast === "function") {
          return showVnwlToast(title, detail, kind, timeoutMs);
        }
      } catch (_) {}
      try {
        console.log("[VNWL TOAST]", title || "", detail || "", kind || "", timeoutMs || "");
      } catch (_) {}
    }

    function getClientDeviceKind() {
      return String(location.pathname || "").toLowerCase().includes("/mobile") ? "MOBILE" : "PC";
    }

    function getHoldOwnerDeviceId(ticket) {
      return clean(ticket?.received_device_id || ticket?.box_assigned_device_id || ticket?.picked_device_id || ticket?.handover_device_id || "");
    }

    function isHoldReceivedByCurrentAccount(ticket) {
      const current = clean(getCurrentOperatorEmail() || "").toLowerCase();
      if (!current) return false;
      // VNWL_MY_TICKETS_EMAIL_SAFE_V4: bám theo email tài khoản, không bám device_id.
      // Đọc nhiều field để không mất phiếu sau out/reload hoặc sau các bước BOX/PICK đổi operator field.
      const candidates = [
        ticket?.received_by,
        ticket?.received_email,
        ticket?.received_operator,
        ticket?.operator_email,
        ticket?.operator,
        ticket?.last_operator,
        ticket?.hold_received_by,
        ticket?.hold_operator_email,
        ticket?.box_skipped_by,
        ticket?.picked_by
      ].map(v => clean(v).toLowerCase()).filter(Boolean);
      return candidates.includes(current);
    }

    function isHoldTicketStillNeedsHandover(ticket) {
      const status = String(ticket?.status || "").toUpperCase();
      const workflow = String(ticket?.workflow_status || "").toUpperCase();
      const terminalStatuses = new Set([
        "HANDED_OVER", "HANDEDOVER", "HANDOVER", "HANDOVERED", "HANDED",
        "DELIVERED", "DONE", "COMPLETED", "FINISHED", "SUCCESS",
        "NOT_DONE", "WAITING_PICKUP_DONE", "PICKUP_DONE",
        "CANCELLED", "CANCELED", "DELETED", "REMOVED"
      ]);
      if (terminalStatuses.has(status) || terminalStatuses.has(workflow)) return false;
      if (Number(ticket?.handed_over_at_ms || ticket?.handover_at_ms || 0) > 0) return false;
      return true;
    }

    function isHoldTicketMineAndStillNeedsHandover(ticket) {
      return isHoldReceivedByCurrentAccount(ticket) && isHoldTicketStillNeedsHandover(ticket);
    }

    function isHoldTicketMine(ticket) {
      return typeof isHoldReceivedByCurrentAccount === "function" ? isHoldReceivedByCurrentAccount(ticket) : false;
    }

    function isHoldOwnedByThisDevice(ticket) {
      return isHoldReceivedByCurrentAccount(ticket);
    }

    function updateHoldMineFilterButtonUi() {
      const select = document.getElementById("holdTicketFilterSelect");
      if (!select) return;
      const value = holdMineFilterActive ? "mine" : (holdWaitingFilterActive ? "waiting" : "all");
      select.value = value;
      select.classList.remove("filter-all", "filter-waiting", "filter-mine");
      select.classList.add(value === "mine" ? "filter-mine" : (value === "waiting" ? "filter-waiting" : "filter-all"));
    }

    function scheduleHoldAuthoritativeReload(reason = "hold_authoritative_reconcile", delayMs = 180) {
      // V2.0.23 QUOTA-SAFE:
      // WebSocket delta đã cập nhật cache nhanh. Snapshot chuẩn từ D1 vẫn giữ lại,
      // nhưng không kéo full list liên tục sau mỗi sự kiện/poll để tránh đốt quota D1.
      const reloadReason = String(reason || "hold_authoritative_reconcile");
      const now = Date.now();
      const isSafetyPoll = reloadReason === "strict_hold_safety_poll";
      const isWsDeltaCheck = reloadReason.includes("ws_hold_delta") || reloadReason.includes("hold_live_snapshot");
      const minGapMs = isSafetyPoll ? 60000 : (isWsDeltaCheck ? 30000 : 0);
      if (minGapMs && holdAuthoritativeLastReloadAtMs && now - holdAuthoritativeLastReloadAtMs < minGapMs) return;
      if (typeof isHoldSearchUiFrozen === "function" && isHoldSearchUiFrozen() && (isSafetyPoll || isWsDeltaCheck)) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden" && (isSafetyPoll || isWsDeltaCheck)) return;

      holdAuthoritativeReloadQueuedReason = reloadReason;
      if (holdAuthoritativeReloadTimer) clearTimeout(holdAuthoritativeReloadTimer);
      holdAuthoritativeReloadTimer = setTimeout(async () => {
        holdAuthoritativeReloadTimer = null;
        if (!db) return;
        const visible = isHandoverPageVisible() || isRiderOverviewPageVisible();
        if (!visible && !holdTicketsLiveStarted) return;
        if (holdAuthoritativeReloadBusy) {
          scheduleHoldAuthoritativeReload(holdAuthoritativeReloadQueuedReason || "hold_authoritative_requeue", 1000);
          return;
        }
        holdAuthoritativeReloadBusy = true;
        try {
          holdAuthoritativeLastReloadAtMs = Date.now();
          await forceReloadTodayHoldTicketsFromServer(holdAuthoritativeReloadQueuedReason || "hold_authoritative_reconcile");
        } catch (error) {
          console.warn("Authoritative HOLD snapshot warning:", error);
        } finally {
          holdAuthoritativeReloadBusy = false;
        }
      }, Math.max(0, Number(delayMs || 0)));
    }

    function startHoldTicketsStrictSafetyPoll() {
      // V2.0.23 QUOTA-SAFE: giữ safety poll nhưng giảm từ 4 giây xuống 60 giây.
      // Realtime WebSocket/delta là kênh chính; poll chỉ là lưới an toàn khi bỏ lỡ tín hiệu.
      if (holdTicketsPollTimer) return;
      holdTicketsPollTimer = setInterval(() => {
        if (!db) return;
        if (!isHandoverPageVisible() && !isRiderOverviewPageVisible()) return;
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        if (typeof isHoldSearchUiFrozen === "function" && isHoldSearchUiFrozen()) return;
        scheduleHoldAuthoritativeReload("strict_hold_safety_poll", 0);
      }, 60000);
    }

    async function forceReloadTodayHoldTicketsFromServer(reason = "manual_force_reload") {
      if (holdTicketsServerReloadPromise) {
        try { return await holdTicketsServerReloadPromise; } catch (_) {}
      }
      holdTicketsServerReloadPromise = (async () => {
        // VNWL_QUOTA_JOIN_HOLD_RELOAD: coalesce duplicate snapshot reloads per tab.
        try {
        if (typeof apiPost !== "function") return getTodayHoldTicketsFromCache(true);
        const reloadReason = String(reason || "manual_force_reload");
        const nowMs = Date.now();
        const mineFilterNeedsFresh = !!holdMineFilterActive && (
          !holdTicketsLastFullSnapshotAtMs ||
          reloadReason.includes("initial") ||
          reloadReason.includes("resume") ||
          reloadReason.includes("visible") ||
          reloadReason.includes("open") ||
          reloadReason.includes("manual") ||
          reloadReason.includes("claim") ||
          reloadReason.includes("orientation") ||
          reloadReason.includes("viewport") ||
          (nowMs - Number(holdTicketsLastFullSnapshotAtMs || 0) > 10 * 60 * 1000)
        );
        const forceMineFresh = mineFilterNeedsFresh || reloadReason.includes("mine") || reloadReason.includes("received_by_me") || reloadReason.includes("my_tickets");
        const needsFullSnapshot = forceMineFresh || !holdTicketsLastServerUpdatedAtMs || reloadReason.includes("visible") || reloadReason.includes("manual") || reloadReason.includes("delete") || (nowMs - Number(holdTicketsLastFullSnapshotAtMs || 0) > 10 * 60 * 1000);
        const payload = {
          warehouse: getWarehouse(),
          reason,
          device_id: getDeviceId(),
          device_kind: getClientDeviceKind(),
          active_only: false,
          limit: 1000,
          cache_bust: forceMineFresh,
          mine_owner_email: forceMineFresh ? getCurrentOperatorEmail() : ""
        };
        if (!needsFullSnapshot && !forceMineFresh) payload.since_updated_at_ms = holdTicketsLastServerUpdatedAtMs;
        const res = await apiPost("/api/hold/tickets/list", payload);
        const todayKey = getHoldDateKey();
        const tickets = (Array.isArray(res.items) ? res.items : (res.tickets || []))
          .map(t => ({ id: t.id || t.ticket_id || t.ticket_no || "", ...t }))
          .filter(t => !t.date_key || String(t.date_key) === todayKey)
          .sort(compareTicketDriverSequenceAsc);
        if (res.delta) {
          cacheHoldTickets(tickets);
        } else {
          holdTicketsLastFullSnapshotAtMs = Date.now();
          replaceHoldTicketCacheForToday(tickets);
          const nowSnapshotMs = Date.now();
          tickets.forEach(t => {
            if (String(t.status || t.workflow_status || "").toUpperCase() === "HOLD") {
              const created = Number(t.created_at_ms || 0);
              if (created > 0 && (nowSnapshotMs - created) < 35000 && !alertedOrderTicketIds.has(String(t.id || t.ticket_id || t.ticket_no))) {
                handleIncomingOrderAlert(t);
              }
            }
          });
        }
        holdTicketsLastSignature = getHoldTicketsSignature(getTodayHoldTicketsFromCache(true));
        try {
          window.__VNWL_D1_LISTENER_SEED = window.__VNWL_D1_LISTENER_SEED || {};
          window.__VNWL_D1_LISTENER_SEED[getHoldTicketsCollectionName()] = { docs: getTodayHoldTicketsFromCache(true), at_ms: Date.now() };
        } catch (_) {}
        if (document.getElementById("pageHandover")?.classList.contains("active")) {
          scheduleRenderActiveHoldTicketsFromCache(reason || "server_snapshot", 80);
          const activeCount = getTodayHoldTicketsFromCache(false).length;
          if (!isHoldSearchUiFrozen()) {
            setHandoverMessage("Đã đồng bộ snapshot chuẩn từ Server: " + activeCount + " phiếu HOLD đang mở. PC/Mobile không cần reload.", activeCount ? "green" : "red");
          }
        }
        mergeHoldTicketsIntoRiderOverview(tickets, { pushToCloud: false, reason });
        startHoldTicketsStrictSafetyPoll();
        return tickets;
      } catch (error) {
        console.warn("Force reload HOLD tickets warning:", error);
        throw error;
      }
      })();
      try {
        return await holdTicketsServerReloadPromise;
      } finally {
        holdTicketsServerReloadPromise = null;
      }
    }

    async function autoClaimNextHoldTicket() {
      if (holdTicketBusy) return;
      holdTicketBusy = true;
      updateHoldButtons();
      try {
        setHandoverMessage("Đang nhận phiếu tự động theo STT nhỏ nhất từ Server...");
        const res = await apiPost("/api/hold/claim_next", {
          warehouse: getWarehouse(),
          limit: 1,
          mode: "AUTO_RECEIVE",
          device_id: getDeviceId(),
          device_kind: getClientDeviceKind()
        });
        const ticket = (Array.isArray(res.items) ? res.items[0] : null) || (Array.isArray(res.tickets) ? res.tickets[0] : null);
        if (!ticket) {
          await forceReloadTodayHoldTicketsFromServer("auto_claim_empty").catch(() => undefined);
          setHandoverMessage("Không còn phiếu HOLD chờ nhận.", "red");
          playSound("error");
          return;
        }
        const updated = upsertHoldTicketCache(ticket);
        currentHoldTicket = updated;
        holdMineFilterActive = true;
        holdWaitingFilterActive = false;
        try { localStorage.setItem(VNWL_HOLD_FILTER_KEY_V4, "mine"); } catch (_) {}
        updateHoldMineFilterButtonUi();
        await forceReloadTodayHoldTicketsFromServer("auto_claim_success").catch(() => renderActiveHoldTicketsFromCache());
        vnwlSafeToast("Đã nhận phiếu tự động", (updated.ticket_no || updated.id) + " · " + getClientDeviceKind(), "ok", 7000);
        setHandoverMessage("Đã nhận phiếu " + (updated.ticket_no || updated.id) + " theo STT Server. Tiếp theo scan BOX/rổ để đi pick.", "green");
        openHoldBoxModal(updated);
        playSound("success");
      } catch (error) {
        const message = error?.payload?.message || error.message || String(error);
        setHandoverMessage("Lỗi nhận phiếu tự động: " + message, "red");
        playSound("error");
      } finally {
        holdTicketBusy = false;
        updateHoldButtons();
      }
    }

    function buildSortingBatchFromTickets(rawTickets, batchId) {
      const tickets = (rawTickets || []).map(normalizeHoldTicketNoDuplicateItems).sort(compareTicketDriverSequenceAsc);
      const items = [];
      tickets.forEach((ticket, ticketIndex) => {
        const ticketItems = Array.isArray(ticket.items) ? sortHandoverItemsByPickSequence(ticket.items.map((item, index) => ({ ...item, valid:true, status:"NO_RIDER", __original_index:index }))) : [];
        ticketItems.forEach((item, localIndex) => {
          items.push({
            ...item,
            id: item.id || item.order_id || safeOrderId(item.order_code || ""),
            source_ticket_id: ticket.id || ticket.ticket_id || ticket.ticket_no || "",
            source_ticket_no: ticket.ticket_no || ticket.id || "-",
            source_ticket_index: ticketIndex,
            source_item_index: localIndex,
            expected_box_code: normalizeHoldBoxCode(ticket.box_code || ""),
            sorting_box_confirmed: false,
            scanned: false,
            valid: true,
            status: "NO_RIDER"
          });
        });
      });
      return { id: batchId, batch_id: batchId, tickets, items: sortHandoverItemsByPickSequence(items), created_at_ms: Date.now() };
    }

    function isTicketInSortingPickStage(ticket) {
      const status = String(ticket?.status || ticket?.workflow_status || "").toUpperCase();
      return ["RECEIVED", "BOX_ASSIGNED"].includes(status) && isHoldOwnedByThisDevice(ticket);
    }

    function getSortingGroupKey(ticket) {
      return clean(ticket?.claim_batch_id || ticket?.sorting_batch_id || "");
    }

    function getOwnedSortingTicketsFromCache(anchorTicketId = "") {
      const anchor = anchorTicketId ? getCachedHoldTicket(anchorTicketId) : null;
      const groupKey = anchor ? getSortingGroupKey(anchor) : "";
      let list = getTodayHoldTicketsFromCache(false).filter(isTicketInSortingPickStage);
      if (groupKey) list = list.filter(t => getSortingGroupKey(t) === groupKey || String(t.id || t.ticket_id || t.ticket_no || "") === String(anchorTicketId || ""));
      else {
        const sortingClaimed = list.filter(t => String(t.claim_mode || "").toUpperCase() === "SORTING_BATCH" || !!getSortingGroupKey(t));
        if (sortingClaimed.length) list = sortingClaimed;
        else if (anchorTicketId) list = list.filter(t => String(t.id || t.ticket_id || t.ticket_no || "") === String(anchorTicketId));
      }
      return list.sort(compareTicketDriverSequenceAsc).slice(0, 3);
    }

    function openSortingBatchFromTickets(tickets, batchId = "") {
      const list = (tickets || []).map(normalizeHoldTicketNoDuplicateItems).filter(isTicketInSortingPickStage);
      if (!list.length) {
        setHandoverMessage("Không có phiếu đã nhận trên thiết bị này để mở Sorting while picking.", "red");
        playSound("error");
        return false;
      }
      list.forEach(upsertHoldTicketCache);
      const resolvedBatchId = batchId || getSortingGroupKey(list[0]) || ("SORTING_LOCAL_" + Date.now());
      currentSortingBatch = buildSortingBatchFromTickets(list, resolvedBatchId);
      openSortingPickModal();
      setHandoverMessage("Đã mở Sorting while picking cho " + list.length + " phiếu. Scan/gắn BOX ngay trong modal, không chuyển dropdown.", "green");
      return true;
    }

    async function openSortingFromHoldTicket(ticketId) {
      try {
        const ticket = await readHoldTicket(ticketId);
        upsertHoldTicketCache(ticket);
        const tickets = getOwnedSortingTicketsFromCache(ticketId);
        if (!openSortingBatchFromTickets(tickets.length ? tickets : [ticket], getSortingGroupKey(ticket))) return;
      } catch (error) {
        setHandoverMessage("Lỗi mở Sorting cho phiếu: " + (error.message || error), "red");
        playSound("error");
      }
    }

    async function startSortingWhilePicking() {
      const existingTickets = getOwnedSortingTicketsFromCache();
      if (existingTickets.length && openSortingBatchFromTickets(existingTickets, getSortingGroupKey(existingTickets[0]))) return;
      if (holdTicketBusy) return;
      holdTicketBusy = true;
      updateHoldButtons();
      try {
        setHandoverMessage("Đang nhận tối đa 3 phiếu chờ nhận theo STT cho Sorting while picking...");
        const res = await apiPost("/api/hold/claim_next", {
          warehouse: getWarehouse(),
          limit: 3,
          mode: "SORTING_BATCH",
          device_id: getDeviceId(),
          device_kind: getClientDeviceKind()
        });
        const tickets = Array.isArray(res.items) ? res.items : (res.tickets || []);
        if (!tickets.length) {
          await forceReloadTodayHoldTicketsFromServer("sorting_empty").catch(() => undefined);
          setHandoverMessage("Không còn phiếu HOLD chờ nhận để sorting.", "red");
          playSound("error");
          return;
        }
        tickets.forEach(upsertHoldTicketCache);
        currentSortingBatch = buildSortingBatchFromTickets(tickets, res.batch_id || ("SORTING_" + Date.now()));
        // V2.0.15 MOBILE STRICT: mở modal Sorting NGAY sau khi claim.
        // Không chờ snapshot/reconcile vì mobile có thể thấy card nhưng modal không bật, gây hiểu nhầm là đang chuyển filter.
        updateHoldMineFilterButtonUi();
        renderActiveHoldTicketsFromCache();
        openSortingPickModal();
        setTimeout(() => forceShowSortingPickModal("sorting_claim_success_mobile_guard"), 350);
        forceReloadTodayHoldTicketsFromServer("sorting_claim_success_background").catch(() => renderActiveHoldTicketsFromCache());
        vnwlSafeToast("Sorting while picking", "Đã nhận " + tickets.length + " phiếu theo STT nhỏ nhất. Popup Sorting đã mở.", "ok", 8000);
        playSound("success");
      } catch (error) {
        const message = error?.payload?.message || error.message || String(error);
        setHandoverMessage("Lỗi Sorting while picking: " + message, "red");
        playSound("error");
      } finally {
        holdTicketBusy = false;
        updateHoldButtons();
      }
    }

    function setSortingPickMessage(text, color = "") {
      const el = document.getElementById("sortingPickMessage");
      if (!el) return;
      el.textContent = text || "";
      el.className = "message" + (color ? " " + color : "");
    }

    function vnwlIsMobileViewport() {
      return (window.matchMedia && window.matchMedia("(max-width: 720px)").matches) || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
    }

    function forceShowSortingPickModal(reason = "") {
      const modal = document.getElementById("sortingPickModal");
      if (!modal) return;
      modal.classList.add("show");
      modal.setAttribute("aria-hidden", "false");
      modal.style.display = "flex";
      modal.style.visibility = "visible";
      modal.style.opacity = "1";
      modal.style.pointerEvents = "auto";
      modal.style.zIndex = "2147483600";
      document.body?.classList?.add("vnwl-sorting-modal-open");
      try { modal.scrollTop = 0; modal.querySelector(".sorting-modal-box")?.scrollTo({ top: 0, left: 0, behavior: "instant" }); } catch (_) {}
      if (!vnwlIsMobileViewport()) {
        setTimeout(() => document.querySelector("#sortingPickModal input:not([disabled])")?.focus(), 120);
      }
      if (reason) console.log("VNWL sorting modal forced open:", reason);
    }

    function openSortingPickModal() {
      renderSortingPickModal();
      forceShowSortingPickModal("openSortingPickModal");
      requestAnimationFrame(() => forceShowSortingPickModal("raf1"));
      setTimeout(() => forceShowSortingPickModal("timer150"), 150);
    }

    function closeSortingPickModal() {
      const modal = document.getElementById("sortingPickModal");
      if (modal) {
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
        modal.style.display = "";
        modal.style.visibility = "";
        modal.style.opacity = "";
        modal.style.pointerEvents = "";
        modal.style.zIndex = "";
      }
      document.body?.classList?.remove("vnwl-sorting-modal-open");
    }

    function renderSortingPickModal() {
      const info = document.getElementById("sortingPickBatchInfo");
      const ticketBox = document.getElementById("sortingTicketBoxList");
      const tbody = document.getElementById("sortingPickTableBody");
      const finishBtn = document.getElementById("btnFinishSortingPick");
      if (!currentSortingBatch) {
        if (info) info.textContent = "Chưa có batch sorting.";
        if (ticketBox) ticketBox.innerHTML = "";
        if (tbody) tbody.innerHTML = `<tr><td colspan="7">Chưa có batch sorting.</td></tr>`;
        if (finishBtn) finishBtn.disabled = true;
        return;
      }
      const tickets = currentSortingBatch.tickets || [];
      const items = currentSortingBatch.items || [];
      const confirmedCount = items.filter(i => i.sorting_box_confirmed).length;
      const allBoxesReady = tickets.length && tickets.every(t => !!normalizeHoldBoxCode(t.box_code || ""));
      const allItemsReady = items.length && confirmedCount === items.length;
      if (info) info.textContent = "Batch " + currentSortingBatch.batch_id + " · " + tickets.length + " phiếu · " + items.length + " đơn · Xác nhận rổ " + confirmedCount + "/" + items.length;
      if (ticketBox) {
        ticketBox.innerHTML = tickets.map((ticket, index) => {
          const box = normalizeHoldBoxCode(ticket.box_code || "");
          return `<div class="sorting-ticket-card ${box ? "sorting-ok" : ""}">
            <div class="sorting-ticket-title">${index + 1}. ${escapeHtml(ticket.ticket_no || ticket.id || "-")} · ${Number(ticket.order_count || ticket.items?.length || 0)} đơn</div>
            <div class="sorting-box-scan-row">
              <input id="sortingTicketBox_${index}" data-sorting-ticket-box-index="${index}" value="${escapeHtml(box)}" placeholder="Scan rổ/BOX cho phiếu này">
              <button class="btn-camera sorting-camera-mini" type="button" data-camera-sorting-ticket-box="${index}">📷</button>
              <button class="btn-blue" type="button" data-confirm-sorting-ticket-box="${index}">📦 Gắn rổ/BOX</button>
            </div>
          </div>`;
        }).join("");
      }
      if (tbody) {
        tbody.innerHTML = items.map((item, index) => {
          const expected = normalizeHoldBoxCode((tickets[item.source_ticket_index] || {}).box_code || item.expected_box_code || "");
          item.expected_box_code = expected;
          const rowClass = item.sorting_box_confirmed ? "sorting-ok" : "";
          return `<tr class="${rowClass}">
            <td><b>${index + 1}</b></td>
            <td>${escapeHtml(item.source_ticket_no || "-")}</td>
            <td>${escapeHtml(item.location_code || "-")} / ${escapeHtml(item.sub_code || item.sub || "-")}</td>
            <td><b>${escapeHtml(item.order_code || "-")}</b></td>
            <td>${escapeHtml(expected || "Chưa gắn rổ")}</td>
            <td><div class="sorting-item-box-cell"><input class="sorting-item-box-input" id="sortingItemBox_${index}" data-sorting-item-index="${index}" placeholder="Scan rổ" ${expected ? "" : "disabled"}><button class="btn-camera sorting-camera-mini" type="button" data-camera-sorting-item-box="${index}" ${expected ? "" : "disabled"}>📷</button></div></td>
            <td>${item.sorting_box_confirmed ? "✅ Ting" : `<button class="sorting-small-btn" type="button" data-confirm-sorting-item="${index}" ${expected ? "" : "disabled"}>Scan</button>`}</td>
          </tr>`;
        }).join("") || `<tr><td colspan="7">Batch chưa có đơn.</td></tr>`;
      }
      if (finishBtn) finishBtn.disabled = !(allBoxesReady && allItemsReady);
    }

    async function confirmSortingTicketBox(index) {
      if (!currentSortingBatch) return;
      const i = Number(index);
      const ticket = currentSortingBatch.tickets?.[i];
      const input = document.getElementById("sortingTicketBox_" + i);
      const boxCode = normalizeHoldBoxCode(input?.value || "");
      if (!ticket || !boxCode) { setSortingPickMessage("Vui lòng scan mã rổ/BOX cho phiếu.", "red"); playSound("error"); input?.focus(); return; }
      try {
        setSortingPickMessage("Đang gắn rổ " + boxCode + " cho phiếu " + (ticket.ticket_no || ticket.id) + "...");
        const nowMs = Date.now();
        const operator = getCurrentOperatorEmail();
        const activityLog = appendHoldActivityLog(ticket, "BOX_ASSIGN", operator, "Sorting batch gắn rổ/BOX " + boxCode + ".", nowMs);
        const result = await apiPost("/api/hold/claim_box", { warehouse: getWarehouse(), ticket_id: ticket.id, box_code: boxCode, activity_log: activityLog, device_id: getDeviceId(), device_kind: getClientDeviceKind(), sorting_batch_id: currentSortingBatch.batch_id });
        const updated = upsertHoldTicketCache(result.ticket || result.item || { ...ticket, status:"BOX_ASSIGNED", workflow_status:"BOX_ASSIGNED", box_code:boxCode, box_assigned_at_ms:nowMs, box_assigned_by:operator, activity_log:activityLog });
        currentSortingBatch.tickets[i] = updated;
        currentSortingBatch.items.forEach(item => { if (item.source_ticket_id === (ticket.id || ticket.ticket_id || ticket.ticket_no)) item.expected_box_code = boxCode; });
        setSortingPickMessage("Đã gắn rổ " + boxCode + " cho phiếu " + (updated.ticket_no || updated.id) + ".", "green");
        playSound("success");
        renderSortingPickModal();
        await forceReloadTodayHoldTicketsFromServer("sorting_box_assigned").catch(() => undefined);
      } catch (error) {
        const message = error?.payload?.message || error.message || String(error);
        setSortingPickMessage("Lỗi gắn rổ/BOX: " + message, "red");
        playSound("error");
        input?.select();
      }
    }

    function confirmSortingItemBox(index) {
      if (!currentSortingBatch) return;
      const i = Number(index);
      const item = currentSortingBatch.items?.[i];
      const input = document.getElementById("sortingItemBox_" + i);
      const scanned = normalizeHoldBoxCode(input?.value || "");
      const expected = normalizeHoldBoxCode(item?.expected_box_code || "");
      if (!item || !expected) { setSortingPickMessage("Đơn này chưa có rổ/BOX đúng để xác nhận.", "red"); playSound("error"); return; }
      if (!scanned) { setSortingPickMessage("Vui lòng scan rổ trước khi bỏ đơn " + (item.order_code || "-") + ".", "red"); playSound("error"); input?.focus(); return; }
      if (scanned !== expected) {
        setSortingPickMessage("È: sai rổ. Đơn " + (item.order_code || "-") + " phải bỏ vào " + expected + ", bạn scan " + scanned + ".", "red");
        playSound("error");
        input?.select();
        return;
      }
      item.sorting_box_confirmed = true;
      setSortingPickMessage("Ting: đúng rổ " + expected + " cho đơn " + (item.order_code || "-") + ".", "green");
      playSound("scan");
      renderSortingPickModal();
      setTimeout(() => document.querySelector("#sortingPickTableBody input:not([disabled])")?.focus(), 80);
    }

    function handleSortingPickModalAction(e) {
      if (e.target?.id === "sortingPickModal") { closeSortingPickModal(); return; }
      const ticketCameraBtn = e.target.closest?.("[data-camera-sorting-ticket-box]");
      if (ticketCameraBtn) {
        e.preventDefault?.();
        e.stopPropagation?.();
        cameraSortingTarget = { type: "ticket", index: Number(ticketCameraBtn.dataset.cameraSortingTicketBox) };
        openCameraScanner("sorting_ticket_box");
        return;
      }
      const itemCameraBtn = e.target.closest?.("[data-camera-sorting-item-box]");
      if (itemCameraBtn) {
        e.preventDefault?.();
        e.stopPropagation?.();
        cameraSortingTarget = { type: "item", index: Number(itemCameraBtn.dataset.cameraSortingItemBox) };
        openCameraScanner("sorting_item_box");
        return;
      }
      const ticketBtn = e.target.closest?.("[data-confirm-sorting-ticket-box]");
      if (ticketBtn) { confirmSortingTicketBox(ticketBtn.dataset.confirmSortingTicketBox); return; }
      const itemBtn = e.target.closest?.("[data-confirm-sorting-item]");
      if (itemBtn) { confirmSortingItemBox(itemBtn.dataset.confirmSortingItem); return; }
      const input = e.target.closest?.("input[data-sorting-ticket-box-index], input[data-sorting-item-index]");
      if (input && e.type === "keydown" && e.key === "Enter") {
        e.preventDefault();
        if (input.dataset.sortingTicketBoxIndex !== undefined) confirmSortingTicketBox(input.dataset.sortingTicketBoxIndex);
        if (input.dataset.sortingItemIndex !== undefined) confirmSortingItemBox(input.dataset.sortingItemIndex);
      }
    }

    async function finishSortingBatchPick() {
      if (!currentSortingBatch) return;
      const tickets = currentSortingBatch.tickets || [];
      const items = currentSortingBatch.items || [];
      const missingBox = tickets.find(t => !normalizeHoldBoxCode(t.box_code || ""));
      if (missingBox) { setSortingPickMessage("Chưa gắn rổ/BOX cho phiếu " + (missingBox.ticket_no || missingBox.id) + ".", "red"); playSound("error"); return; }
      const missingItem = items.find(i => !i.sorting_box_confirmed);
      if (missingItem) { setSortingPickMessage("Chưa scan rổ xác nhận cho đơn " + (missingItem.order_code || "-") + ".", "red"); playSound("error"); return; }
      try {
        setSortingPickMessage("Đang chuyển " + tickets.length + " phiếu sang Đã pick và mở scan bàn giao...", "green");
        const operator = getCurrentOperatorEmail();
        const nowMs = Date.now();
        const updatedTickets = [];
        for (const ticket of tickets) {
          const activityLog = appendHoldActivityLog(ticket, "PICKED", operator, "Hoàn tất Sorting while picking; tất cả đơn đã scan đúng rổ.", nowMs);
          await updateDoc(getHoldTicketRef(ticket.id), {
            status: "PICKED",
            workflow_status: "PICKED",
            display_status: "Vui lòng vào lấy hàng",
            picked_at: serverTimestamp(),
            picked_at_ms: nowMs,
            updated_at: serverTimestamp(),
            updated_at_ms: nowMs,
            picked_by: operator,
            operator,
            operator_email: operator,
            last_operator: operator,
            last_operation: "PICKED",
            last_operation_at: serverTimestamp(),
            last_operation_at_ms: nowMs,
            picked_device_id: getDeviceId(),
            sorting_batch_id: currentSortingBatch.batch_id,
            activity_log: activityLog
          });
          const updated = upsertHoldTicketCache({ ...ticket, status:"PICKED", workflow_status:"PICKED", picked_at_ms:nowMs, updated_at_ms:nowMs, picked_by:operator, operator, operator_email:operator, last_operator:operator, last_operation:"PICKED", last_operation_at_ms:nowMs, picked_device_id:getDeviceId(), sorting_batch_id: currentSortingBatch.batch_id, activity_log:activityLog });
          updatedTickets.push(updated);
          await pushHoldTicketStageToRiderOverview(updated, "PICKED");
        }
        currentSortingBatch.tickets = updatedTickets;
        currentHoldTicket = {
          id: currentSortingBatch.batch_id,
          ticket_no: "SORTING " + updatedTickets.map(t => String(t.seq || getTicketSequenceNumber(t))).join("+"),
          is_sorting_batch: true,
          source_tickets: updatedTickets,
          warehouse_code: getWarehouse(),
          status: "PICKED",
          workflow_status: "PICKED",
          driver_name: "Sorting batch",
          items
        };
        handoverItems = items.map((item, index) => ({
          ...item,
          seq: index + 1,
          id: item.id || item.order_id || safeOrderId(item.order_code || ""),
          suffix: item.suffix || String(item.order_code || "").slice(-5),
          scanned: false,
          valid: true,
          status: "NO_RIDER",
          note: "Sorting batch " + currentSortingBatch.batch_id + " · phiếu " + (item.source_ticket_no || "-") + " · rổ " + (item.expected_box_code || "-")
        }));
        handoverItems = sortHandoverItemsByPickSequence(dedupeHandoverItemsByOrderCode(handoverItems).items);
        renderHandoverItems();
        updateHandoverStats();
        closeSortingPickModal();
        openModal();
        setHandoverMessage("Đã hoàn tất Sorting while picking. Đang mở scan bàn giao tổng " + handoverItems.length + " đơn từ " + updatedTickets.length + " phiếu.", "green");
        playSound("success");
        await forceReloadTodayHoldTicketsFromServer("sorting_picked_done").catch(() => undefined);
      } catch (error) {
        const message = error?.payload?.message || error.message || String(error);
        setSortingPickMessage("Lỗi hoàn tất sorting: " + message, "red");
        playSound("error");
      }
    }


    async function createHoldTicketFromCurrentSession() {
      if (holdTicketBusy) return;
      const items = getHoldValidItems();
      const driverName = clean(document.getElementById("holdDriverName")?.value || "");

      if (!driverName) {
        setHandoverMessage("Vui lòng nhập tên tài xế trước khi HOLD.", "red");
        document.getElementById("holdDriverName")?.focus();
        playSound("error");
        return;
      }
      if (!items.length) {
        setHandoverMessage("Không có đơn hợp lệ để tạo phiếu HOLD. Hãy check location trước.", "red");
        playSound("error");
        return;
      }

      const duplicateInSession = findDuplicateOrderCodesInItems(items);
      if (duplicateInSession.length) {
        setHandoverMessage("Không tạo HOLD: trùng mã đơn trong cùng phiếu: " + duplicateInSession.slice(0, 5).join(", ") + (duplicateInSession.length > 5 ? "..." : ""), "red");
        playSound("error");
        return;
      }
      const uniqueItems = dedupeHandoverItemsByOrderCode(items).items;

      holdTicketBusy = true;
      updateHoldButtons();
      setHandoverMessage("Đang tạo phiếu HOLD tối ưu quota...");

      try {
        const now = new Date();
        const nowMs = Date.now();
        const dateKey = getHoldDateKey(now);

        await ensureTodayHoldTicketsCachedForDuplicateCheck(dateKey);
        const duplicateItems = findDuplicateHoldItems(uniqueItems);
        if (duplicateItems.length) {
          const msg = duplicateItems.slice(0, 5).map(x => x.code + " / " + x.ticket_no).join(", ");
          setHandoverMessage("Không tạo HOLD trùng. Đơn đã nằm trong phiếu HOLD đang mở: " + msg + (duplicateItems.length > 5 ? "..." : ""), "red");
          playSound("error");
          return;
        }

        // V1.9.4: HOLD và bàn giao trực tiếp dùng CHUNG counter D1 atomic.
        // Không dùng counter document riêng tại browser, tránh trùng mã phiếu khi nhiều máy thao tác.
        const allocated = await allocateDailyTicketNumber(nowMs, "hold_ticket_shared_sequence");
        const nextSeq = Number(allocated.seq || 0);
        const ticketNo = allocated.ticketNo;
        const ticketId = allocated.ticketId;
        const ticketRef = getHoldTicketRef(ticketId);

        const ticketItems = uniqueItems.map((item, index) => ({
          seq: index + 1,
          id: item.id,
          order_id: item.id,
          order_code: item.order_code || "",
          warehouse_code: item.warehouse_code || getWarehouse(),
          location_code: item.location_code || "",
          sub_code: item.sub_code || item.sub || "",
          suffix: item.suffix || "",
          status: "NO_RIDER"
        }));

        const createdTicket = {
          id: ticketId,
          ticket_no: ticketNo,
          date_key: allocated.dateKey,
          seq: nextSeq,
          warehouse_code: getWarehouse(),
          driver_name: driverName,
          status: "HOLD",
          workflow_status: "HOLD",
          display_status: "Phiếu đang xử lý",
          operator: "",
          operator_email: "",
          last_operator: "",
          last_operation: "CREATE_HOLD",
          last_operation_at: serverTimestamp(),
          last_operation_at_ms: nowMs,
          activity_log: [buildHoldActivityEntry("CREATE_HOLD", auth.currentUser?.email || "-", "Phiếu được tạo và đang chờ nhân viên nhận phiếu.", nowMs)],
          order_count: ticketItems.length,
          order_ids: ticketItems.map(i => i.id),
          order_codes: ticketItems.map(i => i.order_code),
          items: ticketItems,
          created_at: serverTimestamp(),
          created_at_ms: nowMs,
          updated_at: serverTimestamp(),
          updated_at_ms: nowMs,
          created_by: auth.currentUser?.email || "",
          device_id: getDeviceId(),
          code_version: CODE_VERSION,
          quota_note: "Shared atomic ticket sequence; HOLD writes one ticket document only"
        };

        await setDoc(ticketRef, createdTicket);

        currentHoldTicket = upsertHoldTicketCache({
          ...createdTicket,
          created_at: now,
          updated_at: now
        });
        renderActiveHoldTicketsFromCache();
        clearHandoverWorkAreaAfterHold();
        if (isHandoverModalOpen()) closeModal();
        await pushHoldTicketStageToRiderOverview(currentHoldTicket, "HOLD");
        showVnwlToast("Đã tạo phiếu HOLD", (currentHoldTicket.ticket_no || currentHoldTicket.id) + " — Rider Overview: Phiếu đang xử lý", "ok", 8000);
        setHandoverMessage("Đã tạo phiếu HOLD " + currentHoldTicket.ticket_no + " gồm " + currentHoldTicket.order_count + " đơn. Phiếu đã tự hiện trong View HOLD và Rider Overview, không cần refresh. Đã xóa danh sách check location hiện tại để tránh tạo HOLD trùng.", "green");
        playSound("success");
        forceReloadTodayHoldTicketsFromServer("hold_created_local_confirm").catch(() => undefined);
      } catch (error) {
        console.error(error);
        setHandoverMessage("Lỗi tạo phiếu HOLD: " + (error.message || error), "red");
        playSound("error");
      } finally {
        holdTicketBusy = false;
        updateHoldButtons();
      }
    }

    function getHoldTicketOperator(ticket) {
      const rawStatus = String(ticket?.status || "").toUpperCase();
      const rawWorkflow = String(ticket?.workflow_status || "").toUpperCase();
      const knownStatuses = ["RECEIVED", "BOX_ASSIGNED", "CLAIMED", "IN_PICK", "PICKED", "READY_PICK", "READY_TO_PICK", "WAITING_RECEIVE", "HANDED_OVER", "DELIVERED", "NOT_DONE", "WAITING_PICKUP_DONE", "DONE", "COMPLETED", "PICKUP_DONE", "HOLD"];
      const stage = ["CANCELLED", "CANCELED", "DELETED", "REMOVED"].includes(rawStatus) || ["CANCELLED", "CANCELED", "DELETED", "REMOVED"].includes(rawWorkflow) || ticket?.cancelled_at_ms || ticket?.deleted_at_ms
        ? "CANCELLED"
        : (knownStatuses.includes(rawStatus) ? rawStatus : (rawWorkflow || rawStatus || "HOLD"));
      let candidates = [];
      if (["HANDED_OVER", "DONE", "COMPLETED"].includes(stage)) {
        candidates = [ticket?.handed_over_by, ticket?.handover_by, ticket?.last_operator, ticket?.operator, ticket?.operator_email];
      } else if (["PICKED", "READY_PICK", "READY_TO_PICK", "WAITING_RECEIVE"].includes(stage)) {
        candidates = [ticket?.picked_by, ticket?.last_operator, ticket?.operator, ticket?.operator_email];
      } else if (["RECEIVED", "BOX_ASSIGNED", "CLAIMED", "IN_PICK"].includes(stage)) {
        candidates = [ticket?.box_assigned_by, ticket?.received_by, ticket?.last_operator, ticket?.operator, ticket?.operator_email];
      } else if (["CANCELLED", "CANCELED", "DELETED", "REMOVED"].includes(stage)) {
        candidates = [ticket?.cancelled_by, ticket?.canceled_by, ticket?.deleted_by, ticket?.last_operator, ticket?.operator, ticket?.operator_email];
      } else {
        candidates = [];
      }
      for (const raw of candidates) {
        const value = clean(raw || "");
        if (value) return value;
      }
      return "-";
    }

    function getOpenHoldDetailIds() {
      const box = document.getElementById("holdTicketList");
      if (!box) return new Set();
      return new Set(Array.from(box.querySelectorAll("details.hold-ticket-detail[open][data-ticket-id]")).map(el => String(el.dataset.ticketId || "")).filter(Boolean));
    }

    function buildHoldTicketDetailHtml(ticket, forceOpen = false) {
      const rawItems = Array.isArray(ticket?.items) ? ticket.items : [];
      const items = sortHandoverItemsByPickSequence(rawItems.map((item, index) => ({ ...item, valid: true, status: "NO_RIDER", __original_index: index })));
      const rows = items.map((item, index) => `
        <tr>
          <td>${Number(index + 1)}</td>
          <td><b>${escapeHtml(item.order_code || "-")}</b></td>
          <td>${escapeHtml(item.location_code || "-")}</td>
          <td>${escapeHtml(getHoldTicketSubCode(item) || "-")}</td>
          <td>${escapeHtml(item.warehouse_code || ticket.warehouse_code || getWarehouse())}</td>
        </tr>
      `).join("");
      const ticketId = escapeHtml(ticket?.id || ticket?.ticket_id || ticket?.ticket_no || "");
      return `
        <details class="hold-ticket-detail" data-ticket-id="${ticketId}" ${forceOpen ? "open" : ""}>
          <summary>👁️ Xem phiếu / danh sách pick (${items.length} đơn)</summary>
          ${ticket.duplicate_removed_count ? `<div class="hold-duplicate-alert">⚠️ ${escapeHtml(ticket.duplicate_warning || "Đã ẩn mã trùng cũ để tránh bàn giao lặp.")}</div>` : ""}
          <table>
            <thead><tr><th>STT</th><th>Mã đơn</th><th>Location</th><th>Sub</th><th>Kho</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="5">Phiếu chưa có đơn.</td></tr>`}</tbody>
          </table>
          <div class="hold-ticket-note">Quy trình: <b>Nhận phiếu</b> → <b>Scan BOX hoặc Bỏ qua BOX</b> để đi pick → <b>Đã pick</b> → mở scan bàn giao. Nếu không dùng BOX, vẫn phải bấm Đã pick theo flow cũ.</div>
          ${renderHoldActivityLog(ticket)}
        </details>
      `;
    }

    function renderHoldTicketList(tickets, includeInactive = false) {
      const box = document.getElementById("holdTicketList");
      if (!box) return;
      if (!includeInactive && renderPinnedHoldSearchResultIfNeeded()) return;
      const inputList = Array.isArray(tickets) ? tickets.map(upsertHoldTicketCache) : [];
      if (includeInactive) holdSearchLastRenderedSignature = getHoldTicketsSignature(inputList);
      const openDetailIds = getOpenHoldDetailIds();
      cacheHoldTickets(inputList);
      const cacheList = getTodayHoldTicketsFromCache(includeInactive);
      // STRICT REALTIME: khi WS chỉ gửi 1 delta nhỏ, không được render HTML từ delta đó.
      // Luôn dùng cache đầy đủ cho View HOLD active để xóa/nhận/scan từ máy khác không làm mất toàn bộ danh sách.
      const sourceList = (!includeInactive && cacheList.length >= inputList.filter(isActiveHoldTicket).length) ? cacheList : inputList;
      const activeList = includeInactive ? sourceList : sourceList.filter(isActiveHoldTicket);
      let filteredList = activeList;
      if (!includeInactive && holdWaitingFilterActive) {
        filteredList = filteredList.filter(ticket => String(ticket?.status || "HOLD").toUpperCase() === "HOLD");
      }
      if (!includeInactive && holdMineFilterActive) {
        // VNWL: Phiếu đã nhận của tôi chỉ hiển thị phiếu còn cần bàn giao.
        // Phiếu đã bàn giao/hoàn tất được ẩn để tránh rối thao tác.
        filteredList = filteredList.filter(isHoldTicketMineAndStillNeedsHandover);
      }
      // V2.0.16: View HOLD PC/Mobile cho phép đổi sort STT; mặc định lớn → nhỏ.
      // Chỉ đổi thứ tự STT, không nhảy phiếu theo trạng thái.
      const list = filteredList.sort(getHoldSttComparator());
      updateHoldMineFilterButtonUi();
      updateHoldSortOrderButtonUi();
      if (!list.length) {
        box.innerHTML = holdMineFilterActive
          ? `<div class="hint">Tài khoản hiện tại chưa có phiếu đã nhận đang mở.</div>`
          : (holdWaitingFilterActive
              ? `<div class="hint">Không có phiếu CHỜ NHẬN.</div>`
              : `<div class="hint">Chưa có phiếu HOLD hôm nay.</div>`);
        return;
      }
      box.innerHTML = list.map(ticket => {
        const status = String(ticket.status || "HOLD").toUpperCase();
        const isOwnerDevice = isHoldOwnedByThisDevice(ticket);
        const canReceive = status === "HOLD";
        const canAssignBox = status === "RECEIVED" && isOwnerDevice;
        const canSkipBox = status === "RECEIVED" && isOwnerDevice && !normalizeHoldBoxCode(ticket.box_code || "");
        const isMine = isHoldReceivedByCurrentAccount(ticket);
        const canMarkPicked = status === "BOX_ASSIGNED" && isOwnerDevice;
        // V2.0.14: PC lễ tân hoặc thiết bị khác phải mở được scan bàn giao sau khi picker đã hoàn tất pick.
        // Không khóa theo owner device ở bước scan bàn giao; owner chỉ dùng cho bước scan BOX/Đã pick.
        const canOpenScan = status === "PICKED" && (!!normalizeHoldBoxCode(ticket.box_code || "") || !!ticket.box_skipped);
        const canOpenSorting = ["RECEIVED", "BOX_ASSIGNED"].includes(status) && isOwnerDevice;
        const canDelete = ["HOLD", "RECEIVED", "BOX_ASSIGNED", "PICKED", "WAITING_RECEIVE"].includes(status);
        const openLabel = "🚚 Mở scan bàn giao";
        return `
          <div class="hold-ticket-card">
            <div class="hold-ticket-head">
              <span>${escapeHtml(ticket.ticket_no || ticket.id || "-")} — ${escapeHtml(ticket.driver_name || "-")} — ${Number(ticket.order_count || ticket.items?.length || 0)} đơn</span>
              <span>${escapeHtml(getHoldStatusText(status))}</span>
            </div>
            <div class="hold-operator-line">STT ngày: <b>${String(ticket.seq || "-")}</b> · Kho: <b>${escapeHtml(ticket.warehouse_code || getWarehouse())}</b> · Operator: <b>${escapeHtml(getHoldTicketOperator(ticket))}</b>${ticket.box_code ? ` · BOX: <span class="hold-box-badge">${escapeHtml(ticket.box_code)}</span>` : (ticket.box_skipped ? ` · <span class="hold-box-badge">⏭️ Không dùng BOX</span>` : "")}${isOwnerDevice ? ` · <span class="vnwl-device-chip">${escapeHtml(getClientDeviceKind())} của tôi</span>` : (getHoldOwnerDeviceId(ticket) ? ` · <span class="vnwl-device-chip">Đang xử lý ở thiết bị khác</span>` : "")}</div>
            ${buildHoldTicketDetailHtml(ticket, openDetailIds.has(String(ticket.id || ticket.ticket_id || ticket.ticket_no || "")))}
            <div class="hold-ticket-actions">
              <button class="btn-green" data-print-rider-code="${escapeHtml(ticket.id)}">🏷️ In mã Rider</button>
              <button class="btn-dark" data-print-hold-ticket="${escapeHtml(ticket.id)}">🖨️ In phiếu</button>
              ${canReceive ? `<button class="btn-blue" data-receive-hold-ticket="${escapeHtml(ticket.id)}" style="background:#2563eb;color:#fff;font-weight:700">📦 Nhận đơn đi pick</button>` : ""}
              ${canOpenSorting ? `<button class="btn-orange" data-open-sorting-pick="${escapeHtml(ticket.id)}">🧺 Mở Sorting BOX</button>` : ""}
              ${canAssignBox ? `<button class="btn-blue" data-assign-hold-box="${escapeHtml(ticket.id)}">📦 Scan BOX đi pick</button>` : ""}
              ${canSkipBox ? `<button class="btn-gray" data-skip-hold-box="${escapeHtml(ticket.id)}">⏭️ Bỏ qua BOX</button>` : ""}
              ${canMarkPicked ? `<button class="btn-orange" data-mark-hold-picked="${escapeHtml(ticket.id)}" style="background:#ea580c;color:#fff;font-weight:700">✅ Đã pick</button>` : ""}
              ${canOpenScan ? `<button class="btn-blue" data-show-hold-qr="${escapeHtml(ticket.id)}">🔳 Mã QR phiếu</button>` : ""}
              ${canOpenScan ? `<button class="btn-green" data-open-hold-handover="${escapeHtml(ticket.id)}">${openLabel}</button>` : ""}
              ${canDelete ? `<button class="btn-red" data-delete-hold-ticket="${escapeHtml(ticket.id)}">🗑️ Xóa phiếu</button>` : ""}
            </div>
          </div>
        `;
      }).join("");
    }


    function getHoldTicketsSignature(tickets) {
      return (tickets || []).map(t => [
        t.id || t.ticket_id || t.ticket_no || "",
        t.status || "",
        t.workflow_status || "",
        t.updated_at_ms || "",
        t.received_by || "",
        t.picked_by || "",
        t.handed_over_by || "",
        t.operator || t.operator_email || "",
        t.box_code || "",
        t.order_count || (Array.isArray(t.items) ? t.items.length : 0)
      ].join("~")).join("|");
    }

    async function pollTodayHoldTicketsOnce(reason = "hold_auto_poll") {
      if (!db || holdTicketsPollBusy) return;
      holdTicketsPollBusy = true;
      try {
        const todayKey = getHoldDateKey();
        const q = query(collection(db, getHoldTicketsCollectionName()), where("date_key", "==", todayKey), limit(1000));
        const snap = await getDocs(q);
        const tickets = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort(compareTicketDriverSequenceAsc);
        const sig = getHoldTicketsSignature(tickets);
        if (sig !== holdTicketsLastSignature) {
          holdTicketsLastSignature = sig;
          replaceHoldTicketCacheForToday(tickets);
          if (isHandoverPageVisible()) scheduleRenderActiveHoldTicketsFromCache(reason || "hold_poll_delta", 120);
          mergeHoldTicketsIntoRiderOverview(tickets, { pushToCloud: false, reason });
          const activeCount = tickets.filter(isActiveHoldTicket).length;
          if (activeCount && !isHoldSearchUiFrozen()) setHandoverMessage("Đã tự đồng bộ " + activeCount + " phiếu HOLD từ máy khác.", "green");
        }
      } catch (e) {
        console.warn("HOLD ticket fallback poll warning:", e);
      } finally {
        holdTicketsPollBusy = false;
      }
    }

    function startHoldTicketsAutoRefresh() {
      // V1.4: tải một lần khi vào màn Bàn giao, sau đó listener nhận delta từ WebSocket.
      if (isHandoverPageVisible()) loadTodayHoldTickets();
    }


    async function loadTodayHoldTickets() {
      try {
        const todayKey = getHoldDateKey();
        if (holdTicketsLiveStarted) {
          renderActiveHoldTicketsFromCache();
          startHoldTicketsStrictSafetyPoll();
          scheduleHoldAuthoritativeReload("handover_live_resume_authoritative_snapshot", 0);
          setHandoverMessage("View phiếu HOLD đang live. Đang đối chiếu snapshot Server để PC/Mobile luôn giống nhau, không cần reload.", "green");
          return;
        }
        setHandoverMessage("Đang mở live View phiếu HOLD hôm nay và kéo snapshot chuẩn từ Server...");
        await forceReloadTodayHoldTicketsFromServer("handover_open_initial_authoritative_snapshot").catch(error => console.warn("Initial HOLD authoritative snapshot warning:", error));
        startHoldTicketsStrictSafetyPoll();
        const q = query(collection(db, getHoldTicketsCollectionName()), where("date_key", "==", todayKey), limit(1000));
        holdTicketsLiveStarted = true;
        holdTicketsUnsub = onSnapshot(q, snap => {
          const tickets = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => Number(b.created_at_ms || 0) - Number(a.created_at_ms || 0));
          holdTicketsLastSignature = getHoldTicketsSignature(tickets);
          replaceHoldTicketCacheForToday(tickets);
          if (isHandoverPageVisible()) scheduleRenderActiveHoldTicketsFromCache("hold_live_snapshot", 150);
          // V1.9: listener thụ động chỉ đồng bộ bộ nhớ; máy thực hiện thao tác mới ghi Rider Overview.
          mergeHoldTicketsIntoRiderOverview(tickets, { pushToCloud: false, reason: "hold_live_snapshot" });
          // V2.0.11: Firestore-compat listener có thể nhận delta theo cache cục bộ; đối chiếu lại route list chuẩn của Worker.
          scheduleHoldAuthoritativeReload("hold_live_snapshot_authoritative_check", 300);
          const activeCount = tickets.filter(isActiveHoldTicket).length;
          const hiddenCount = tickets.length - activeCount;
          if (!isHoldSearchUiFrozen()) {
            setHandoverMessage(
              activeCount
                ? "Đang live " + activeCount + " phiếu HOLD hôm nay. Phiếu xong/xóa sẽ tự biến mất, không cần refresh." + (hiddenCount ? " Đã ẩn " + hiddenCount + " phiếu đã xong/xóa." : "")
                : "Không còn phiếu HOLD đang mở hôm nay. Phiếu xong/xóa đã tự ẩn.",
              activeCount ? "green" : "red"
            );
          }
        }, error => {
          console.error(error);
          holdTicketsLiveStarted = false;
          holdTicketsUnsub = null;
          setHandoverMessage("Lỗi live View phiếu HOLD: " + (error.message || error), "red");
        });
      } catch (error) {
        console.error(error);
        setHandoverMessage("Lỗi tải phiếu HOLD: " + (error.message || error), "red");
      }
    }

    async function readHoldTicket(ticketId, options = {}) {
      const preferCache = options.preferCache !== false;
      const cached = preferCache ? getCachedHoldTicket(ticketId) : null;
      if (cached) return cached;
      const snap = await getDoc(getHoldTicketRef(ticketId));
      if (!snap.exists()) throw new Error("Không tìm thấy phiếu HOLD.");
      return upsertHoldTicketCache({ id: snap.id, ...snap.data() });
    }

    async function receiveHoldTicket(ticketId){
      if(!ticketId||holdTicketBusy)return;
      holdTicketBusy=true;updateHoldButtons();
      try{
        const result=await apiPost("/api/hold/claim_next",{warehouse:getWarehouse(),ticket_id:ticketId,mode:"DIRECT_RECEIVE",device_id:getDeviceId(),device_kind:getClientDeviceKind()});
        const ticket=result.ticket||result.items?.[0];
        if(!result.ok||!ticket||ticket.id!==ticketId)throw Error(result.error||"Không nhận được đúng phiếu đã chọn.");
        const updated=upsertHoldTicketCache(ticket);currentHoldTicket=updated;
        renderActiveHoldTicketsFromCache({force:true});
        openHoldBoxModal(updated);
        setHandoverMessage("Đã nhận phiếu "+(updated.ticket_no||updated.id)+". Scan BOX hoặc Bỏ qua BOX, sau đó bấm Đã pick.","green");
        playSound("success");
      }catch(error){setHandoverMessage("Lỗi nhận phiếu: "+(error.message||error),"red");playSound("error");}
      finally{holdTicketBusy=false;updateHoldButtons();}
    }

    async function markHoldTicketPicked(ticketId) {
      if (!ticketId) return;
      try {
        const cachedTicket = await readHoldTicket(ticketId);
        if (String(cachedTicket.status || "HOLD").toUpperCase() !== "BOX_ASSIGNED") {
          setHandoverMessage("Phiếu " + (cachedTicket.ticket_no || cachedTicket.id) + " chưa scan BOX hoặc chưa bấm Bỏ qua BOX.", "red");
          return;
        }
        if (!normalizeHoldBoxCode(cachedTicket.box_code || "") && !cachedTicket.box_skipped) {
          setHandoverMessage("Phiếu " + (cachedTicket.ticket_no || cachedTicket.id) + " chưa scan BOX hoặc chưa bấm Bỏ qua BOX.", "red");
          return;
        }
        const nowMs = Date.now();
        const operator = getCurrentOperatorEmail();
        const activityLog = appendHoldActivityLog(cachedTicket, "PICKED", operator, "Đã hoàn tất pick, chờ scan bàn giao.", nowMs);
        const result = await apiPost("/api/hold/mark_picked", {
          warehouse: getWarehouse(),
          ticket_id: ticketId,
          operator,
          activity_log: activityLog,
          device_id: getDeviceId(),
          device_kind: getClientDeviceKind()
        });
        if (!result?.ok || !result?.ticket) throw new Error(result?.error || result?.message || "Không xác nhận được Đã pick.");
        const updated = upsertHoldTicketCache(result.ticket);
        currentHoldTicket = updated;
        renderActiveHoldTicketsFromCache();
        await pushHoldTicketStageToRiderOverview(updated, "PICKED");
        if (typeof showVnwlToast === "function") showVnwlToast("Phiếu đã pick", (updated.ticket_no || updated.id) + " — Rider Overview: Vui lòng vào lấy hàng", "ok", 8000);
        setHandoverMessage("Đã pick phiếu " + (updated.ticket_no || updated.id) + ". Có thể mở scan bàn giao. View HOLD/Rider Overview tự cập nhật; không force reload để tiết kiệm quota.", "green");
        playSound("success");
      } catch (error) {
        console.error(error);
        setHandoverMessage("Lỗi xác nhận Đã pick: " + (error.message || error), "red");
        playSound("error");
      }
    }

    async function openHoldTicketForHandover(ticketId) {
      try {
        const rawTicket = await readHoldTicket(ticketId, { preferCache: false });
        const ticket = normalizeHoldTicketNoDuplicateItems(rawTicket);
        renderActiveHoldTicketsFromCache({ force: true });
        const ticketStatus = String(ticket.status || "HOLD").toUpperCase();
        if (["HANDED_OVER", "CANCELLED"].includes(ticketStatus)) {
          setHandoverMessage("Phiếu " + (ticket.ticket_no || ticket.id) + " đang là " + getHoldStatusText(ticket.status) + ", không thể mở scan.", "red");
          return;
        }
        if (ticketStatus !== "PICKED") {
          setHandoverMessage("Phiếu " + (ticket.ticket_no || ticket.id) + " chưa hoàn tất bước Đã pick, chưa mở scan bàn giao.", "red");
          return;
        }
        if (!normalizeHoldBoxCode(ticket.box_code || "") && !ticket.box_skipped) {
          setHandoverMessage("Phiếu " + (ticket.ticket_no || ticket.id) + " chưa scan BOX hoặc chưa bấm Bỏ qua BOX. Hãy xử lý bước BOX trước khi bàn giao.", "red");
          return;
        }
        currentHoldTicket = upsertHoldTicketCache(ticket);
        handoverItems = (ticket.items || []).map(item => ({
          ...item,
          id: item.id || item.order_id || safeOrderId(item.order_code || ""),
          suffix: item.suffix || String(item.order_code || "").slice(-5),
          scanned: false,
          valid: true,
          status: "NO_RIDER",
          sub_code: item.sub_code || item.sub || "",
          note: "Từ phiếu HOLD " + (ticket.ticket_no || ticket.id)
        }));
        handoverItems = sortHandoverItemsByPickSequence(dedupeHandoverItemsByOrderCode(handoverItems).items);
        renderHandoverItems();
        updateHandoverStats();
        updateHoldButtons();
        const total = getValidHandoverCount();
        ["scanInput", "btnScan", "btnCameraScanHandover", "btnOcrScanHandover"].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.disabled = total === 0;
        });
        if (total > 0) {
          openModal();
          setTimeout(() => document.getElementById("scanInput")?.focus(), 150);
          setHandoverMessage("Đã mở phiếu " + (ticket.ticket_no || ticket.id) + ". Đã kiểm tra trạng thái mới nhất. Scan đủ mới bàn giao thật.", "green");
        } else {
          setHandoverMessage("Phiếu không có đơn hợp lệ để scan.", "red");
        }
      } catch (error) {
        console.error(error);
        setHandoverMessage("Lỗi mở phiếu HOLD: " + (error.message || error), "red");
      }
    }

    async function deleteHoldTicket(ticketId) {
      if (!ticketId) return;
      try {
        const ticket = await readHoldTicket(ticketId);
        const status = String(ticket.status || "HOLD").toUpperCase();
        if (["HANDED_OVER", "CANCELLED", "DELETED"].includes(status)) {
          renderActiveHoldTicketsFromCache();
          setHandoverMessage("Phiếu " + (ticket.ticket_no || ticket.id) + " đã xong/xóa nên đã ẩn khỏi View HOLD.", "green");
          return;
        }
        if (!confirm("Xóa phiếu HOLD " + (ticket.ticket_no || ticket.id) + "?\n\nLưu ý: chỉ xóa/ẩn phiếu HOLD, không xóa đơn gốc trong Quản lý đơn hàng.")) return;
        const nowMs = Date.now();
        const operator = getCurrentOperatorEmail();
        const activityLog = appendHoldActivityLog(ticket, "CANCEL", operator, "Phiếu HOLD đã được xóa/hủy.", nowMs);
        const apiResult = await apiPost("/api/hold/cancel", {
          warehouse: getWarehouse(),
          ticket_id: ticketId,
          activity_log: activityLog,
          device_id: getDeviceId(),
          device_kind: getClientDeviceKind()
        });
        const cancelledTicket = upsertHoldTicketCache(apiResult.ticket || apiResult.item || { ...ticket, status: "CANCELLED", workflow_status: "CANCELLED", cancelled_at_ms: nowMs, updated_at_ms: nowMs, visible_until_ms: nowMs - 1, cancelled_by: operator, operator, operator_email: operator, last_operator: operator, activity_log: activityLog });
        renderActiveHoldTicketsFromCache();
        forceReloadTodayHoldTicketsFromServer("delete_hold_ticket_authoritative_reconcile").catch(() => renderActiveHoldTicketsFromCache());
        setHandoverMessage("Đã xóa/ẩn phiếu " + (ticket.ticket_no || ticket.id) + ". Rider Overview cũng đã ẩn phiếu này. Đơn gốc không bị xóa.", "green");
        playSound("success");
      } catch (error) {
        console.error(error);
        setHandoverMessage("Lỗi xóa phiếu HOLD: " + (error.message || error), "red");
        playSound("error");
      }
    }

    async function handleHoldTicketAction(e) {
      const riderPrintBtn = e.target.closest("[data-print-rider-code]");
      const printBtn = e.target.closest("[data-print-hold-ticket]");
      const receiveBtn = e.target.closest("[data-receive-hold-ticket]");
      const assignBoxBtn = e.target.closest("[data-assign-hold-box]");
      const skipBoxBtn = e.target.closest("[data-skip-hold-box]");
      const pickedBtn = e.target.closest("[data-mark-hold-picked]");
      const sortingBtn = e.target.closest("[data-open-sorting-pick]");
      const openBtn = e.target.closest("[data-open-hold-handover]");
      const qrBtn = e.target.closest("[data-show-hold-qr]");
      const deleteBtn = e.target.closest("[data-delete-hold-ticket]");

      if (riderPrintBtn || printBtn) {
        // V1.9.7: mở cửa sổ in ngay trong click để Mobile/Chrome không chặn popup sau await.
        const preparedWindow = openImmediatePrintWindow();
        if (!preparedWindow) return;
        const ticketId = riderPrintBtn ? riderPrintBtn.dataset.printRiderCode : printBtn.dataset.printHoldTicket;
        try {
          // Ưu tiên cache của View HOLD để in không phát sinh thêm read/quota.
          const ticket = getCachedHoldTicket(ticketId) || await readHoldTicket(ticketId);
          if (riderPrintBtn) printRiderCode(ticket, preparedWindow);
          else printHoldTicket(ticket, preparedWindow);
        } catch (error) {
          try { preparedWindow.close(); } catch (_) {}
          setHandoverMessage("Lỗi tải dữ liệu để in: " + (error.message || error), "red");
        }
        return;
      }
      if (receiveBtn) {
        await receiveHoldTicket(receiveBtn.dataset.receiveHoldTicket);
        return;
      }
      if (assignBoxBtn) {
        const ticket = await readHoldTicket(assignBoxBtn.dataset.assignHoldBox);
        openHoldBoxModal(ticket);
        return;
      }
      if (skipBoxBtn) {
        await skipBoxForPendingHoldTicket(skipBoxBtn.dataset.skipHoldBox);
        return;
      }
      if (pickedBtn) {
        await markHoldTicketPicked(pickedBtn.dataset.markHoldPicked);
        return;
      }
      if (sortingBtn) {
        await openSortingFromHoldTicket(sortingBtn.dataset.openSortingPick);
        return;
      }
      if (openBtn) {
        await openHoldTicketForHandover(openBtn.dataset.openHoldHandover);
        return;
      }
      if (qrBtn) {
        const ticket = await readHoldTicket(qrBtn.dataset.showHoldQr);
        showHoldTicketQrModal(ticket);
        return;
      }
      if (deleteBtn) {
        await deleteHoldTicket(deleteBtn.dataset.deleteHoldTicket);
      }
    }


    function setRiderOverviewMessage(text, color = "#333") {
      const el = document.getElementById("riderOverviewMessage");
      if (!el) return;
      el.textContent = text || "";
      el.className = "message" + (color === "red" ? " red" : color === "green" ? " green" : "");
      if (color !== "red" && color !== "green") el.style.color = color;
    }

    function isRiderOverviewPageVisible() {
      return !!document.getElementById("pageRiderOverview")?.classList.contains("active");
    }

    function getRiderOverviewNowMs() {
      return Date.now() + Number(riderOverviewServerTimeOffsetMs || 0);
    }

    function formatRemainMs(ms) {
      const remain = Math.max(0, Number(ms || 0) - getRiderOverviewNowMs());
      const sec = Math.ceil(remain / 1000);
      const min = Math.floor(sec / 60);
      const rest = sec % 60;
      return min + "p " + String(rest).padStart(2, "0") + "s";
    }

    // VNWL V1.9.2: trên APP, phiếu Đã bàn giao là trạng thái cuối hiển thị màu xanh
    // và chỉ còn hiển thị 10 phút. Pickup/Tài xế đã nhận chỉ xử lý tại OMS/API2.
    const RIDER_APP_HANDED_OVER_VISIBLE_MS = 10 * 60 * 1000;
    function isRiderAppHandedOverStage(stage) {
      return ["HANDED_OVER", "NOT_DONE", "DELIVERED", "WAITING_PICKUP_DONE", "DONE", "COMPLETED", "PICKUP_DONE"].includes(String(stage || "").toUpperCase());
    }
    function getRiderAppVisibleUntilMs(ticket) {
      const stage = String(ticket?.workflow_status || ticket?.status || "").toUpperCase();
      if (!isRiderAppHandedOverStage(stage)) return Number(ticket?.visible_until_ms || 0);
      const handedAt = Number(ticket?.handed_over_at_ms || ticket?.handed_over_ms || ticket?.updated_at_ms || ticket?.created_at_ms || 0);
      return handedAt > 0 ? handedAt + RIDER_APP_HANDED_OVER_VISIBLE_MS : 0;
    }

    function getRiderTicketOperator(ticket) {
      return getHoldTicketOperator(ticket);
    }

    function refreshRiderOverviewOperatorFilterOptions(list) {
      const select = document.getElementById("riderOverviewOperatorFilter");
      if (!select) return;
      const current = select.value || riderOverviewOperatorFilter || "ALL";
      const operators = Array.from(new Set((list || []).map(getRiderTicketOperator).filter(op => op && op !== "-"))).sort((a, b) => a.localeCompare(b));
      select.innerHTML = `<option value="ALL">Tất cả operator</option>` + operators.map(op => `<option value="${escapeHtml(op)}">${escapeHtml(op)}</option>`).join("");
      select.value = operators.includes(current) ? current : "ALL";
      riderOverviewOperatorFilter = select.value || "ALL";
    }

    function riderTicketMatchesSearch(ticket, keyword) {
      const kw = clean(keyword || "");
      if (!kw) return true;
      const items = Array.isArray(ticket.items) ? ticket.items : [];
      const haystacks = [
        ticket.ticket_no,
        ticket.id,
        ticket.driver_name,
        ticket.box_code,
        getRiderTicketOperator(ticket),
        ...(ticket.order_codes || []),
        ...items.flatMap(i => [i?.order_code, i?.tracking_no, i?.order_sn, i?.shopee_order_sn, i?.location_code, i?.sub_code])
      ];
      return haystacks.some(v => exactIncludes(clean(v || ""), kw));
    }


    function getRiderOverviewSortMs(ticket) {
      return Number(ticket?.last_checked_ms || ticket?.updated_at_ms || ticket?.created_at_ms || 0) || 0;
    }

    function getRiderOverviewDocIdFromTicket(ticket) {
      // V2.0: dùng nguyên ID phiếu giống Worker mirror. Không safeOrderId nữa để tránh trùng dòng Rider Overview.
      const raw = clean(ticket?.id || ticket?.ticket_id || ticket?.ticket_no || ticket?.ticketNo || "");
      return raw || "";
    }

    function getHoldTicketWorkflowForRider(ticket) {
      const rawStatus = String(ticket?.status || "").toUpperCase();
      const rawWorkflow = String(ticket?.workflow_status || "").toUpperCase();
      if (["CANCELLED", "CANCELED", "DELETED", "REMOVED"].includes(rawStatus) || ["CANCELLED", "CANCELED", "DELETED", "REMOVED"].includes(rawWorkflow) || ticket?.cancelled_at_ms || ticket?.deleted_at_ms) return "CANCELLED";
      const knownStatuses = ["RECEIVED", "BOX_ASSIGNED", "CLAIMED", "IN_PICK", "PICKED", "READY_PICK", "READY_TO_PICK", "WAITING_RECEIVE", "HANDED_OVER", "DELIVERED", "NOT_DONE", "WAITING_PICKUP_DONE", "DONE", "COMPLETED", "PICKUP_DONE", "HOLD"];
      const status = knownStatuses.includes(rawStatus) ? rawStatus : (rawWorkflow || rawStatus || "HOLD");
      const pickup = String(ticket?.pickup_status || "").toUpperCase();
      if (pickup === "DONE" || ["DONE", "COMPLETED", "PICKUP_DONE"].includes(status)) return "DONE";
      if (["HANDED_OVER", "NOT_DONE", "DELIVERED", "WAITING_PICKUP_DONE"].includes(status)) return "HANDED_OVER";
      if (["PICKED", "READY_PICK", "READY_TO_PICK", "WAITING_RECEIVE"].includes(status)) return "PICKED";
      if (["RECEIVED", "BOX_ASSIGNED", "CLAIMED", "IN_PICK"].includes(status)) return "RECEIVED";
      return "HOLD";
    }

    function mergeHoldTicketsIntoRiderOverview(tickets, options = {}) {
      try {
        const input = Array.isArray(tickets) ? tickets : [];
        if (!input.length) return;
        const nowMs = Date.now();
        const map = new Map((riderOverviewItems || []).map(t => [String(t.id || t.ticket_id || t.ticket_no || ""), t]).filter(x => x[0]));
        let changed = false;
        input.forEach(rawTicket => {
          if (!rawTicket) return;
          const ticket = normalizeHoldTicketNoDuplicateItems(rawTicket);
          const stage = getHoldTicketWorkflowForRider(ticket);
          const docId = getRiderOverviewDocIdFromTicket(ticket);
          if (!docId) return;
          if (stage === "CANCELLED") {
            if (map.delete(docId)) changed = true;
            return;
          }
          const updatedMs = Number(ticket.updated_at_ms || ticket.picked_at_ms || ticket.created_at_ms || nowMs) || nowMs;
          const items = Array.isArray(ticket.items) ? ticket.items : [];
          const actionOperator = getRiderTicketOperator(ticket);
          const payload = {
            ...ticket,
            id: docId,
            ticket_source_id: ticket.id || ticket.ticket_id || "",
            workflow_status: stage,
            status: stage,
            pickup_status: stage === "DONE" ? "DONE" : (stage === "HANDED_OVER" ? "NOT_DONE" : "WAITING"),
            display_status: isRiderAppHandedOverStage(stage)
              ? "Đã bàn giao"
              : (stage === "PICKED" ? "Vui lòng vào lấy hàng" : "Phiếu đang xử lý"),
            order_count: Number(ticket.order_count || items.length || 0),
            order_codes: Array.isArray(ticket.order_codes) && ticket.order_codes.length ? ticket.order_codes : items.map(i => i?.order_code || i?.tracking_no || "").filter(Boolean),
            items,
            updated_at_ms: updatedMs,
            created_at_ms: Number(ticket.created_at_ms || updatedMs) || updatedMs,
            visible_until_ms: isRiderAppHandedOverStage(stage) ? getRiderAppVisibleUntilMs({ ...ticket, workflow_status: stage, status: stage }) : 0,
            operator: actionOperator,
            operator_email: actionOperator === "-" ? "" : actionOperator,
            source: "vnwl_hold_ticket_live_fallback"
          };
          const previousPayload = map.get(docId) || null;
          map.set(docId, payload);
          maybeAnnounceRiderReady(payload, previousPayload, "local_hold_transition");
          changed = true;
          if (options.pushToCloud !== false && typeof apiPost === "function") {
            const originalId = clean(ticket.id || ticket.ticket_id || ticket.ticket_no || "");
            const syncKey = originalId + "|" + stage + "|" + updatedMs;
            if (originalId && riderOverviewHoldSyncAt.get(originalId) !== syncKey) {
              riderOverviewHoldSyncAt.set(originalId, syncKey);
              const serverPayload = {
                ...ticket,
                workflow_status: stage,
                status: stage,
                pickup_status: payload.pickup_status,
                updated_at_ms: updatedMs,
                operator: actionOperator === "-" ? "" : actionOperator,
                operator_email: actionOperator === "-" ? "" : actionOperator,
                source: "vnwl_hold_ticket_live_fallback"
              };
              apiPost("/api/rider/overview/upsert", { warehouse: getWarehouse(), ticket: serverPayload, source: "vnwl_hold_ticket_live_fallback" })
                .then(() => scheduleRiderOverviewRefresh(250))
                .catch(e => {
                  riderOverviewHoldSyncAt.delete(originalId);
                  console.warn("Rider Overview HOLD live fallback sync warning", e);
                });
            }
          }
        });
        if (changed) {
          riderOverviewItems = Array.from(map.values()).sort(compareTicketDriverSequenceAsc);
          if (isRiderOverviewPageVisible()) renderRiderOverview();
        }
      } catch (e) {
        console.warn("Merge HOLD tickets into Rider Overview warning", e);
      }
    }

    function captureOpenRiderOrderDropdowns(tbody) {
      if (!tbody) return;
      riderOverviewOpenOrderDropdownKeys = new Set(
        [...tbody.querySelectorAll("details.rider-order-dropdown[open][data-rider-order-key]")]
          .map(el => String(el.dataset.riderOrderKey || ""))
          .filter(Boolean)
      );
    }

    async function handleRiderOverviewUiAction(e) {
      const copyBtn = e.target.closest("[data-copy-rider-orders]");
      if (!copyBtn) return;
      e.preventDefault();
      e.stopPropagation();
      const key = clean(copyBtn.dataset.copyRiderOrders || "");
      const ticket = (riderOverviewItems || []).find(item => clean(item?.ticket_no || item?.id || item?.ticket_id || "") === key);
      if (!ticket) {
        setRiderOverviewMessage("Không tìm thấy phiếu để copy danh sách đơn.", "red");
        return;
      }
      await copyTicketOrderCodes(ticket, "rider");
    }

    function renderRiderOverview() {
      const tbody = document.getElementById("riderOverviewTable");
      if (!tbody) return;
      captureOpenRiderOrderDropdowns(tbody);
      const visibleList = (riderOverviewItems || [])
        .filter(t => {
          const stage = String(t?.workflow_status || t?.status || "").toUpperCase();
          if (["CANCELLED", "CANCELED", "DELETED", "REMOVED"].includes(stage)) return false;
          const visibleUntil = getRiderAppVisibleUntilMs(t);
          return !visibleUntil || visibleUntil > getRiderOverviewNowMs();
        })
        .sort(compareRiderOverviewDisplayOrder);
      refreshRiderOverviewOperatorFilterOptions(visibleList);
      const keyword = clean(document.getElementById("riderOverviewSearchInput")?.value || riderOverviewSearchKeyword || "");
      const operatorFilter = document.getElementById("riderOverviewOperatorFilter")?.value || riderOverviewOperatorFilter || "ALL";
      riderOverviewSearchKeyword = keyword;
      riderOverviewOperatorFilter = operatorFilter;
      const list = visibleList.filter(ticket => {
        const operator = getRiderTicketOperator(ticket);
        if (operatorFilter !== "ALL" && operator !== operatorFilter) return false;
        return riderTicketMatchesSearch(ticket, keyword);
      });
      if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="8">Chưa có phiếu đang theo dõi</td></tr>`;
        return;
      }
      function buildRiderOrderListDropdown(ticket) {
        const codes = getUiTicketOrderCodes(ticket);
        if (!codes.length) return "-";
        const rows = codes.map((code, index) => `<div class="rider-order-line">${index + 1}. <b>${escapeHtml(code)}</b></div>`).join("");
        const dropdownKey = clean(ticket?.ticket_no || ticket?.id || ticket?.ticket_id || "");
        const keepOpen = dropdownKey && riderOverviewOpenOrderDropdownKeys.has(dropdownKey);
        return `<div class="rider-order-cell"><details class="rider-order-dropdown" data-rider-order-key="${escapeHtml(dropdownKey)}" ${keepOpen ? "open" : ""}><summary>Danh sách đơn (${codes.length})</summary><div class="rider-order-list">${rows}</div></details><button class="rider-copy-orders-btn" type="button" data-copy-rider-orders="${escapeHtml(dropdownKey)}">📋 Copy danh sách</button></div>`;
      }
      function getRiderDisplay(ticket){
        const stage = String(ticket.workflow_status || ticket.status || "HOLD").toUpperCase();
        // VNWL APP không hiển thị trạng thái Pickup/Hoàn thành của OMS.
        // Bất kỳ phiếu đã bàn giao (kể cả dữ liệu cũ từng có DONE) đều hiện Đã bàn giao màu xanh trong 10 phút.
        if (isRiderAppHandedOverStage(stage)) return { text:"Đã bàn giao", row:"rider-row-handed", badge:"rider-status-handed" };
        if (["PICKED", "READY_PICK", "READY_TO_PICK", "WAITING_RECEIVE"].includes(stage)) return { text:"Vui lòng vào lấy hàng", row:"rider-row-pick", badge:"rider-status-pick" };
        return { text:"Phiếu đang xử lý", row:"rider-row-processing", badge:"rider-status-processing" };
      }
      tbody.innerHTML = list.map(ticket => {
        const display = getRiderDisplay(ticket);
        const items = Array.isArray(ticket.items) ? ticket.items : [];
        const operator = getRiderTicketOperator(ticket);
        const visibleUntilMs = getRiderAppVisibleUntilMs(ticket);
        const remain = visibleUntilMs > 0 ? formatRemainMs(visibleUntilMs) : "-";
        return `
          <tr class="${display.row}">
            <td><b>${escapeHtml(ticket.ticket_no || ticket.id || "-")}</b></td>
            <td>${escapeHtml(ticket.driver_name || "-")}</td>
            <td>${escapeHtml(operator)}</td>
            <td><span class="rider-status-badge ${display.badge}">${escapeHtml(display.text)}</span></td>
            <td>${Number(ticket.order_count || items.length || 0)}</td>
            <td>${buildRiderOrderListDropdown(ticket)}</td>
            <td>${remain}</td>
            <td>${formatDate(new Date(Number(ticket.last_checked_ms || ticket.updated_at_ms || ticket.created_at_ms || Date.now())))}</td>
          </tr>`;
      }).join("");
    }

    async function loadRiderOverview(silent = true, options = {}) {
      try {
        if (typeof apiPost !== "function") return;
        const force = !!(options && options.force);
        const nowMs = Date.now();
        const minGap = silent ? RIDER_OVERVIEW_SILENT_MIN_LOAD_GAP_MS : RIDER_OVERVIEW_MANUAL_MIN_LOAD_GAP_MS;
        if (riderOverviewLoadBusy) return;
        if (!force && riderOverviewLastServerLoadAtMs && nowMs - riderOverviewLastServerLoadAtMs < minGap) {
          if (!silent) setRiderOverviewMessage("Rider Overview đang dùng cache realtime, chưa cần đọc lại Server.", "green");
          renderRiderOverview();
          return;
        }
        if (typeof document !== "undefined" && document.visibilityState === "hidden" && !force) return;
        riderOverviewLoadBusy = true;
        riderOverviewLastServerLoadAtMs = nowMs;
        if (!silent) setRiderOverviewMessage("Đang tải Rider Overview từ Server...");
        const res = await apiPost("/api/rider/overview/list", { warehouse: getWarehouse(), source: "pc_rider_overview_read_guard", cache_ttl_ms: 30000 });
        if (res && res.updated_at_ms) {
          riderOverviewServerTimeOffsetMs = Number(res.updated_at_ms || 0) - Date.now();
        }
        if (res && res.ok && Array.isArray(res.items)) {
          riderOverviewItems = res.items.slice().sort(compareRiderOverviewDisplayOrder);
          // V1.9.9 RECOVERY: không để request tải Rider Overview xóa mất phiếu HOLD
          // vừa thao tác trên chính tab này trong lúc mirror Server chưa kịp trả về.
          // Chỉ merge cache local, không tạo lượt ghi Server/quota mới.
          const localHoldRecovery = getTodayHoldTicketsFromCache(true);
          if (localHoldRecovery.length) {
            mergeHoldTicketsIntoRiderOverview(localHoldRecovery, { pushToCloud: false, reason: "rider_load_local_hold_recovery_v199" });
          } else {
            renderRiderOverview();
          }
          if (!silent) {
            const recoveredCount = Number(res.recovered_from_hold_count || 0);
            setRiderOverviewMessage("Đã tải " + res.items.length + " phiếu đang hiển thị." + (recoveredCount ? " Đã tự phục hồi phiếu HOLD đang hoạt động." : ""), "green");
          }
        }
      } catch (error) {
        console.warn("Rider Overview load warning:", error);
        if (!silent) setRiderOverviewMessage("Lỗi tải Rider Overview: " + (error.message || error), "red");
      } finally {
        riderOverviewLoadBusy = false;
      }
    }

    function startRiderOverviewLoop() {
      // V1.4: chỉ tải Rider Overview khi người dùng mở màn; cập nhật tiếp theo là delta WebSocket.
      if (document.getElementById("pageRiderOverview")?.classList.contains("active")) loadRiderOverview(true);
    }


    async function pushHoldTicketStageToRiderOverview(ticket, workflowStatus) {
      // V1.9.5: updateDoc/setDoc phiếu HOLD đã được Worker mirror sang Rider Overview.
      // Trình duyệt chỉ preview local để phản hồi ngay, không gửi API Rider lần hai.
      try {
        if (!ticket || !ticket.id) return;
        const nowMs = Date.now();
        const stage = String(workflowStatus || ticket.workflow_status || ticket.status || "HOLD").toUpperCase();
        const actionOperator = getHoldTicketOperator({ ...ticket, workflow_status: stage, status: stage });
        const payload = {
          ...ticket,
          workflow_status: stage,
          status: stage,
          pickup_status: stage === "DONE" ? "DONE" : (stage === "HANDED_OVER" ? "NOT_DONE" : "WAITING"),
          updated_at_ms: nowMs,
          visible_until_ms: ["CANCELLED", "CANCELED", "DELETED", "REMOVED"].includes(stage)
            ? nowMs - 1
            : (stage === "HANDED_OVER" ? nowMs + RIDER_APP_HANDED_OVER_VISIBLE_MS : Number(ticket.visible_until_ms || 0)),
          operator: actionOperator === "-" ? "" : actionOperator,
          operator_email: actionOperator === "-" ? "" : actionOperator,
          source: "vnwl_hold_ticket_worker_mirror_v195"
        };
        mergeHoldTicketsIntoRiderOverview([payload], { pushToCloud: false, reason: "worker_mirror_local_preview" });
        if (["CANCELLED", "CANCELED", "DELETED", "REMOVED"].includes(stage) && isRiderOverviewPageVisible()) renderRiderOverview();
      } catch (e) { console.warn("Rider Overview local preview warning", e); }
    }

    function notifyApiBridgeHandedOverTicket(ticket) {
      // V1.9.6: thông báo ngay cho API1 snippet đang chạy cùng tab, không phát sinh read/write Server.
      if (!ticket || !ticket.id) return;
      try {
        window.dispatchEvent(new CustomEvent("vnwl:rider_handed_over_ticket", {
          detail: { ticket, warehouse_code: getWarehouse(), at_ms: Date.now() }
        }));
      } catch (error) {
        console.warn("Bridge local ticket event warning:", error);
      }
    }

    async function pushDirectHandoverItemsToRiderOverview(successItems, nowMs) {
      try {
        if (!Array.isArray(successItems) || !successItems.length || typeof apiPost !== "function") return;
        const driverName = clean(document.getElementById("holdDriverName")?.value || "-") || "-";
        const allocated = await allocateDailyTicketNumber(nowMs || Date.now(), "shared_ticket_rule");
        const ticketNo = allocated.ticketNo;
        const ticketPayload = {
          id: allocated.ticketId,
          ticket_no: ticketNo,
          date_key: allocated.dateKey,
          seq: allocated.seq,
          driver_name: driverName,
          warehouse_code: getWarehouse(),
          status: "HANDED_OVER",
          workflow_status: "HANDED_OVER",
          display_status: "Đã bàn giao",
          pickup_status: "NOT_DONE",
          handed_over_count: successItems.length,
          handed_over_at_ms: nowMs || Date.now(),
          created_at_ms: nowMs || Date.now(),
          updated_at_ms: nowMs || Date.now(),
          visible_until_ms: (nowMs || Date.now()) + RIDER_APP_HANDED_OVER_VISIBLE_MS,
          operator: getCurrentOperatorEmail(),
          operator_email: getCurrentOperatorEmail(),
          handed_over_by: getCurrentOperatorEmail(),
          source: "vnwl_direct_handover_v33",
          items: successItems.map(item => ({
            order_code: item.order_code || "-",
            tracking_no: item.order_code || "-",
            location_code: item.location_code || item.location_base || item.location || "-",
            sub_code: item.sub_code || item.sub || "-",
            order_sn: item.order_sn || item.cloud_d0_aux2_order_sn || item.shopee_order_sn || "-",
            pickup_done: false,
            parcel_state: "-",
            last_checked_ms: 0
          }))
        };
        const res = await apiPost("/api/rider/overview/upsert", {
          warehouse: getWarehouse(),
          source: "vnwl_direct_handover_v33",
          ticket: ticketPayload
        });
        if (res && res.ok && isRiderOverviewPageVisible()) applyRiderOverviewWsMessage({ type: "rider_overview_changed", direct_delta: true, docs: [{ id: ticketPayload.id, data: ticketPayload }] });
      } catch (error) {
        console.warn("Push direct Rider Overview warning:", error);
      }
    }

    async function markSortingBatchSourceTicketsHandedOver(okCount) {
      if (!currentHoldTicket?.is_sorting_batch || !Array.isArray(currentHoldTicket.source_tickets) || !okCount) return;
      const nowMs = Date.now();
      const operator = getCurrentOperatorEmail();
      const sourceTickets = currentHoldTicket.source_tickets || [];
      for (const ticket of sourceTickets) {
        try {
          const ticketItems = (currentHoldTicket.items || []).filter(item => String(item.source_ticket_id || "") === String(ticket.id || ticket.ticket_id || ticket.ticket_no || ""));
          const count = ticketItems.length || Number(ticket.order_count || ticket.items?.length || 0) || okCount;
          const activityLog = appendHoldActivityLog(ticket, "HANDOVER", operator, "Đã bàn giao trong Sorting batch " + (currentHoldTicket.ticket_no || currentHoldTicket.id) + ".", nowMs);
          await updateDoc(getHoldTicketRef(ticket.id), {
            status: "HANDED_OVER",
            workflow_status: "HANDED_OVER",
            display_status: "Đã bàn giao",
            pickup_status: "NOT_DONE",
            handed_over_count: count,
            handed_over_at: serverTimestamp(),
            handed_over_at_ms: nowMs,
            updated_at: serverTimestamp(),
            updated_at_ms: nowMs,
            handed_over_by: operator,
            operator,
            operator_email: operator,
            last_operator: operator,
            hold_last_operator: operator,
            last_operation: "HANDOVER",
            last_operation_at: serverTimestamp(),
            last_operation_at_ms: nowMs,
            handed_over_device_id: getDeviceId(),
            box_active: false,
            box_released_at_ms: nowMs,
            sorting_batch_id: currentHoldTicket.id,
            activity_log: activityLog
          });
          const updated = upsertHoldTicketCache({ ...ticket, status:"HANDED_OVER", workflow_status:"HANDED_OVER", handed_over_count:count, handed_over_at_ms:nowMs, updated_at_ms:nowMs, handed_over_by:operator, operator, operator_email:operator, last_operator:operator, hold_last_operator:operator, last_operation:"HANDOVER", last_operation_at_ms:nowMs, box_active:false, box_released_at_ms:nowMs, activity_log:activityLog });
          await pushHoldTicketStageToRiderOverview(updated, "HANDED_OVER");
          notifyApiBridgeHandedOverTicket(updated);
        } catch (error) {
          console.warn("Sorting batch source ticket handover warning:", error);
        }
      }
      renderActiveHoldTicketsFromCache();
      try { await forceReloadTodayHoldTicketsFromServer("sorting_handed_over"); } catch (_) {}
      vnwlSafeToast("Đã bàn giao Sorting batch", "Đã đóng " + sourceTickets.length + " phiếu nguồn.", "ok", 8000);
    }

    async function markCurrentHoldTicketHandedOver(okCount) {
      if (currentHoldTicket?.is_sorting_batch) { await markSortingBatchSourceTicketsHandedOver(okCount); return; }
      if (!currentHoldTicket?.id || !okCount) return;
      try {
        const nowMs = Date.now();
        const operator = getCurrentOperatorEmail();
        const activityLog = appendHoldActivityLog(currentHoldTicket, "HANDOVER", operator, "Đã bàn giao " + okCount + " đơn.", nowMs);
        await updateDoc(getHoldTicketRef(currentHoldTicket.id), {
          status: "HANDED_OVER",
          workflow_status: "HANDED_OVER",
          display_status: "Đã bàn giao",
          pickup_status: "NOT_DONE",
          handed_over_count: okCount,
          handed_over_at: serverTimestamp(),
          handed_over_at_ms: nowMs,
          updated_at: serverTimestamp(),
          updated_at_ms: nowMs,
          handed_over_by: operator,
          operator: operator,
          operator_email: operator,
          last_operator: operator,
          hold_last_operator: operator,
          last_operation: "HANDOVER",
          last_operation_at: serverTimestamp(),
          last_operation_at_ms: nowMs,
          handed_over_device_id: getDeviceId(),
          box_active: false,
          box_released_at_ms: nowMs,
          activity_log: activityLog
        });
        currentHoldTicket = upsertHoldTicketCache({ ...currentHoldTicket, status: "HANDED_OVER", workflow_status: "HANDED_OVER", handed_over_count: okCount, handed_over_at_ms: nowMs, updated_at_ms: nowMs, handed_over_by: operator, operator, operator_email: operator, last_operator: operator, hold_last_operator: operator, last_operation: "HANDOVER", last_operation_at_ms: nowMs, activity_log: activityLog });
        renderActiveHoldTicketsFromCache();
        // FAST CLOSE FIX: /api/fs/commit da tu dong sync Rider Overview trong cung transaction D1
        // khi cap nhat hold_tickets_v285_WHx. Khong gui lai /api/rider/overview/upsert lan 2
        // qua Realtime vi request trung lap nay giu popup mo rat lau du ban giao da thanh cong.
        try {
          showVnwlToast("Đã bàn giao phiếu", ((currentHoldTicket.ticket_no || currentHoldTicket.id || "-") + " — Rider Overview: Đã bàn giao"), "ok", 8000);
          await pushHoldTicketStageToRiderOverview(currentHoldTicket, "HANDED_OVER");
          notifyApiBridgeHandedOverTicket(currentHoldTicket);
        } catch (e) { console.warn("Rider Overview UI refresh warning:", e); }
      } catch (error) {
        console.warn("Update HOLD ticket status warning:", error);
      }
    }

    async function markCheckLocationTimeOptimized(validItems) {
      // WRITE OPTIMIZED v2.8.7:
      // Check location chỉ hiển thị vị trí, không đọc/ghi D1.
      return;
    }

    async function commitHandoverTransaction(items, source = "UNKNOWN") {
      const targetItems = dedupeHandoverItemsByOrderCode(items.filter(i => i && i.valid && i.scanned && i.id && i.status === "NO_RIDER")).items;

      
      if(currentHoldTicket?.is_sorting_batch){
        const ticketIds=(currentHoldTicket.source_tickets||[]).map(t=>String(t.id||t.ticket_id||t.ticket_no||"")).filter(Boolean);
        if(!ticketIds.length)throw Error("Không xác định được các phiếu nguồn của Sorting batch.");
        return apiPost("/api/hold/finish_sorting_batch",{warehouse:getWarehouse(),ticket_ids:ticketIds,scanned:targetItems.map(i=>String(i.id))});
      }
      if(currentHoldTicket?.is_sorting_batch){
        const ticketIds=(currentHoldTicket.source_tickets||[]).map(t=>String(t.id||t.ticket_id||t.ticket_no||"")).filter(Boolean);
        if(!ticketIds.length)throw Error("Không xác định được các phiếu nguồn của Sorting batch.");
        return apiPost("/api/hold/finish_sorting_batch",{warehouse:getWarehouse(),ticket_ids:ticketIds,scanned:targetItems.map(i=>String(i.id))});
      }
      if(currentHoldTicket?.id){
        return apiPost("/api/hold/finish",{warehouse:getWarehouse(),ticket_id:currentHoldTicket.id,scanned:targetItems.map(i=>i.id)});
      }
      if (!targetItems.length) {
        return {
          successItems: [],
          skippedItems: [],
          message: "Không có đơn hợp lệ để bàn giao."
        };
      }

      const now = new Date();

      // V1.9.6: ưu tiên một API Worker duy nhất. Với bàn giao trực tiếp, Worker tạo luôn phiếu Rider
      // trong cùng request, tránh tình trạng đơn đã Success nhưng API1 không có phiếu để gửi OMS.
      try {
        if (typeof apiPost === "function") {
          const directMode = !currentHoldTicket?.id;
          const serverResult = await apiPost("/api/orders/commit_handover", {
            warehouse: getWarehouse(),
            items: targetItems.map(item => ({
              id: item.id,
              order_code: item.order_code || "",
              tracking_no: item.order_code || "",
              warehouse_code: item.warehouse_code || getWarehouse(),
              location_code: item.location_code || "",
              sub_code: item.sub_code || item.sub || "",
              scanned: true,
              status: item.status || "NO_RIDER"
            })),
            source,
            create_direct_ticket: directMode,
            driver_name: clean(document.getElementById("holdDriverName")?.value || "-") || "-",
            device_id: getDeviceId(),
            request_id: "pc_handover_" + Date.now() + "_" + Math.random().toString(36).slice(2)
          });
          const successItems = Array.isArray(serverResult.successItems) ? serverResult.successItems : (serverResult.success_items || []);
          const skippedItems = Array.isArray(serverResult.skippedItems) ? serverResult.skippedItems : (serverResult.skipped_items || []);
          return { successItems, skippedItems, directTicket: serverResult.direct_ticket || null, used_atomic_server_handover: true };
        }
      } catch (serverError) {
        throw serverError;
      }

      const result = await runTransaction(db, async transaction => {
        const refs = targetItems.map(item => ({
          item,
          orderRef: doc(db, getOrdersCollectionName(), item.id),
          queueRef: getHandoverQueueRef(item.id)
        }));

        const reads = [];
        for (const entry of refs) {
          const snap = await transaction.get(entry.orderRef);
          reads.push({ ...entry, snap });
        }

        const successItems = [];
        const skippedItems = [];

        for (const entry of reads) {
          const { item, snap, orderRef, queueRef } = entry;

          if (!snap.exists()) {
            skippedItems.push({ ...item, skip_reason: "Không tìm thấy đơn trên Server" });
            continue;
          }

          const data = snap.data();

          if (data.status === "HANDED_OVER") {
            skippedItems.push({ ...item, skip_reason: "Đơn đã được máy khác bàn giao trước đó" });
            continue;
          }

          if (data.status !== "NO_RIDER") {
            skippedItems.push({ ...item, skip_reason: "Trạng thái không hợp lệ: " + (data.status || "-") });
            continue;
          }

          const handoverPayload = {
            order_id: item.id,
            order_code: item.order_code || data.order_code || "",
            warehouse_code: item.warehouse_code || data.warehouse_code || getWarehouse(),
            location_code: item.location_code || data.location_code || "",
            status: "HANDED_OVER",
            handed_over_at: serverTimestamp(),
            handed_over_at_ms: Date.now(),
            updated_at: serverTimestamp(),
            updated_at_ms: Date.now(),
            created_at: serverTimestamp(),
            source,
            device_id: getDeviceId(),
            code_version: CODE_VERSION,
            handed_over_by: getCurrentOperatorEmail(),
            updated_by: getCurrentOperatorEmail(),
            last_operator: getCurrentOperatorEmail(),
            last_operation: "HANDOVER",
            last_operation_at: serverTimestamp(),
            last_operation_at_ms: Date.now()
          };

          transaction.update(orderRef, {
            status: "HANDED_OVER",
            handed_over_at: serverTimestamp(),
            handed_over_at_ms: Date.now(),
            updated_at: serverTimestamp(),
            updated_at_ms: Date.now(),
            delete_at: getDeleteAtAfter15Days(),
            handover_source: source,
            handover_device_id: getDeviceId(),
            handover_code_version: CODE_VERSION,
            handed_over_by: getCurrentOperatorEmail(),
            updated_by: getCurrentOperatorEmail(),
            last_operator: getCurrentOperatorEmail(),
            last_operation: "HANDOVER",
            last_operation_at: serverTimestamp(),
            last_operation_at_ms: Date.now()
          });

          // WRITE OPTIMIZED: không ghi handover_index duplicate. Trạng thái bàn giao đã nằm trong orders + live_updates.
          // V1.4 cloud-only: không ghi queue API ngoài ứng dụng.

          // WRITE OPTIMIZED: không dùng pending_orders/chờ bàn giao nên không cần delete pending index.

          const liveAtMs = Date.now();
          const liveOrder = {
            id: item.id,
            ...data,
            order_code: item.order_code || data.order_code || "",
            warehouse_code: item.warehouse_code || data.warehouse_code || getWarehouse(),
            location_code: item.location_code || data.location_code || "",
            status: "HANDED_OVER",
            handed_over_at: now,
            handed_over_at_ms: liveAtMs,
            updated_at: now,
            updated_at_ms: liveAtMs,
            handed_over_by: getCurrentOperatorEmail(),
            updated_by: getCurrentOperatorEmail(),
            last_operator: getCurrentOperatorEmail(),
            last_operation: "HANDOVER",
            last_operation_at: now,
            last_operation_at_ms: liveAtMs
          };
          // V1.4: không ghi live_updates; order delta được Worker broadcast trực tiếp.

          successItems.push({
            ...item,
            created_at: data.created_at || item.created_at || "",
            created_at_ms: Number(data.created_at_ms || item.created_at_ms || 0),
            location_code: item.location_code || data.location_code || "",
            warehouse_code: item.warehouse_code || data.warehouse_code || getWarehouse(),
            status: "HANDED_OVER",
            handed_over_at: now,
            handed_over_at_ms: liveAtMs,
            updated_at: now,
            updated_at_ms: liveAtMs,
            handed_over_by: getCurrentOperatorEmail(),
            updated_by: getCurrentOperatorEmail(),
            last_operator: getCurrentOperatorEmail(),
            last_operation: "HANDOVER",
            last_operation_at: now,
            last_operation_at_ms: liveAtMs
          });
        }

        return { successItems, skippedItems };
      });

      if (result.successItems.length) {
        result.successItems.forEach(item => {
          const original = targetItems.find(x => x.id === item.id);
          if (original) {
            original.status = "HANDED_OVER";
            original.handed_over_at = now;
            original.updated_at = now;
          }
        });

        mergeOrdersIntoMemory(result.successItems);
        await localSaveOrders(result.successItems);
        await localPersistCurrentState();
        // Không rebuild recent_orders khi bàn giao để giảm quota.
        // Máy khác sẽ nhận trạng thái mới qua live_updates_v281_WHx.
      }

      return result;
    }




    async function markCheckLocationTimeForValidOrders() {
      // WRITE OPTIMIZED v2.8.7:
      // Check location chỉ hiển thị vị trí lấy hàng, không ghi D1.
      return;
    }


    function checkScan() {
      const scanValue = clean(document.getElementById("scanInput").value);
      if (!scanValue) {
        setScanMessage("Vui lòng scan mã đơn", "red");
        playSound("error");
        return false;
      }

      const item = handoverItems.find(i =>
        i.valid &&
        i.status === "NO_RIDER" &&
        scanMatchesHandoverItem(i, scanValue)
      );

      if (!item) {
        const scannedAlready = handoverItems.find(i => scanMatchesHandoverItem(i, scanValue) && i.scanned);
        setScanMessage(
          scannedAlready ? "Đơn này đã scan rồi" :
          "SAI MÃ / SAI HOA-thường: Bạn scan '" + scanValue + "'. Có thể scan Mã vận đơn hoặc Mã đơn hàng, nhưng phải khớp 100% với dữ liệu đã check location.",
          "red"
        );
        playSound("error");
        document.getElementById("scanInput").select();
        return false;
      }

      if (item.scanned) {
        setScanMessage("Đơn " + item.order_code + " đã scan rồi", "red");
        playSound("error");
        document.getElementById("scanInput").select();
        return false;
      }

      item.scanned = true;
      document.getElementById("scanInput").value = "";
      renderHandoverItems();
      updateHandoverStats();
      updateHoldButtons();

      const scanned = getScannedCount();
      const total = getValidHandoverCount();
      setScanMessage("Scan đúng (" + scanLabelForHandoverItem(item, scanValue) + "): " + item.order_code + " — " + scanned + "/" + total, "green");
      playSound("scan");

      if (scanned === total && total > 0) {
        setScanMessage("Đã scan đủ " + scanned + "/" + total + ". Hệ thống đang tự động bàn giao...", "green");
        document.getElementById("scanInput").disabled = true;
        document.getElementById("btnScan").disabled = true;
        const cameraBtn = document.getElementById("btnCameraScanHandover");
        if (cameraBtn) cameraBtn.disabled = true;
        setTimeout(() => handoverAll(true), 450);
      } else {
        const nextItem = handoverItems.find(i => i.valid && i.status === "NO_RIDER" && !i.scanned);
        if (nextItem) {
          setHandoverMessage(
            "Đã scan " + scanned + "/" + total + ". Đơn tiếp theo theo sequence: " +
            (nextItem.location_code || "-") + " - " + (nextItem.order_code || "-"),
            "green"
          );
        }
        document.getElementById("scanInput").focus();
      }

      return true;
    }

    async function handoverAll(autoMode = false) {
      if (autoHandoverBusy) return;
      const sessionItems = handoverItems;
      autoHandoverBusy = true;

      try {
        const total = getValidHandoverCount();
        const scanned = getScannedCount();

        if (total === 0) {
          setScanMessage("Không có đơn hợp lệ để bàn giao", "red");
          playSound("error");
          return;
        }

        if (scanned !== total) {
          setScanMessage("Chưa scan đủ đơn: " + scanned + "/" + total, "red");
          playSound("error");
          return;
        }

        if (!autoMode && !confirm("Xác nhận bàn giao " + total + " đơn?")) return;

        setScanMessage("Đang bàn giao an toàn, vui lòng chờ...", "green");

        const result = await commitHandoverTransaction(handoverItems, "MOBILE_OR_PC");

        const okCount = result.successItems.length;
        const skippedCount = result.skippedItems.length;

        if (okCount > 0) {
          setScanMessage(
            skippedCount
              ? "Bàn giao thành công " + okCount + " đơn. Bỏ qua " + skippedCount + " đơn đã xử lý bởi máy khác."
              : "Bàn giao thành công " + okCount + "/" + total + " đơn. Hệ thống sẽ tự làm mới phiên.",
            "green"
          );
          setHandoverMessage("Đã cập nhật bàn giao an toàn.", "green");
          playSound("handover");
          // V1.5.2: mở Success popup ngay khi commit bàn giao đã thành công.
          // Danh sách lấy từ result.successItems trong bộ nhớ; không phát sinh read D1.
          showHandoverSuccessModal(result.successItems, total, skippedCount);
          if (currentHoldTicket?.id) {
            if(result.sorting_batch_closed){(result.tickets||[]).forEach(ticket=>upsertHoldTicketCache(ticket));renderActiveHoldTicketsFromCache();}
            else if(!result.hold_closed) await markCurrentHoldTicketHandedOver(okCount); else notifyApiBridgeHandedOverTicket(result.ticket);
          } else if (result.directTicket) {
            notifyApiBridgeHandedOverTicket(result.directTicket);
            if (isRiderOverviewPageVisible()) {
              applyRiderOverviewWsMessage({ type: "rider_overview_changed", direct_delta: true, docs: [{ id: result.directTicket.id, data: result.directTicket }] });
            }
          } else {
            // Chỉ dùng fallback nếu Worker cũ chưa hỗ trợ tạo phiếu cùng request.
            await pushDirectHandoverItemsToRiderOverview(result.successItems, Date.now());
          }
        } else {
          setScanMessage("Không có đơn nào được bàn giao. Có thể đơn đã được máy khác xử lý trước.", "red");
          setHandoverMessage("Không có đơn mới được bàn giao.", "red");
          playSound("error");
        }

        result.skippedItems.forEach(skip => {
          const item = handoverItems.find(x => x.id === skip.id);
          if (item) {
            item.valid = false;
            item.note = skip.skip_reason || "Đã được xử lý";
          }
        });

        renderHandoverItems();
        updateHandoverStats();

        // Realtime recent_orders đã cập nhật trong commitHandoverTransaction, không loadOrders lại để giảm read.

        if (okCount > 0) {
          setTimeout(() => {
            if (handoverItems !== sessionItems) return;
            resetSession();
            setHandoverMessage("Đã tự làm mới phiên sau bàn giao.", "green");
          }, 1200);
        } else {
          const scanInput = document.getElementById("scanInput");
          const scanBtn = document.getElementById("btnScan");
          const cameraBtn = document.getElementById("btnCameraScanHandover");
          if (scanInput) scanInput.disabled = false;
          if (scanBtn) scanBtn.disabled = false;
          if (cameraBtn) cameraBtn.disabled = false;
        }
      } catch (error) {
        const errorDetail = error?.payload?.message || (error?.payload?.error && error.payload.error !== "IFC_REQUEST" ? error.payload.error : "") || error?.message || String(error);
        setScanMessage("Lỗi bàn giao an toàn: " + errorDetail, "red");
        playSound("error");

        const scanInput = document.getElementById("scanInput");
        const scanBtn = document.getElementById("btnScan");
        const cameraBtn = document.getElementById("btnCameraScanHandover");
        if (scanInput) scanInput.disabled = false;
        if (scanBtn) scanBtn.disabled = false;
        if (cameraBtn) cameraBtn.disabled = false;
      } finally {
        autoHandoverBusy = false;
      }
    }

    function renderHandoverItems() {
      const tbody = document.getElementById("handoverTable");
      tbody.innerHTML = "";
      if (!handoverItems.length) {
        tbody.innerHTML = `<tr><td colspan="7">Chưa có dữ liệu</td></tr>`;
      } else {
        sortHandoverItemsByPickSequence(handoverItems).forEach(item => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td><b>${escapeHtml(item.suffix || "")}</b></td>
            <td>${escapeHtml(item.order_code || "-")}</td>
            <td>${escapeHtml(item.warehouse_code || "-")}</td>
            <td><b>${escapeHtml(item.location_code || "-")}</b></td>
            <td>${renderStatus(item.status, item.valid)}</td>
            <td>${renderScan(item)}</td>
            <td>${escapeHtml(item.note || "")}</td>
          `;
          tbody.appendChild(tr);
        });
      }
      renderModalTicket();
    }

    function renderModalTicket() {
      const list = document.getElementById("modalOrderList");
      const validItems = sortHandoverItemsByPickSequence(handoverItems.filter(i => i.valid && i.status === "NO_RIDER"));
      const scanned = validItems.filter(i => i.scanned).length;
      const total = validItems.length;
      const locations = [...new Set(validItems.map(i => i.location_code).filter(Boolean))];
      const percent = total ? Math.round(scanned / total * 100) : 0;

      document.getElementById("modalWarehouse").textContent = getWarehouse();
      document.getElementById("modalOrderCount").textContent = total;
      document.getElementById("modalLocations").textContent = locations.length ? locations.join(", ") : "-";
      document.getElementById("modalProgressCount").textContent = scanned + "/" + total;
      document.getElementById("modalProgressFill").style.width = percent + "%";
      document.getElementById("btnScanFocus").textContent = "⏳ Scan Đơn Hàng (" + scanned + "/" + total + ")";

      list.innerHTML = "";
      sortHandoverItemsByPickSequence(handoverItems).forEach(item => {
        const div = document.createElement("div");
        div.className = "ticket-item";
        let statusClass = "wait", statusText = "✅ Sẵn sàng";
        if (!item.valid) { statusClass = "error"; statusText = "❌ Không hợp lệ"; }
        else if (item.status !== "NO_RIDER") { statusClass = "error"; statusText = "❌ Không nhận"; }
        else if (item.scanned) { statusClass = "done"; statusText = "✅ Đã scan"; }

        div.innerHTML = `
          <div class="ticket-line"><span>🔢 Mã đơn:</span><span class="ticket-order">${escapeHtml(item.order_code || "-")}</span></div>
          <div class="ticket-line"><span>📍 Vị trí:</span><span class="ticket-location">${escapeHtml(item.location_code || "-")}</span></div>
          <div class="ticket-line"><span>🔢 Sub:</span><span>${escapeHtml(item.sub_code || item.sub || "-")}</span></div>
          <div class="ticket-status ${statusClass}">${escapeHtml(statusText)}</div>
        `;
        list.appendChild(div);
      });
    }


    // =========================
    // Mobile Camera Scanner
    // =========================
    let cameraScanner = null;
    let cameraScannerMode = "location";
    let cameraSortingTarget = null;
    let cameraScannerBusy = false;
    let lastCameraScanText = "";
    let lastCameraScanAt = 0;

    const CAMERA_FORMATS = [
      "CODE_128"
    ];

    function setCameraMessage(text, color = "") {
      const el = document.getElementById("cameraScannerMessage");
      el.textContent = text || "";
      el.className = "message " + color;
    }

    async function loadExternalScriptOnce(url) {
      return new Promise((resolve, reject) => {
        const existed = document.querySelector(`script[data-src="${url}"]`);
        if (existed) return resolve();

        const s = document.createElement("script");
        s.src = url;
        s.dataset.src = url;
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error("Không tải được thư viện scan"));
        document.head.appendChild(s);
      });
    }

    async function ensureHtml5QrCode() {
      if (window.Html5Qrcode) return;

      const urls = [
        "/vendor/html5-qrcode.min.js"
      ];

      let lastError = null;
      for (const url of urls) {
        try {
          setCameraMessage("Đang tải thư viện scan...");
          await loadExternalScriptOnce(url);
          if (window.Html5Qrcode) return;
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError || new Error("Không tải được thư viện scan");
    }

    async function openCameraScanner(mode) {
      cameraScannerMode = mode;
      try { dismissMobileKeyboard?.(); } catch {}
      try { document.body?.classList?.add("vnwl-camera-modal-open"); } catch {}

      document.getElementById("cameraScannerTitle").textContent =
        mode === "location" ? "📷 Scan check location" :
        mode === "hold_ticket" ? "📷 Scan QR phiếu HOLD" :
        mode === "hold_box" ? "📦 Scan mã BOX" :
        mode === "sorting_ticket_box" ? "📷 Scan rổ/BOX phiếu" :
        mode === "sorting_item_box" ? "📷 Scan xác nhận rổ" :
        "📷 Scan check đơn bàn giao";

      document.getElementById("cameraLastCode").textContent = "-";
      setCameraMessage(
        mode === "location"
          ? "Scan mã đơn / 5 ký tự cuối để thêm vào danh sách check location."
          : mode === "hold_ticket"
            ? "Scan QR trên phiếu HOLD để tìm nhanh phiếu bàn giao."
            : mode === "hold_box"
              ? "Scan barcode/QR trên BOX để gắn BOX vào phiếu đã nhận."
              : (mode === "sorting_ticket_box" || mode === "sorting_item_box")
                ? "Scan barcode/QR trên rổ/BOX. Camera sẽ nhập vào đúng ô BOX đang chọn."
                : "Scan full mã đơn để kiểm tra đúng đơn bàn giao.",
        "green"
      );

      const cameraModalEl = document.getElementById("cameraScannerModal");
      const cameraBoxEl = cameraModalEl?.querySelector?.(".camera-box");
      cameraModalEl?.classList?.add("show");
      cameraModalEl?.setAttribute?.("aria-hidden", "false");
      // V2.0 HARD FIX: camera phải nổi trên Sorting modal bằng inline style, không chỉ bằng CSS.
      // Trước đây CSS bị đặt nhầm vào template in nên mobile tưởng bấm camera không mở.
      if (cameraModalEl) {
        cameraModalEl.style.display = "flex";
        cameraModalEl.style.visibility = "visible";
        cameraModalEl.style.opacity = "1";
        cameraModalEl.style.pointerEvents = "auto";
        cameraModalEl.style.zIndex = "2147483646";
      }
      if (cameraBoxEl) {
        cameraBoxEl.style.position = "relative";
        cameraBoxEl.style.zIndex = "2147483647";
      }

      await startCameraScanner();
    }

    async function startCameraScanner() {
      if (cameraScannerBusy) return;
      cameraScannerBusy = true;

      try {
        await ensureHtml5QrCode();

        if (cameraScanner) {
          try { await cameraScanner.stop(); } catch {}
          try { await cameraScanner.clear(); } catch {}
          cameraScanner = null;
        }

        const formats = CAMERA_FORMATS
          .map(name => window.Html5QrcodeSupportedFormats?.[name])
          .filter(v => v !== undefined);

        cameraScanner = new window.Html5Qrcode("cameraReader", {
          verbose: false,
          formatsToSupport: formats
        });

        const config = {
          // Tối ưu barcode 1D trên iOS/Android: scan ít format + khung ngang + FPS cao.
          fps: 24,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const width = Math.floor(viewfinderWidth * 0.96);
            const height = Math.floor(viewfinderHeight * 0.30);
            return {
              width: Math.max(280, Math.min(width, viewfinderWidth - 12)),
              height: Math.max(130, Math.min(height, viewfinderHeight - 12))
            };
          },
          aspectRatio: 1.777778,
          disableFlip: true,
          rememberLastUsedCamera: true,
          showTorchButtonIfSupported: true,
          showZoomSliderIfSupported: true,
          defaultZoomValueIfSupported: 2,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
          },
          videoConstraints: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 30 }
          }
        };

        await cameraScanner.start(
          { facingMode: "environment" },
          config,
          decodedText => handleCameraScan(decodedText),
          () => {}
        );

        setCameraMessage("Camera đã bật. Đang scan...", "green");
      } catch (error) {
        console.error(error);
        setCameraMessage("Không scan được: " + (error.message || error) + ". Hãy mở bằng Safari/Chrome thật, không mở trong app chat.", "red");
        playSound("error");
      } finally {
        cameraScannerBusy = false;
      }
    }

    async function closeCameraScanner() {
      try {
        if (cameraScanner) {
          await cameraScanner.stop();
          await cameraScanner.clear();
        }
      } catch (error) {
        console.warn(error);
      }

      cameraScanner = null;
      cameraScannerBusy = false;
      const cameraModalEl = document.getElementById("cameraScannerModal");
      const cameraBoxEl = cameraModalEl?.querySelector?.(".camera-box");
      cameraModalEl?.classList?.remove("show");
      cameraModalEl?.setAttribute?.("aria-hidden", "true");
      if (cameraModalEl) {
        cameraModalEl.style.display = "";
        cameraModalEl.style.visibility = "";
        cameraModalEl.style.opacity = "";
        cameraModalEl.style.pointerEvents = "";
        cameraModalEl.style.zIndex = "";
      }
      if (cameraBoxEl) {
        cameraBoxEl.style.position = "";
        cameraBoxEl.style.zIndex = "";
      }
      try { document.body?.classList?.remove("vnwl-camera-modal-open"); } catch {}
    }

    function handleCameraScan(rawText) {
      const code = clean(rawText);
      if (!code) return;

      const now = Date.now();
      if (code === lastCameraScanText && now - lastCameraScanAt < 1500) return;

      lastCameraScanText = code;
      lastCameraScanAt = now;
      document.getElementById("cameraLastCode").textContent = code;

      if (cameraScannerMode === "location") {
        addSuffixFromCamera(code, { focus: false });
        dismissMobileKeyboard();
        setCameraMessage("Đã thêm mã check location: " + code, "green");
        setHandoverMessage("Đã scan mã check location. Bấm Check Bàn Giao khi đủ mã.", "green");
        playSound("scan");
        return;
      }

      if (cameraScannerMode === "hold_ticket") {
        const input = document.getElementById("holdTicketSearchInput");
        if (input) input.value = code;
        setCameraMessage("Đã scan mã phiếu: " + code + ". Đang tìm phiếu...", "green");
        searchHoldTicketFromInput().finally(() => setTimeout(() => closeCameraScanner(), 120));
        return;
      }

      if (cameraScannerMode === "hold_box") {
        const input = document.getElementById("holdBoxScanInput");
        if (input) input.value = normalizeHoldBoxCode(code);
        setCameraMessage("Đã scan BOX: " + normalizeHoldBoxCode(code) + ". Đang xác nhận...", "green");
        assignBoxToPendingHoldTicket().finally(() => setTimeout(() => closeCameraScanner(), 120));
        return;
      }

      if (cameraScannerMode === "sorting_ticket_box") {
        const idx = Number(cameraSortingTarget?.index);
        const input = Number.isFinite(idx) ? document.getElementById("sortingTicketBox_" + idx) : null;
        if (!input) { setCameraMessage("Không tìm thấy ô BOX đang chọn.", "red"); playSound("error"); return; }
        input.value = normalizeHoldBoxCode(code);
        setCameraMessage("Đã scan rổ/BOX: " + normalizeHoldBoxCode(code) + ". Đang gắn vào phiếu...", "green");
        Promise.resolve(confirmSortingTicketBox(idx)).finally(() => { cameraSortingTarget = null; setTimeout(() => closeCameraScanner(), 120); });
        return;
      }

      if (cameraScannerMode === "sorting_item_box") {
        const idx = Number(cameraSortingTarget?.index);
        const input = Number.isFinite(idx) ? document.getElementById("sortingItemBox_" + idx) : null;
        if (!input) { setCameraMessage("Không tìm thấy ô xác nhận rổ đang chọn.", "red"); playSound("error"); return; }
        input.value = normalizeHoldBoxCode(code);
        setCameraMessage("Đã scan rổ: " + normalizeHoldBoxCode(code) + ". Đang kiểm tra đúng/sai...", "green");
        Promise.resolve(confirmSortingItemBox(idx)).finally(() => { cameraSortingTarget = null; setTimeout(() => closeCameraScanner(), 120); });
        return;
      }

      if (cameraScannerMode === "handover") {
        document.getElementById("scanInput").value = code;
        const ok = checkScan();

        if (ok) {
          const scanned = getScannedCount();
          const total = getValidHandoverCount();
          setCameraMessage("Đã scan đúng " + scanned + "/" + total + ": " + code + ". Đang đóng camera...", "green");
          setTimeout(() => closeCameraScanner(), 120);
        } else {
          setCameraMessage("Mã chưa đúng hoặc đã scan rồi: " + code + ". Giữ camera để scan lại.", "red");
        }
        return;
      }
    }


    function dismissMobileKeyboard() {
      try {
        const active = document.activeElement;
        if (active && /^(INPUT|TEXTAREA|SELECT)$/i.test(active.tagName || "")) active.blur();
        // Android Chrome đôi khi vẫn giữ bàn phím nếu vừa set value vào input.
        // Focus tạm vào body/div không nhập liệu để đóng keyboard mà không làm thay đổi logic.
        if (document.body && typeof document.body.focus === "function") {
          if (!document.body.hasAttribute("tabindex")) document.body.setAttribute("tabindex", "-1");
          document.body.focus({ preventScroll: true });
        }
      } catch {}
    }

    function addSuffixFromCamera(value, options = {}) {
      const code = clean(value);
      const shouldFocus = options && options.focus !== false;
      if (!code) return;

      const inputs = [...document.querySelectorAll(".suffix-input")];
      const existed = inputs.some(input => exactEqual(clean(input.value), code));
      if (existed) return;

      const emptyInput = inputs.find(input => !clean(input.value));
      if (emptyInput) {
        emptyInput.value = code;
        if (shouldFocus) emptyInput.focus();
        else emptyInput.blur();
      } else {
        addSuffixInput(code, { focus: shouldFocus });
      }
      if (!shouldFocus) dismissMobileKeyboard();
    }

    async function pasteIntoCameraScanner() {
      let text = "";
      try {
        text = await navigator.clipboard.readText();
      } catch {
        text = prompt("Nhập mã test:");
      }

      if (text) handleCameraScan(text);
    }


    // =========================
    // OCR Lite: chụp mã chữ Shopee, chạy local trên browser, không cần Blaze.
    // Bản tối ưu: khung chụp gọn mobile, crop đúng khung xanh, xử lý ảnh mờ tốt hơn.
    // =========================
    let ocrMode = "location";
    let ocrStream = null;
    let ocrFacingMode = "environment";
    let ocrCapturedDataUrl = "";
    let ocrCapturedVariants = [];
    let ocrBusy = false;
    let ocrLastCandidates = [];
    let ocrWorkerPromise = null;
    let ocrWorkerLogger = null;
    let ocrWarmupStarted = false;
    let ocrWorkerDisabled = false;

    function setOcrStatus(text, color = "") {
      const el = document.getElementById("ocrStatus");
      if (!el) return;
      el.textContent = text || "";
      el.className = "ocr-status " + color;
    }

    async function ensureTesseractJs(options = {}) {
      if (window.Tesseract) return;
      const silent = !!options.silent;
      const urls = [
        "/vendor/tesseract.min.js"
      ];
      let lastError = null;
      for (const url of urls) {
        try {
          if (!silent) setOcrStatus("Đang tải thư viện OCR lần đầu...", "orange");
          await loadExternalScriptOnce(url);
          if (window.Tesseract) return;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("Không tải được thư viện OCR");
    }

    async function ensureOcrWorker(options = {}) {
      await ensureTesseractJs(options);
      if (ocrWorkerDisabled || !window.Tesseract?.createWorker) return null;
      if (!ocrWorkerPromise) {
        ocrWorkerPromise = (async () => {
          try {
            return await window.Tesseract.createWorker("eng", undefined, {workerPath:"/vendor/worker.min.js",corePath:"/vendor/core",langPath:"/vendor/lang",
              logger: m => {
                if (typeof ocrWorkerLogger === "function") ocrWorkerLogger(m);
              }
            });
          } catch (error) {
            console.warn("OCR worker init failed, fallback to direct recognize:", error);
            ocrWorkerPromise = null;
            ocrWorkerDisabled = true;
            return null;
          }
        })();
      }
      return ocrWorkerPromise;
    }

    function warmOcrEngine() {
      if (ocrWarmupStarted || ocrWorkerPromise) return;
      ocrWarmupStarted = true;
      setTimeout(() => {
        ensureOcrWorker({ silent: true }).catch(error => {
          ocrWarmupStarted = false;
          console.warn("OCR warmup failed:", error);
        });
      }, 180);
    }

    async function recognizeOcrVariant(variant, tesseractOptions, onProgress) {
      const worker = await ensureOcrWorker();
      if (worker?.recognize) {
        const params = { ...(tesseractOptions || {}) };
        delete params.logger;
        try {
          if (worker.setParameters) await worker.setParameters(params);
          ocrWorkerLogger = onProgress || null;
          return await worker.recognize(variant.dataUrl);
        } catch (error) {
          console.warn("OCR worker recognize failed, fallback to direct recognize:", error);
          ocrWorkerPromise = null;
          ocrWorkerDisabled = true;
        } finally {
          ocrWorkerLogger = null;
        }
      }
      return window.Tesseract.recognize(variant.dataUrl, "eng", {...tesseractOptions,workerPath:"/vendor/worker.min.js",corePath:"/vendor/core",langPath:"/vendor/lang"});
    }


    function normalizeOcrText(text) {
      return String(text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\uFF1A/g, ":")
        .replace(/[：]/g, ":")
        .replace(/[|¦]/g, " ")
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/[\t\r]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function cleanOcrOrderCode(value) {
      // QUAN TRỌNG: giữ nguyên HOA/thường 100%, không ép .toUpperCase().
      // Barcode/bàn giao hiện so sánh không phân biệt HOA/thường; OCR vẫn giữ ký tự gốc để user dễ kiểm tra.
      return String(value || "")
        .replace(/[^A-Za-z0-9]/g, "")
        .trim();
    }


    function stripOcrInputCursorArtifact(code) {
      const c = cleanOcrOrderCode(code);
      if (!c || c.length < 12 || c.length > 26) return c;

      // Khi chụp dòng mã trên thanh nhập liệu Chrome/Google, con trỏ cuối dòng "|"
      // rất hay bị OCR thành I/l/1 và dính sát vào mã. Ví dụ ảnh test:
      // jivy0903211JYV| -> jivy0903211JYVI. Ký tự I cuối này KHÔNG thuộc mã.
      if (!/[Iil1]$/.test(c)) return c;
      const withoutLast = c.slice(0, -1);

      // Chỉ bỏ đúng 1 nét đứng cuối nếu phía trước đã có dạng mã rõ:
      // có cụm số ở giữa và kết thúc bằng cụm chữ 2-4 ký tự, như ...3211JYV.
      // Không đụng ký tự I/l/1 nằm trong thân mã để tránh sửa bừa.
      if (!/[0-9]{4,}[A-Za-z]{2,4}$/.test(withoutLast)) return c;
      if (!/^[A-Za-z]{2,10}[A-Za-z0-9]{4,18}[A-Za-z]{2,4}$/.test(withoutLast)) return c;
      return withoutLast;
    }





    function getOcrTerminalCaretDropCandidate(code) {
      const c = cleanOcrOrderCode(code);
      if (!c || c.length < 8 || c.length > 30) return "";

      // Dấu nhấp/caret cuối ô nhập trên Chrome/Google là một nét đứng rất mảnh.
      // Tesseract thường đọc nét này thành I / l / 1 và ghép sát vào cuối mã.
      // Không sửa đại trà: chỉ tạo biến thể bỏ 1 ký tự cuối để đem đi xác minh
      // bằng ảnh hoặc database, tránh làm mất ký tự thật nếu mã thật kết thúc bằng 1/I.
      if (!/[Iil1]$/.test(c)) return "";
      const base = c.slice(0, -1);
      if (base.length < 6) return "";

      const digitCount = (base.match(/[0-9]/g) || []).length;
      const letterCount = (base.match(/[A-Za-z]/g) || []).length;
      if (digitCount < 4 || letterCount < 1) return "";

      // Cursor thường dính sau mã có đuôi chữ, ví dụ ...QWHT| hoặc ...JYV|.
      // Nếu ký tự trước đó là số thì không tự tạo biến thể vì có thể là số 1 thật.
      if (!/[A-Za-z]{2,6}$/.test(base)) return "";
      if (/SHOPEE|MADON|DONHANG|KIEM|TRA|GOOGLE|SHEETS|CHROME/i.test(base)) return "";
      return base;
    }

    function fixOcrCaseByShopeePrintedPattern(code) {
      const c = cleanOcrOrderCode(code);
      if (!c) return c;

      // Fix thực tế từ ảnh test: mã in trên tem/app Shopee dạng bắt đầu bằng số
      // như 26052240QQC4C3, Tesseract rất hay đọc C/K/Q/S/G thành chữ thường.
      // Với loại mã bắt đầu bằng số, mã Shopee/SPX in sau nhãn thường dùng CHỮ HOA.
      // Chỉ áp dụng cho mã bắt đầu bằng số để không làm hỏng các mã người dùng nhập
      // dạng chữ thường ở đầu, ví dụ jivy0903211JYV.
      const digitCount = (c.match(/[0-9]/g) || []).length;
      const letterCount = (c.match(/[A-Za-z]/g) || []).length;
      if (
        /^[0-9]/.test(c) &&
        /[a-z]/.test(c) &&
        c.length >= 10 &&
        c.length <= 24 &&
        digitCount >= 4 &&
        letterCount >= 2
      ) {
        return c.replace(/[a-z]/g, ch => ch.toUpperCase());
      }

      return c;
    }

    function fixOcrKnownShopeeCodePattern(code) {
      const c = cleanOcrOrderCode(code);
      if (!c) return c;

      // QUAN TRỌNG: không tự sửa O/0/Q theo format đoán nữa.
      // Lý do: nếu OCR đọc 0 thành O hoặc O thành 0 thì chỉ camera/OCR không có đủ dữ liệu
      // để biết ký tự thật. Tự ép theo vị trí có thể làm sai mã thật.
      // Chỉ được sửa ký tự dễ nhầm khi có danh sách đơn thật để đối chiếu duy nhất.
      return c;
    }

    function normalizeOcrCandidateCode(code) {
      let c = stripOcrInputCursorArtifact(cleanOcrOrderCode(code));
      if (!c || c.length < 10 || c.length > 24) return c;

      // QUAN TRỌNG: không tự quy đổi O/0, I/1, S/5... trong mã OCR.
      // Chỉ fix riêng lỗi HOA/thường có quy luật chắc hơn: mã Shopee/SPX in sau nhãn
      // mà BẮT ĐẦU BẰNG SỐ thường dùng chữ HOA. Tesseract hay đọc C thành c.
      // Không áp dụng cho mã bắt đầu bằng chữ như jivy0903211JYV để giữ đúng chữ thường.
      c = fixOcrKnownShopeeCodePattern(c);
      c = fixOcrCaseByShopeePrintedPattern(c);
      return c;
    }

    function getOcrLabelKey(value) {
      return normalizeOcrText(value)
        .replace(/Đ/g, "D")
        .replace(/đ/g, "d")
        .toUpperCase()
        .replace(/0/g, "O")
        .replace(/Q/g, "O")
        .replace(/4/g, "A")
        .replace(/3/g, "E")
        .replace(/5/g, "S");
    }

    function getFirstCodeAfterLabel(segment) {
      // Line-only strict parser: chỉ lấy đúng token mã ngay sau nhãn "Mã đơn hàng".
      // Không ghép tiếp các chữ hướng dẫn bên dưới như "Kiem/Tra/Chi/Nhan...".
      const s = normalizeOcrText(segment)
        .replace(/[.,;]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!s) return "";

      const STOP_WORDS = /^(KIEM|KIỂM|TRA|KY|KỸ|MA|MÃ|DON|ĐON|ĐƠN|HANG|HÀNG|CHI|CHỈ|NHAN|NHẬN|TRUNG|TRÙNG|KHONG|KHÔNG|CAN|CẦN|GOI|GỌI|TRUOC|TRƯỚC|NEU|NẾU|LAY|LẤY|HOAC|HOẶC|TAI|TẠI|KHO|SRETAIL|RETAIL|HUB|VNWL|HNI|HCM|SO|SỐ|LUONG|LƯỢNG|TRONG|TRỌNG|GOOGLE|SHEETS?|SHEET|FUNC|FUNCTION|CHROME|BOOKMARKS?|MOVE|TAN|BINH|SOC|MEGA|FOR|SHOP|SHOPEE|PHUONG|PHƯỜNG|QUAN|QUẬN|THANH|GOVAP|DATABASE|CLOUD|SHELL|TERMINAL)$/i;
      const STOP_INSIDE = /(KIEM|TRA|CHINHAN|NHAN|TRUNG|KHONG|GOITRUOC|TRUOC|NEULAY|LAY|HOAC|TAIKHO|KHO|SRETAIL|RETAIL|SOLUONG|TRONGLUONG|GOOGLE|SHEETS|CHROME|BOOKMARK|HCM|PHUONG|QUAN|GOVAP|DATABASE|CLOUD|SHELL|TERMINAL)/i;

      function looksStrictShopeeCode(value) {
        const c = normalizeOcrCandidateCode(cleanOcrOrderCode(value));
        if (!c || c.length < 6 || c.length > 30) return false;
        const digitCount = (c.match(/[0-9]/g) || []).length;
        const letterCount = (c.match(/[A-Za-z]/g) || []).length;
        // Sau nhãn Shopee thì mã có thể toàn số; không bắt buộc phải có chữ.
        if (digitCount < 4) return false;
        if (letterCount === c.length) return false;
        if (STOP_INSIDE.test(c)) return false;
        return true;
      }

      function isNaturalWordToken(token) {
        const t = cleanOcrOrderCode(token);
        if (!t) return true;
        if (STOP_WORDS.test(t)) return true;
        // Các chữ mô tả tiếng Việt/tiếng Anh sau mã thường là chữ thường hoặc chữ Hoa-Thường như Kiem, Google.
        // Không cho nối vào mã nếu token chỉ có chữ và không phải cụm chữ HOA ngắn kiểu JYV/GKQ/XCBET.
        if (/^[A-Za-z]+$/.test(t) && !/^[A-Z]{1,5}$/.test(t)) return true;
        if (/^[A-Za-z]+$/.test(t) && t.length >= 6) return true;
        return false;
      }

      function canContinueCode(joined, token) {
        const t = cleanOcrOrderCode(token);
        if (!t || STOP_WORDS.test(t)) return false;
        if ((joined + t).length > 30) return false;
        if (STOP_INSIDE.test(t)) return false;
        if (/[0-9]/.test(t)) return true;
        // Cho phép đuôi chữ HOA ngắn của mã: JYV, GKQ, XCBET.
        if (/^[A-Z]{1,5}$/.test(t)) return true;
        return false;
      }

      // Nếu OCR dính sát chữ hướng dẫn vào mã: "26052241XCBET7Kiem", cắt tại từ dừng.
      const compactHead = s.replace(/[^A-Za-z0-9]/g, "");
      const stuck = compactHead.match(/^([A-Za-z0-9]{6,30}?)(?=Kiem|Tra|Chi|Nhan|Trung|Khong|Can|Goi|Truoc|Neu|Lay|Hoac|Tai|Kho|So|Luong|Trong|Google|Sheets|Chrome|HCM|Phuong|Quan|Gova?p)/i);
      if (stuck && looksStrictShopeeCode(stuck[1])) return normalizeOcrCandidateCode(stuck[1]);

      const tokens = s.match(/[A-Za-z0-9]{1,}/g) || [];
      for (let start = 0; start < Math.min(tokens.length, 4); start++) {
        let joined = "";
        let bestForStart = "";

        for (let end = start; end < Math.min(tokens.length, start + 6); end++) {
          const token = tokens[end];
          if (!token) continue;

          if (!joined) {
            if (STOP_WORDS.test(token)) continue;
            joined = cleanOcrOrderCode(token);
          } else {
            // Nếu mã hiện tại đã đủ chuẩn, gặp chữ tự nhiên phía sau thì dừng ngay, không lấy thêm 1 ký tự nào.
            if (looksStrictShopeeCode(joined) && isNaturalWordToken(token)) break;
            if (!canContinueCode(joined, token)) break;
            joined += cleanOcrOrderCode(token);
          }

          const cleaned = normalizeOcrCandidateCode(joined);
          if (looksStrictShopeeCode(cleaned)) bestForStart = cleaned;
        }

        if (bestForStart) return bestForStart;
      }

      // Fallback an toàn: chỉ lấy token đầu tiên sau nhãn nếu chính nó đã là mã hợp lệ.
      const direct = tokens.find(t => looksStrictShopeeCode(t));
      return direct ? normalizeOcrCandidateCode(direct) : "";
    }

    function scoreOcrCandidate(code, source = "") {
      let score = 0;
      if (!code) return score;
      const upper = String(code).toUpperCase();
      if (source === "label") score += 1200;
      if (/^[0-9]/.test(code)) score += 20;
      if (code.length >= 10 && code.length <= 24) score += 35;
      if (code.length >= 12 && code.length <= 18) score += 25;
      if (/[A-Za-z]/.test(code) && /[0-9]/.test(code)) score += 28;
      // Nếu OCR thật sự đọc ra chữ thường thì cộng nhẹ để không bị bản ép HOA cũ lấn át.
      if (/[a-z]/.test(code)) score += 12;
      if (/[a-z]/.test(code) && /[A-Z]/.test(code)) score += 8;
      if (/SHOPEE|MADON|DONHANG|HANGSHOPEE|PHUONG|QUAN|THANH|HCM/.test(upper)) score -= 700;
      return score;
    }


    function medianNumber(values) {
      const arr = (values || []).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
      if (!arr.length) return 0;
      const mid = Math.floor(arr.length / 2);
      return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    }

    function clampInt(value, min, max) {
      const n = Math.round(Number(value) || 0);
      return Math.max(min, Math.min(max, n));
    }

    function getTesseractWordList(data) {
      const out = [];
      function addWord(w) {
        if (!w) return;
        const text = String(w.text || w.symbol || "").trim();
        const bbox = w.bbox || w.boundingBox || w;
        const x0 = Number(bbox.x0 ?? bbox.left ?? bbox.x ?? 0);
        const y0 = Number(bbox.y0 ?? bbox.top ?? bbox.y ?? 0);
        const x1 = Number(bbox.x1 ?? (bbox.left != null && bbox.width != null ? bbox.left + bbox.width : 0));
        const y1 = Number(bbox.y1 ?? (bbox.top != null && bbox.height != null ? bbox.top + bbox.height : 0));
        if (!text || !(x1 > x0) || !(y1 > y0)) return;
        out.push({ text, bbox: { x0, y0, x1, y1 } });
      }
      if (Array.isArray(data?.words)) data.words.forEach(addWord);
      if (Array.isArray(data?.lines)) {
        data.lines.forEach(line => {
          if (Array.isArray(line?.words)) line.words.forEach(addWord);
        });
      }
      return out;
    }

    function findOcrWordForVisualCode(data, code) {
      const target = cleanOcrOrderCode(code);
      if (!target) return null;
      const words = getTesseractWordList(data);
      let best = null;
      let bestScore = -1;
      for (const word of words) {
        const cleaned = cleanOcrOrderCode(word.text);
        if (!cleaned) continue;
        let score = 0;
        if (cleaned === target) score = 1000;
        else if (cleaned.startsWith(target) && cleaned.length <= target.length + 2) score = 800;
        else if (target.startsWith(cleaned) && target.length <= cleaned.length + 2) score = 700;
        else if (cleaned.includes(target)) score = 600;
        else continue;
        score -= Math.abs(cleaned.length - target.length) * 25;
        if (score > bestScore) { bestScore = score; best = word; }
      }
      return best;
    }

    function getDarkPixelMaskInfo(canvas, x0, y0, x1, y1) {
      if (!canvas || !canvas.width || !canvas.height) return null;
      x0 = clampInt(x0, 0, canvas.width - 1);
      x1 = clampInt(x1, 1, canvas.width);
      y0 = clampInt(y0, 0, canvas.height - 1);
      y1 = clampInt(y1, 1, canvas.height);
      if (x1 <= x0 || y1 <= y0) return null;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const w = x1 - x0;
      const h = y1 - y0;
      const img = ctx.getImageData(x0, y0, w, h).data;
      const gray = [];
      for (let i = 0; i < img.length; i += 4) {
        gray.push(0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2]);
      }
      const sorted = gray.slice().sort((a, b) => a - b);
      const p18 = sorted[Math.floor(sorted.length * 0.18)] || 90;
      const p82 = sorted[Math.floor(sorted.length * 0.82)] || 230;
      const threshold = Math.max(70, Math.min(190, (p18 + p82) / 2 - 8));
      const colCounts = new Array(w).fill(0);
      const rowCounts = new Array(h).fill(0);
      const dark = new Uint8Array(w * h);
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          const idx = yy * w + xx;
          if (gray[idx] < threshold) {
            dark[idx] = 1;
            colCounts[xx]++;
            rowCounts[yy]++;
          }
        }
      }
      return { w, h, dark, colCounts, rowCounts, x0, y0 };
    }

    function getInkBoundsFromMask(info, sx0, sx1) {
      if (!info) return null;
      sx0 = clampInt(sx0, 0, info.w - 1);
      sx1 = clampInt(sx1, 1, info.w);
      if (sx1 <= sx0) return null;
      let minX = info.w, minY = info.h, maxX = -1, maxY = -1, area = 0;
      for (let y = 0; y < info.h; y++) {
        for (let x = sx0; x < sx1; x++) {
          if (!info.dark[y * info.w + x]) continue;
          area++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < minX || maxY < minY || area < 4) return null;
      return {
        x0: minX, x1: maxX, y0: minY, y1: maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        area
      };
    }

    function getProjectedGlyphGroups(info) {
      if (!info) return [];
      const minDark = Math.max(1, Math.round(info.h * 0.035));
      const raw = [];
      let inGroup = false;
      let start = 0;
      for (let x = 0; x < info.w; x++) {
        const hasInk = info.colCounts[x] >= minDark;
        if (hasInk && !inGroup) { start = x; inGroup = true; }
        else if (!hasInk && inGroup) { raw.push([start, x - 1]); inGroup = false; }
      }
      if (inGroup) raw.push([start, info.w - 1]);

      const merged = [];
      for (const g of raw) {
        if (merged.length && g[0] - merged[merged.length - 1][1] <= 3) {
          merged[merged.length - 1][1] = g[1];
        } else {
          merged.push(g);
        }
      }
      return merged
        .map(g => ({ range: g, ink: getInkBoundsFromMask(info, g[0], g[1] + 1) }))
        .filter(g => g.ink && g.ink.width >= 2 && g.ink.area >= 8);
    }

    function getVisualGlyphMetricsForWord(canvas, word, code) {
      if (!canvas || !word || !word.bbox) return [];
      const cleanWord = cleanOcrOrderCode(word.text);
      const target = cleanOcrOrderCode(code);
      if (!target || !cleanWord) return [];

      let bbox = word.bbox;
      const padX = Math.max(3, Math.round((bbox.x1 - bbox.x0) * 0.04));
      const padY = Math.max(3, Math.round((bbox.y1 - bbox.y0) * 0.14));
      let x0 = bbox.x0 - padX, x1 = bbox.x1 + padX;
      let y0 = bbox.y0 - padY, y1 = bbox.y1 + padY;
      const info = getDarkPixelMaskInfo(canvas, x0, y0, x1, y1);
      if (!info) return [];

      const groups = getProjectedGlyphGroups(info);
      // Bỏ con trỏ nhập liệu cuối dòng nếu nó bị dính vào bbox: nét rất mảnh nhưng cao.
      const heights = groups.map(g => g.ink.height);
      const medH = medianNumber(heights) || 1;
      let usable = groups.slice();
      if (usable.length > target.length) {
        usable = usable.filter((g, idx) => {
          const isLast = idx >= usable.length - 2;
          const thinTallCursor = g.ink.width <= 5 && g.ink.height >= medH * 1.18;
          return !(isLast && thinTallCursor);
        });
      }

      const metrics = [];
      if (usable.length === target.length) {
        usable.forEach((g, idx) => metrics.push({ ...g.ink, char: target[idx], index: idx, method: "projection" }));
        return metrics;
      }

      // Fallback chia đều theo số ký tự nếu projection không tách đủ ký tự.
      const len = target.length;
      for (let i = 0; i < len; i++) {
        const sx0 = Math.floor(info.w * i / len);
        const sx1 = Math.ceil(info.w * (i + 1) / len);
        const ink = getInkBoundsFromMask(info, sx0, sx1);
        if (ink) metrics.push({ ...ink, char: target[i], index: i, method: "equal" });
      }
      return metrics;
    }


    function visuallyStripTerminalInputCursor(code, resultData, canvas) {
      const c = cleanOcrOrderCode(code);
      const drop = getOcrTerminalCaretDropCandidate(c);
      if (!drop || !canvas || !resultData) return { code: c, changed: false, detail: "" };

      const word = findOcrWordForVisualCode(resultData, c) || findOcrWordForVisualCode(resultData, drop);
      const metrics = getVisualGlyphMetricsForWord(canvas, word, c);
      if (!metrics || metrics.length < Math.min(c.length, 8)) return { code: c, changed: false, detail: "" };

      const last = metrics.find(m => m.index === c.length - 1) || metrics[metrics.length - 1];
      if (!last) return { code: c, changed: false, detail: "" };

      const refs = metrics
        .filter(m => m.index < c.length - 1 && !/[1Iil]/.test(String(m.char || "")) && m.width >= 4 && m.height >= 8);
      const fallbackRefs = metrics
        .filter(m => m.index < c.length - 1 && m.width >= 3 && m.height >= 7);
      const sample = refs.length >= 4 ? refs : fallbackRefs;
      const medW = medianNumber(sample.map(m => m.width));
      const medH = medianNumber(sample.map(m => m.height));
      const medArea = medianNumber(sample.map(m => m.area));
      if (!medW || !medH || !medArea) return { code: c, changed: false, detail: "" };

      const thin = last.width <= Math.max(4, medW * 0.50);
      const tallEnough = last.height >= medH * 0.72;
      const lowInk = last.area <= medArea * 0.72;

      // Chỉ bỏ khi nét cuối thật sự giống con trỏ: mảnh, cao, ít mực.
      // Nếu không đủ chắc thì để nguyên và nhờ bước Check location xác minh database.
      if (thin && tallEnough && lowInk) {
        return {
          code: drop,
          changed: true,
          detail: `bỏ ký tự cuối ${c.slice(-1)} vì giống dấu nhấp/caret cuối ô nhập`
        };
      }
      return { code: c, changed: false, detail: "" };
    }

    function visuallyFixO0InCode(code, resultData, canvas) {
      const c = cleanOcrOrderCode(code);
      if (!c || !/[O0Qoq]/.test(c) || !canvas || !resultData) return { code: c, changed: false, detail: "" };
      const word = findOcrWordForVisualCode(resultData, c);
      const metrics = getVisualGlyphMetricsForWord(canvas, word, c);
      if (!metrics || metrics.length < Math.min(6, c.length)) return { code: c, changed: false, detail: "" };

      const refs = metrics.filter(m => !/[O0Qoq1Iil]/.test(m.char) && m.width >= 4 && m.height >= 8);
      const refWidths = (refs.length >= 4 ? refs : metrics.filter(m => !/[1Iil]/.test(m.char) && m.width >= 4)).map(m => m.width);
      const refAreas = (refs.length >= 4 ? refs : metrics.filter(m => !/[1Iil]/.test(m.char) && m.area >= 8)).map(m => m.area);
      const medW = medianNumber(refWidths);
      const medArea = medianNumber(refAreas);
      if (!medW || !medArea) return { code: c, changed: false, detail: "" };

      const chars = c.split("");
      const changes = [];
      for (const m of metrics) {
        const ch = chars[m.index];
        if (!/[O0Qoq]/.test(ch)) continue;
        const widthRatio = m.width / medW;
        const areaRatio = m.area / medArea;

        // Shopee/Chrome font: CHỮ O thường tròn và rộng hơn số 0. Chỉ đổi khi hình thật sự rộng hơn rõ ràng.
        // Không dùng đổi đại trà để tránh làm sai các số 0 thật như 2605223V0K...
        if (ch === "0" && widthRatio >= 1.18 && areaRatio >= 1.08) {
          chars[m.index] = "O";
          changes.push(`vị trí ${m.index + 1}: 0→O theo nét chữ rộng hơn`);
        } else if ((ch === "O" || ch === "o") && widthRatio <= 0.82 && areaRatio <= 0.95) {
          chars[m.index] = "0";
          changes.push(`vị trí ${m.index + 1}: ${ch}→0 theo nét chữ hẹp hơn`);
        }
      }

      const fixed = chars.join("");
      return { code: fixed, changed: fixed !== c, detail: changes.join("; ") };
    }

    function mergeOcrCandidateLists(primary, secondary) {
      const out = [];
      const seen = new Set();
      [...(primary || []), ...(secondary || [])].forEach(item => {
        if (!item || !item.code) return;
        const key = cleanOcrOrderCode(item.code);
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(item);
      });
      return out.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 2);
    }

    function refineOcrCandidatesByVisualO0(candidates, resultData, canvas) {
      const base = candidates || [];
      const fixed = [];
      base.forEach(item => {
        const caret = visuallyStripTerminalInputCursor(item.code, resultData, canvas);
        const caretBaseItem = (caret.changed && caret.code && caret.code !== item.code)
          ? {
              ...item,
              code: caret.code,
              note: `${item.note || "Sau dòng Mã đơn hàng"} • Đã bỏ dấu nhấp cuối dòng`,
              score: (item.score || 0) + 760,
              caretDetail: caret.detail
            }
          : null;
        if (caretBaseItem) fixed.push(caretBaseItem);

        const visualSource = caretBaseItem || item;
        const visual = visuallyFixO0InCode(visualSource.code, resultData, canvas);
        if (visual.changed && visual.code && visual.code !== visualSource.code) {
          fixed.push({
            ...visualSource,
            code: visual.code,
            note: `${visualSource.note || "Sau dòng Mã đơn hàng"} • Đã phân biệt O/0 bằng nét ảnh`,
            score: (visualSource.score || 0) + 420,
            visualO0Detail: visual.detail
          });
        }
      });
      return mergeOcrCandidateLists(fixed, base);
    }

    function extractOcrCandidates(rawText) {
      // Bản chính xác hơn: chỉ lấy mã nằm sau dòng "Mã đơn hàng".
      // Không fallback đọc mọi chữ trong ảnh nữa, vì dễ gợi ý sai như TERMINAL / DATABASE.
      // Điểm fix chính: giữ nguyên chữ thường/chữ hoa, không tự đổi jivy -> JIVY.
      const candidates = new Map();
      const raw = String(rawText || "");
      const rawLines = raw
        .split(/\n+/)
        .map(x => normalizeOcrText(x))
        .map(x => x.replace(/[.,;]+/g, " ").replace(/\s+/g, " ").trim())
        .filter(Boolean);

      function isLikelyShopeeCode(code, source = "") {
        const c = cleanOcrOrderCode(code);
        const upper = c.toUpperCase();
        if (!c || c.length < 6 || c.length > 30) return false;
        const digitCount = (c.match(/[0-9]/g) || []).length;
        const letterCount = (c.match(/[A-Za-z]/g) || []).length;

        // Vì đã xác định nằm SAU nhãn "Mã đơn hàng", cho phép cả mã toàn số.
        // Lỗi cũ: bắt buộc có >=2 chữ và dài >=10 nên mã test 123456789 bị báo không thấy dòng.
        if (digitCount < 4) return false;
        if (letterCount === c.length) return false;

        // Không để chữ hướng dẫn / địa chỉ / trình duyệt dính vào mã.
        if (/SHOPEE|MADON|DONHANG|HANGSHOPEE|KIEM|TRA|CHINHAN|NHAN|TRUNG|KHONG|GOITRUOC|TRUOC|NEULAY|LAY|HOAC|TAIKHO|KHO|SOLUONG|TRONGLUONG|CLOUD|SHELL|TERMINAL|DATABASE|GOOGLE|SHEETS|CHROME|SEARCH|PHUONG|QUAN|THANH|HCM|GOVAP/.test(upper)) return false;
        return true;
      }

      function add(code, source, note = "") {
        const cleaned = normalizeOcrCandidateCode(cleanOcrOrderCode(code));
        if (!isLikelyShopeeCode(cleaned, source)) return;
        const key = cleaned;
        const prev = candidates.get(key) || { code: cleaned, source, note, count: 0, score: 0 };
        prev.count += 1;
        prev.source = source || prev.source || "label";
        prev.note = note || prev.note || "Sau dòng Mã đơn hàng";
        prev.score = Math.max(prev.score || 0, scoreOcrCandidate(cleaned, prev.source)) + prev.count * 8;
        candidates.set(key, prev);
      }

      function extractAfterShopeeLabel(line) {
        const original = normalizeOcrText(line)
          .replace(/[.,;]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const upper = getOcrLabelKey(original);

        // Pattern chịu được OCR đọc dư chữ e: shopee / shopeee / shopeeee.
        // Key ở trên chỉ sửa nhãn, không sửa mã: 5h0pee/sh0pee/shop cũng vẫn nhận được.
        // Dùng upper để tìm nhãn, nhưng cắt chuỗi original để GIỮ NGUYÊN HOA/thường của mã.
        const labelPatterns = [
          /MA{1,2}\s*DON\s*HANG\s*SHOP[EFA]{0,4}\s*[:\-]?\s*/i,
          /MA\s*DON\s*HANG\s*SHOP[EFA]{0,4}\s*[:\-]?\s*/i,
          /MA\s*DON\s*SHOP[EFA]{0,4}\s*[:\-]?\s*/i,
          /DON\s*HANG\s*SHOP[EFA]{0,4}\s*[:\-]?\s*/i,
          /HANG\s*SHOP[EFA]{0,4}\s*[:\-]?\s*/i,
          /ANG\s*SHOP[EFA]{0,4}\s*[:\-]?\s*/i,
          /SHOP[EFA]{0,4}\s*[:\-]?\s*/i
        ];

        for (const pattern of labelPatterns) {
          const m = upper.match(pattern);
          if (!m) continue;
          const after = original.slice(m.index + m[0].length);
          const code = getFirstCodeAfterLabel(after);
          if (code) return code;
        }
        return "";
      }

      function lineHasShopeeLabel(line) {
        const original = normalizeOcrText(line)
          .replace(/[.,;]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (!original) return false;
        const upper = getOcrLabelKey(original);
        const labelPatterns = [
          /MA{1,2}\s*DON\s*HANG\s*SHOP[EFA]{0,4}\s*[:\-]?\s*/i,
          /MA\s*DON\s*HANG\s*SHOP[EFA]{0,4}\s*[:\-]?\s*/i,
          /MA\s*DON\s*SHOP[EFA]{0,4}\s*[:\-]?\s*/i,
          /DON\s*HANG\s*SHOP[EFA]{0,4}\s*[:\-]?\s*/i,
          /HANG\s*SHOP[EFA]{0,4}\s*[:\-]?\s*/i,
          /ANG\s*SHOP[EFA]{0,4}\s*[:\-]?\s*/i,
          /SHOP[EFA]{0,4}\s*[:\-]?\s*/i
        ];
        return labelPatterns.some(pattern => pattern.test(upper));
      }

      // Ưu tiên mã nằm cùng dòng với nhãn. Nếu màn tài xế tự xuống dòng
      // thành "Mã đơn hàng:" rồi dòng kế tiếp mới là mã, chỉ lấy đúng
      // 1 dòng mã ngay bên dưới nhãn. Không ghép chữ hướng dẫn/location.
      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        const sameLineCandidate = extractAfterShopeeLabel(line);
        if (sameLineCandidate) {
          add(sameLineCandidate, "label", "Cùng dòng Mã đơn hàng");
          continue;
        }

        if (!lineHasShopeeLabel(line)) continue;

        for (let offset = 1; offset <= 2 && i + offset < rawLines.length; offset++) {
          const nextLine = rawLines[i + offset];
          if (!nextLine || lineHasShopeeLabel(nextLine)) break;
          const wrappedCandidate = getFirstCodeAfterLabel(nextLine);
          if (wrappedCandidate) {
            add(wrappedCandidate, "label", "Dòng mã bên dưới Mã đơn hàng");
            break;
          }
        }
      }

      return Array.from(candidates.values())
        .sort((a, b) => (b.score || 0) - (a.score || 0) || (b.count || 0) - (a.count || 0))
        .slice(0, 2);
    }

    function hasStrongOcrCandidate(candidates) {
      return (candidates || []).some(item => item && item.source === "label" && item.code && item.code.length >= 12);
    }

    function hasOcrAmbiguousCandidate(candidates) {
      return (candidates || []).some(item => item && item.code && getOcrAmbiguousGroups(item.code).length);
    }


    function buildOcrConfusionVariants(code) {
      const original = cleanOcrOrderCode(code);
      if (!original || original.length < 10 || original.length > 24) return [];

      // Chỉ dùng khi có danh sách đối chiếu thật (bàn giao), KHÔNG dùng để đoán mù ở bước check location.
      // Nhóm ký tự OCR dễ nhầm do nét giống nhau:
      // O/0/Q, I/J/l/1, V/Y, S/5, B/8, Z/2, G/6.
      const alternatives = {
        "O": ["0", "Q"], "o": ["0", "q"], "0": ["O", "o", "Q", "q"], "Q": ["O", "0"], "q": ["o", "0"],
        "I": ["J", "1", "l"], "J": ["I", "1", "l"], "i": ["j", "1", "l"], "j": ["i", "1", "l"], "l": ["I", "J", "1", "i", "j"], "1": ["I", "J", "i", "j", "l"],
        "V": ["Y"], "Y": ["V"], "v": ["y"], "y": ["v"],
        "S": ["5"], "s": ["5"], "5": ["S", "s"],
        "B": ["8"], "b": ["8"], "8": ["B", "b"],
        "Z": ["2"], "z": ["2"], "2": ["Z", "z"],
        "G": ["6"], "g": ["6"], "6": ["G", "g"],
        "T": ["7"], "t": ["7"], "7": ["T", "t"],
        "A": ["4"], "a": ["4"], "4": ["A", "a"]
      };

      const positions = [];
      for (let i = 0; i < original.length; i++) {
        const alts = alternatives[original[i]];
        if (alts && alts.length) positions.push({ index: i, from: original[i], alts });
      }

      const variants = [];
      function pushVariant(changes) {
        const chars = original.split("");
        const desc = [];
        changes.forEach(pos => {
          chars[pos.index] = pos.alt;
          desc.push(`${pos.from}→${pos.alt}`);
        });
        const value = chars.join("");
        if (value !== original && !variants.some(v => v.code === value)) {
          variants.push({
            code: value,
            changed: changes.length,
            reason: `Gợi ý sửa OCR ${desc.join(", ")}`
          });
        }
      }

      // Ưu tiên sửa 1 ký tự trước vì ít rủi ro nhất.
      for (const pos of positions.slice(0, 8)) {
        for (const alt of pos.alts.slice(0, 5)) {
          pushVariant([{ ...pos, alt }]);
          if (variants.length >= 30) return variants;
        }
      }

      // Nếu ảnh mờ có thể sai 2 ký tự, thử thêm một số cặp đầu tiên; chỉ chấp nhận nếu khớp duy nhất danh sách bàn giao.
      for (let a = 0; a < Math.min(positions.length, 5); a++) {
        for (let b = a + 1; b < Math.min(positions.length, 6); b++) {
          for (const altA of positions[a].alts.slice(0, 2)) {
            for (const altB of positions[b].alts.slice(0, 2)) {
              pushVariant([{ ...positions[a], alt: altA }, { ...positions[b], alt: altB }]);
              if (variants.length >= 40) return variants;
            }
          }
        }
      }

      return variants.slice(0, 40);
    }

    function makeOcrLooseKey(value) {
      // Chỉ dùng để đối chiếu với danh sách bàn giao đã có sẵn.
      // Không dùng để tự sửa khi check location.
      // Gom các ký tự có nét tương đồng để tìm mã khớp duy nhất, sau đó vẫn trả về mã thật trong danh sách.
      return cleanOcrOrderCode(value)
        .split("")
        .map(ch => {
          const lower = ch.toLowerCase();
          if (lower === "i" || lower === "j" || lower === "l" || ch === "1" || ch === "|") return "#";
          if (lower === "v" || lower === "y") return "$";
          if (lower === "o" || lower === "q" || ch === "0") return "%";
          if (lower === "s" || ch === "5") return "&";
          if (lower === "b" || ch === "8") return "*";
          if (lower === "z" || ch === "2") return "@";
          if (lower === "g" || ch === "6") return "?";
          if (lower === "t" || ch === "7") return "~";
          if (lower === "a" || ch === "4") return "^";
          return lower;
        })
        .join("");
    }

    function getOcrAmbiguousGroups(code) {
      const c = cleanOcrOrderCode(code);
      const groups = [];
      if (/[O0Qoq]/.test(c)) groups.push("O/0/Q");
      if (/[IJilj1|]/.test(c)) groups.push("I/J/l/1");
      if (/[VYvy]/.test(c)) groups.push("V/Y");
      if (/[S5s]/.test(c)) groups.push("S/5");
      if (/[B8b]/.test(c)) groups.push("B/8");
      if (/[Z2z]/.test(c)) groups.push("Z/2");
      if (/[G6g]/.test(c)) groups.push("G/6");
      if (/[T7t]/.test(c)) groups.push("T/7");
      if (/[A4a]/.test(c)) groups.push("A/4");
      return groups;
    }


    function getOcrCharTypeLabel(ch) {
      if (ch === "0") return "SỐ 0";
      if (ch === "O") return "CHỮ O";
      if (ch === "o") return "chữ o";
      if (ch === "Q") return "CHỮ Q";
      if (ch === "q") return "chữ q";
      return "";
    }

    function renderOcrCharacterGuide(code, candidateIndex = 0) {
      const c = cleanOcrOrderCode(code);
      if (!c) return "";
      const hasO0 = /[O0Qoq]/.test(c);
      if (!hasO0) return "";

      // Chỉ hiển thị các vị trí O/0/Q để không che mất nút Lấy mã trên điện thoại.
      const boxes = c.split("").map((ch, idx) => {
        const label = getOcrCharTypeLabel(ch);
        if (!label) return "";
        return `<button class="ocr-char-box o0" type="button" data-o0-toggle="${candidateIndex}:${idx}" title="Bấm để đổi 0/O/Q ở vị trí ${idx + 1}: ${label}"><span class="ch">${escapeHtml(ch)}</span><span class="pos">${escapeHtml(label)}</span></button>`;
      }).join("");
      const legend = `<div class="ocr-char-legend">Ô cam là ký tự dễ nhầm: <b>0 = số không</b>, <b>O = chữ O</b>, <b>Q = chữ Q</b>. App tự phân biệt khi nét ảnh đủ rõ; bấm ô cam để đổi 0/O/Q nếu ảnh mờ.</div>`;
      return `<div class="ocr-char-guide">${boxes}</div>${legend}`;
    }

    function getOcrO0ReviewText(code) {
      const c = cleanOcrOrderCode(code);
      const parts = [];
      for (let i = 0; i < c.length; i++) {
        const label = getOcrCharTypeLabel(c[i]);
        if (label) parts.push(`vị trí ${i + 1}: ${c[i]} = ${label}`);
      }
      return parts.join("; ");
    }

    function confirmOcrAmbiguousBeforeUse(code) {
      // Không hiện popup xác nhận O/0/Q nữa vì trên Android popup lớn dễ che màn hình
      // và làm người vận hành tưởng app bị thoát. App vẫn hiển thị từng ký tự O/0/Q
      // ngay trên thẻ kết quả để kiểm tra trước khi bấm Lấy mã.
      return true;
    }

    function makeOcrDisplayNote(note, code) {
      const base = note || "Sau dòng Mã đơn hàng";
      const groups = getOcrAmbiguousGroups(code);
      if (!groups.length) return base;
      const hasO0 = groups.includes("O/0/Q");
      const o0Text = hasO0 ? " - ô cam phân biệt 0=số không, O=chữ O" : "";
      return `${base} • Kiểm tra ký tự dễ nhầm ${groups.join(", ")}${o0Text}`;
    }

    function getOcrExpectedHandoverCodes() {
      const expected = new Map();
      try {
        if (ocrMode !== "handover" || !Array.isArray(handoverItems)) return expected;
        handoverItems.forEach(item => {
          if (!item || !item.valid || item.status !== "NO_RIDER" || item.scanned || !item.order_code) return;
          const cleaned = cleanOcrOrderCode(item.order_code);
          if (cleaned) expected.set(cleaned, String(item.order_code));
        });
      } catch {}
      return expected;
    }

    function findUniqueExpectedOcrMatch(code, expectedMap) {
      const cleaned = cleanOcrOrderCode(code);
      if (!cleaned || !expectedMap || !expectedMap.size) return "";
      if (expectedMap.has(cleaned)) return expectedMap.get(cleaned);

      const looseKey = makeOcrLooseKey(cleaned);
      const matches = [];
      expectedMap.forEach((rawCode, expectedCleaned) => {
        if (expectedCleaned.length !== cleaned.length) return;
        if (makeOcrLooseKey(expectedCleaned) === looseKey) matches.push(rawCode);
      });
      return matches.length === 1 ? matches[0] : "";
    }

    function addOcrCorrectionCandidates(items) {
      const expectedMap = getOcrExpectedHandoverCodes();
      const hasExpectedList = expectedMap.size > 0;
      const seen = new Set();
      const output = [];

      function addCandidate(item, code, note, extraScore = 0) {
        const cleaned = cleanOcrOrderCode(code);
        if (!cleaned) return false;
        const displayCode = String(code);
        if (seen.has(displayCode)) return false;
        seen.add(displayCode);
        output.push({
          ...(item || {}),
          code: displayCode,
          note: makeOcrDisplayNote(note || item?.note || "Sau dòng Mã đơn hàng", displayCode),
          score: (item?.score || 0) + extraScore
        });
        return true;
      }

      const baseItems = (items || []).filter(item => item && item.code).slice(0, 2);

      // Nếu đang bàn giao, ưu tiên mã khớp danh sách thật lên đầu.
      // Khi OCR đọc sai HOA/thường hoặc I/J/V/Y nhưng danh sách chỉ có 1 mã khớp, app hiển thị mã thật trước.
      if (hasExpectedList) {
        for (const item of baseItems) {
          const matched = findUniqueExpectedOcrMatch(item.code, expectedMap);
          if (matched) {
            addCandidate(
              item,
              matched,
              matched === item.code
                ? (item.note || "Sau dòng Mã đơn hàng")
                : "Đã khớp 100% danh sách bàn giao - giữ đúng HOA/thường",
              matched === item.code ? 800 : 900
            );
            if (output.length >= 2) return output.slice(0, 2);
          }
        }

        for (const item of baseItems) {
          const variants = buildOcrConfusionVariants(item.code);
          for (const variant of variants) {
            const exact = findUniqueExpectedOcrMatch(variant.code, expectedMap);
            if (!exact) continue;
            addCandidate(
              item,
              exact,
              "Gợi ý khớp 100% danh sách bàn giao - sửa ký tự OCR dễ nhầm",
              700
            );
            if (output.length >= 2) return output.slice(0, 2);
          }
        }

        // Nếu không khớp danh sách, vẫn hiện mã OCR gốc để người dùng kiểm tra, nhưng không tự sửa.
        if (!output.length) {
          baseItems.forEach(item => addCandidate(item, item.code, item.note || "Sau dòng Mã đơn hàng", 0));
        }
        return output.slice(0, 2);
      }

      baseItems.forEach(item => addCandidate(item, item.code, item.note || "Sau dòng Mã đơn hàng", 0));

      // Bước check location không có danh sách đối chiếu nên KHÔNG tạo gợi ý phụ.
      // Tránh tình trạng app tự gợi ý sai IIVY/JIVY như ảnh test.
      return output.slice(0, 1);
    }



    function toggleOcrO0Char(toggleValue) {
      const parts = String(toggleValue || "").split(":");
      const candidateIndex = Number(parts[0]);
      const charIndex = Number(parts[1]);
      if (!Number.isFinite(candidateIndex) || !Number.isFinite(charIndex)) return;
      const input = document.querySelector(`[data-ocr-edit="${candidateIndex}"]`);
      const item = ocrLastCandidates[candidateIndex];
      const current = cleanOcrOrderCode(input ? input.value : (item?.code || ""));
      if (!current || charIndex < 0 || charIndex >= current.length) return;
      const chars = current.split("");
      const ch = chars[charIndex];
      if (ch === "0") chars[charIndex] = "O";
      else if (ch === "O") chars[charIndex] = "Q";
      else if (ch === "Q") chars[charIndex] = "0";
      else if (ch === "o") chars[charIndex] = "0";
      else if (ch === "q") chars[charIndex] = "o";
      else return;
      const next = chars.join("");
      if (input) input.value = next;
      if (item) {
        item.code = next;
        item.note = makeOcrDisplayNote("Đã chỉnh ký tự O/0/Q bằng ô cam", next);
      }
      renderOcrCandidates(ocrLastCandidates);
      setOcrStatus("Đã đổi ký tự O/0/Q. Kiểm tra lại rồi bấm Lấy mã.", "orange");
    }

    function renderOcrCandidates(candidates) {
      const list = document.getElementById("ocrResultList");
      if (!list) return;
      list.innerHTML = "";
      ocrLastCandidates = addOcrCorrectionCandidates(candidates).slice(0, 2);

      if (!ocrLastCandidates.length) {
        list.innerHTML = `<div class="ocr-hint">Chưa thấy dòng <b>Mã đơn hàng</b> trong khung. Chỉ đưa đúng 1 dòng này vào khung xanh mỏng rồi bấm <b>Chụp lại</b>. Không lấy mã từ chữ khác để tránh sai.</div>`;
        return;
      }

      ocrLastCandidates.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "ocr-result-row";
        row.innerHTML = `
          <div>
            <div class="ocr-code-main">${escapeHtml(item.code)}</div>
            <input class="ocr-code-edit" data-ocr-edit="${index}" value="${escapeHtml(item.code)}" autocomplete="off" spellcheck="false" inputmode="text" aria-label="Mã OCR có thể sửa trước khi lấy">
            <div class="ocr-code-note">${escapeHtml(item.note || "Sau dòng Mã đơn hàng")}</div>
            ${renderOcrCharacterGuide(item.code, index)}
          </div>
          <div class="ocr-result-actions">
            <button class="btn-blue" type="button" data-ocr-use="${index}">Lấy mã</button>
            <button class="btn-dark" type="button" data-ocr-copy="${index}">Copy</button>
          </div>
        `;
        list.appendChild(row);
      });
    }

    async function openOcrScanner(mode = "location") {
      ocrMode = mode;
      const title = document.getElementById("ocrScanTitle");
      if (title) title.textContent = mode === "handover" ? "📷 Camera lấy mã" : "📷 Camera lấy mã";

      ocrCapturedDataUrl = "";
      ocrCapturedVariants = [];
      renderOcrCandidates([]);
      const raw = document.getElementById("ocrRawText");
      if (raw) { raw.textContent = ""; raw.style.display = "none"; }
      const preview = document.getElementById("ocrPreviewWrap");
      if (preview) preview.classList.remove("show");
      const cameraCard = document.getElementById("ocrCameraCard");
      if (cameraCard) cameraCard.style.display = "block";
      const btnRead = document.getElementById("btnOcrRead");
      const btnRetake = document.getElementById("btnOcrRetake");
      if (btnRead) { btnRead.disabled = true; btnRead.textContent = "🔎 Đọc kỹ hơn"; }
      if (btnRetake) btnRetake.disabled = true;

      document.body.classList.add("ocr-open");
      document.getElementById("ocrScanModal").classList.add("show");
      await startOcrCamera();
    }

    async function startOcrCamera() {
      await stopOcrCamera(false);
      try {
        setOcrStatus("Đang mở camera...", "orange");
        const constraints = {
          audio: false,
          video: {
            facingMode: { ideal: ocrFacingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 30 }
          }
        };
        ocrStream = await navigator.mediaDevices.getUserMedia(constraints);
        const video = document.getElementById("ocrVideo");
        video.srcObject = ocrStream;
        video.setAttribute("playsinline", "true");
        await video.play();
        await applyOcrWideZoom();
        setOcrStatus("Đưa dòng Mã đơn hàng vào khung xanh rồi bấm Chụp.", "green");
        warmOcrEngine();
      } catch (error) {
        console.error(error);
        setOcrStatus("Không mở được camera: " + (error.message || error) + ". Hãy mở bằng Safari/Chrome thật.", "red");
      }
    }

    async function applyOcrWideZoom() {
      try {
        const track = ocrStream?.getVideoTracks?.()[0];
        if (!track || !track.getCapabilities) return;
        const caps = track.getCapabilities();
        const advanced = [];
        if (caps.zoom && typeof caps.zoom.min === "number") advanced.push({ zoom: caps.zoom.min });
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) advanced.push({ focusMode: "continuous" });
        if (advanced.length) await track.applyConstraints({ advanced });
      } catch (error) {
        console.warn("OCR wide zoom/focus not supported:", error);
      }
    }

    async function stopOcrCamera(hide = true) {
      try {
        if (ocrStream) {
          ocrStream.getTracks().forEach(t => t.stop());
        }
      } catch {}
      ocrStream = null;
      const video = document.getElementById("ocrVideo");
      if (video) video.srcObject = null;
      if (hide) {
        document.getElementById("ocrScanModal").classList.remove("show");
        document.body.classList.remove("ocr-open");
      }
    }

    async function closeOcrScanner() {
      dismissMobileKeyboard();
      await stopOcrCamera(true);
      ocrBusy = false;
      document.body.classList.remove("ocr-open");
      setTimeout(dismissMobileKeyboard, 80);
    }

    function getOcrCropFromVideo(video) {
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      const frame = document.querySelector("#ocrCameraCard .ocr-scan-frame");
      const videoRect = video.getBoundingClientRect();
      const frameRect = frame?.getBoundingClientRect?.();

      if (!videoRect.width || !videoRect.height || !frameRect) {
        const cropW = Math.floor(vw * 0.94);
        const cropH = Math.floor(vh * 0.28);
        return { cropX: Math.floor((vw - cropW) / 2), cropY: Math.floor((vh - cropH) / 2), cropW, cropH };
      }

      const scale = Math.max(videoRect.width / vw, videoRect.height / vh);
      const renderedW = vw * scale;
      const renderedH = vh * scale;
      const offsetX = (videoRect.width - renderedW) / 2;
      const offsetY = (videoRect.height - renderedH) / 2;
      const leftOnVideo = frameRect.left - videoRect.left;
      const topOnVideo = frameRect.top - videoRect.top;
      const rightOnVideo = frameRect.right - videoRect.left;
      const bottomOnVideo = frameRect.bottom - videoRect.top;

      const padX = 0.015 * frameRect.width;
      const padY = Math.max(1, 0.04 * frameRect.height);
      let cropX = Math.floor((leftOnVideo - padX - offsetX) / scale);
      let cropY = Math.floor((topOnVideo - padY - offsetY) / scale);
      let cropW = Math.floor((rightOnVideo - leftOnVideo + padX * 2) / scale);
      let cropH = Math.floor((bottomOnVideo - topOnVideo + padY * 2) / scale);

      cropX = Math.max(0, Math.min(vw - 1, cropX));
      cropY = Math.max(0, Math.min(vh - 1, cropY));
      cropW = Math.max(40, Math.min(vw - cropX, cropW));
      cropH = Math.max(40, Math.min(vh - cropY, cropH));
      return { cropX, cropY, cropW, cropH };
    }

    function cloneCanvas(sourceCanvas) {
      const out = document.createElement("canvas");
      out.width = sourceCanvas.width;
      out.height = sourceCanvas.height;
      out.getContext("2d").drawImage(sourceCanvas, 0, 0);
      return out;
    }

    function preprocessOcrColorCanvas(sourceCanvas) {
      // Giữ ảnh MÀU cho trường hợp chụp từ màn hình thiết bị khác.
      // Grayscale/threshold quá mạnh có thể làm mất nét mỏng của O/0, I/1, chữ thường/HOA.
      const baseScale = 2.35;
      let outW = Math.max(1, Math.floor(sourceCanvas.width * baseScale));
      let outH = Math.max(1, Math.floor(sourceCanvas.height * baseScale));
      const maxW = 1900;
      const maxH = 760;
      const ratio = Math.min(1, maxW / outW, maxH / outH);
      outW = Math.max(1, Math.floor(outW * ratio));
      outH = Math.max(1, Math.floor(outH * ratio));

      const out = document.createElement("canvas");
      out.width = outW;
      out.height = outH;
      const ctx = out.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sourceCanvas, 0, 0, out.width, out.height);

      // Tăng tương phản nhẹ nhưng không triệt màu, giữ anti-alias từ màn hình LCD/OLED.
      const img = ctx.getImageData(0, 0, out.width, out.height);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, Math.min(255, (data[i] - 128) * 1.18 + 132));
        data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] - 128) * 1.18 + 132));
        data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] - 128) * 1.18 + 132));
      }
      ctx.putImageData(img, 0, 0);
      return out;
    }

    function preprocessOcrCanvas(sourceCanvas, mode = "soft") {
      // Tối ưu OCR local: ảnh đủ lớn để nét nhưng không quá nặng.
      const baseScale = mode === "threshold" ? 2.25 : 2.05;
      let outW = Math.max(1, Math.floor(sourceCanvas.width * baseScale));
      let outH = Math.max(1, Math.floor(sourceCanvas.height * baseScale));
      const maxW = 1900;
      const maxH = 760;
      const ratio = Math.min(1, maxW / outW, maxH / outH);
      outW = Math.max(1, Math.floor(outW * ratio));
      outH = Math.max(1, Math.floor(outH * ratio));

      const out = document.createElement("canvas");
      out.width = outW;
      out.height = outH;
      const ctx = out.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sourceCanvas, 0, 0, out.width, out.height);

      const img = ctx.getImageData(0, 0, out.width, out.height);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        let gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

        if (mode === "threshold") {
          // Tăng nét chữ đen trên nền trắng, hữu ích khi chụp màn hình rider hơi lóa.
          gray = Math.max(0, Math.min(255, (gray - 126) * 2.15 + 142));
          const v = gray > 148 ? 255 : 0;
          data[i] = data[i + 1] = data[i + 2] = v;
        } else {
          // Giữ grayscale có tương phản cao để Tesseract vẫn đọc được chữ "Shopee".
          gray = Math.max(0, Math.min(255, (gray - 128) * 1.85 + 145));
          data[i] = data[i + 1] = data[i + 2] = gray;
        }
      }
      ctx.putImageData(img, 0, 0);
      return out;
    }

    function canvasToPngDataUrl(canvas) {
      return canvas.toDataURL("image/png");
    }

    function estimateCanvasSharpness(canvas) {
      const w = Math.min(320, canvas.width);
      const h = Math.min(120, canvas.height);
      const tmp = document.createElement("canvas");
      tmp.width = w;
      tmp.height = h;
      const ctx = tmp.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(canvas, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h).data;
      let score = 0;
      for (let y = 1; y < h; y += 3) {
        for (let x = 1; x < w; x += 3) {
          const idx = (y * w + x) * 4;
          const left = (y * w + x - 1) * 4;
          const up = ((y - 1) * w + x) * 4;
          const g = img[idx] + img[idx + 1] + img[idx + 2];
          const gl = img[left] + img[left + 1] + img[left + 2];
          const gu = img[up] + img[up + 1] + img[up + 2];
          score += Math.abs(g - gl) + Math.abs(g - gu);
        }
      }
      return score;
    }

    async function captureBestOcrRawCanvas(video) {
      // Chụp 3 frame là đủ chọn ảnh rõ, giảm thời gian chờ so với 5 frame.
      let best = null;
      let bestScore = -1;
      for (let i = 0; i < 3; i++) {
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 55));
        const { cropX, cropY, cropW, cropH } = getOcrCropFromVideo(video);
        const rawCanvas = document.createElement("canvas");
        rawCanvas.width = cropW;
        rawCanvas.height = cropH;
        rawCanvas.getContext("2d").drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        const score = estimateCanvasSharpness(rawCanvas);
        if (score > bestScore) {
          best = rawCanvas;
          bestScore = score;
        }
      }
      return best;
    }

    async function captureOcrFrame() {
      const video = document.getElementById("ocrVideo");
      if (!video || !video.videoWidth) {
        setOcrStatus("Camera chưa sẵn sàng, thử lại sau 1 giây.", "red");
        return;
      }

      setOcrStatus("Đang chụp ảnh rõ nhất...", "orange");
      const rawCanvas = await captureBestOcrRawCanvas(video);
      const color = preprocessOcrColorCanvas(rawCanvas);
      const fast = preprocessOcrCanvas(rawCanvas, "soft");
      const threshold = preprocessOcrCanvas(rawCanvas, "threshold");

      const preview = document.getElementById("ocrPreviewCanvas");
      preview.width = color.width;
      preview.height = color.height;
      preview.getContext("2d").drawImage(color, 0, 0);

      // Auto đọc ảnh màu trước để giữ nét ký tự khi chụp từ màn hình điện tử khác.
      // Bấm "Đọc kỹ hơn" mới đọc thêm xám/trắng-đen/1 dòng để tránh chậm.
      ocrCapturedVariants = [
        { name: "anh mau mot dong giu case", dataUrl: canvasToPngDataUrl(color), canvas: color, psm: "7", auto: true },
        { name: "ảnh màu rõ", dataUrl: canvasToPngDataUrl(color), canvas: color, psm: "6", auto: true },
        { name: "ảnh xám rõ", dataUrl: canvasToPngDataUrl(fast), canvas: fast, psm: "6", deep: true },
        { name: "ảnh xám một dòng", dataUrl: canvasToPngDataUrl(fast), canvas: fast, psm: "7", deep: true },
        { name: "ảnh trắng đen", dataUrl: canvasToPngDataUrl(threshold), canvas: threshold, psm: "6", deep: true },
        { name: "ảnh trắng đen một dòng", dataUrl: canvasToPngDataUrl(threshold), canvas: threshold, psm: "7", deep: true },
        { name: "ảnh màu một dòng giữ HOA/thường", dataUrl: canvasToPngDataUrl(color), canvas: color, psm: "7", deep: true, codeOnly: true }
      ];
      ocrCapturedDataUrl = ocrCapturedVariants[0].dataUrl;

      await stopOcrCamera(false);
      const cameraCard = document.getElementById("ocrCameraCard");
      if (cameraCard) cameraCard.style.display = "none";
      document.getElementById("ocrPreviewWrap").classList.add("show");
      const btnRead = document.getElementById("btnOcrRead");
      if (btnRead) { btnRead.disabled = false; btnRead.textContent = "🔎 Đọc kỹ hơn"; }
      document.getElementById("btnOcrRetake").disabled = false;
      setOcrStatus("Đã chụp. Đang đọc dòng Mã đơn hàng...", "orange");
      renderOcrCandidates([]);
      setTimeout(() => readOcrCapturedImage(false), 60);
    }

    async function readOcrCapturedImage(deep = false) {
      const isDeep = !!deep && typeof deep === "object" ? true : !!deep;
      if ((!ocrCapturedDataUrl && !ocrCapturedVariants.length) || ocrBusy) return;
      ocrBusy = true;
      const btn = document.getElementById("btnOcrRead");
      const old = btn ? btn.textContent : "";
      try {
        if (btn) { btn.disabled = true; btn.textContent = isDeep ? "Đang đọc kỹ..." : "Đang đọc..."; }
        setOcrStatus(isDeep ? "Đang đọc kỹ hơn trên máy..." : "Đang đọc nhanh trên máy...", "orange");
        await ensureOcrWorker();

        const allVariants = ocrCapturedVariants.length ? ocrCapturedVariants : [{ name: "ảnh", dataUrl: ocrCapturedDataUrl, psm: "6", auto: true }];
        const variants = isDeep ? allVariants : allVariants.filter(v => v.auto).slice(0, 2);
        let combinedText = "";
        let candidates = [];
        let bestCandidates = [];

        for (let i = 0; i < variants.length; i++) {
          const variant = variants[i];
          setOcrStatus(`${isDeep ? "Đang đọc kỹ" : "Đang đọc nhanh"} ${i + 1}/${variants.length}...`, "orange");
          const reportProgress = m => {
            if (m && m.status === "recognizing text" && typeof m.progress === "number") {
              setOcrStatus(`${isDeep ? "Đang đọc kỹ" : "Đang đọc nhanh"}: ${Math.round(m.progress * 100)}%`, "orange");
            }
          };
          const tesseractOptions = {
            logger: reportProgress,
            // Không whitelist quá chặt ở ảnh chính, để Tesseract đọc được nhãn trước rồi mới lấy mã phía sau.
            tessedit_pageseg_mode: variant.psm || "6",
            preserve_interword_spaces: "1"
          };
          if (variant.codeOnly) {
            // Chỉ dùng khi người dùng bấm Đọc kỹ hơn: giữ đủ A-Z/a-z/0-9 để phân biệt HOA/thường.
            tesseractOptions.tessedit_char_whitelist = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:- ";
          }
          const result = await recognizeOcrVariant(variant, tesseractOptions, reportProgress);
          combinedText += "\n" + (result?.data?.text || "");
          const extracted = extractOcrCandidates(combinedText);
          const refined = refineOcrCandidatesByVisualO0(extracted, result?.data, variant.canvas);
          candidates = mergeOcrCandidateLists(refined, bestCandidates);
          bestCandidates = candidates;
          renderOcrCandidates(candidates);

          if (!isDeep && hasStrongOcrCandidate(candidates) && !hasOcrAmbiguousCandidate(candidates)) break;
        }

        const raw = document.getElementById("ocrRawText");
        if (raw) { raw.textContent = combinedText.trim(); raw.style.display = "none"; }
        renderOcrCandidates(candidates);
        if (candidates.length) {
          setOcrStatus("Đã nhận diện mã sau dòng Mã đơn hàng. Kiểm tra rồi bấm Lấy mã.", "green");
          playSound("scan");
        } else {
          setOcrStatus("Chưa thấy dòng Mã đơn hàng. Bấm Chụp lại, đưa đúng dòng này vào khung xanh.", "red");
          playSound("error");
        }
      } catch (error) {
        console.error(error);
        setOcrStatus("OCR lỗi: " + (error.message || error), "red");
        playSound("error");
      } finally {
        ocrBusy = false;
        if (btn) { btn.disabled = false; btn.textContent = old || "🔎 Đọc kỹ hơn"; }
      }
    }

    async function retakeOcrPhoto() {
      ocrCapturedDataUrl = "";
      ocrCapturedVariants = [];
      renderOcrCandidates([]);
      const raw = document.getElementById("ocrRawText");
      if (raw) { raw.textContent = ""; raw.style.display = "none"; }
      document.getElementById("ocrPreviewWrap").classList.remove("show");
      document.getElementById("ocrCameraCard").style.display = "block";
      document.getElementById("btnOcrRead").disabled = true;
      document.getElementById("btnOcrRetake").disabled = true;
      await startOcrCamera();
    }


    async function switchOcrCamera() {
      ocrFacingMode = ocrFacingMode === "environment" ? "user" : "environment";
      await startOcrCamera();
    }

    function getEditedOcrCandidateCode(index) {
      const input = document.querySelector(`[data-ocr-edit="${index}"]`);
      return cleanOcrOrderCode(input ? input.value : (ocrLastCandidates[Number(index)]?.code || ""));
    }

    async function useOcrCode(code) {
      const value = cleanOcrOrderCode(code);
      if (!value) return;
      if (!confirmOcrAmbiguousBeforeUse(value)) {
        setOcrStatus("Kiểm tra lại ký tự O/0/Q rồi bấm Lấy mã.", "orange");
        return;
      }

      if (ocrMode === "handover") {
        const input = document.getElementById("scanInput");
        if (input) input.value = value;
        const ok = checkScan();
        if (ok) {
          setOcrStatus("Đã lấy mã và check đúng: " + value, "green");
          setTimeout(() => closeOcrScanner(), 180);
        } else {
          setOcrStatus("Đã lấy mã nhưng chưa đúng danh sách bàn giao: " + value, "red");
        }
        return;
      }

      // OCR ở bước check location chỉ thêm mã vào danh sách.
      // Không tự động check location, để người vận hành có thể thêm nhiều đơn trước.
      addSuffixFromCamera(value, { focus: false });
      dismissMobileKeyboard();
      setHandoverMessage("Đã thêm mã OCR: " + value + ". Có thể thêm đơn tiếp hoặc bấm Check Bàn Giao khi đủ mã.", "green");
      setOcrStatus("Đã thêm mã: " + value + ". Đóng màn chụp để thêm tiếp hoặc bấm Check location.", "green");
      playSound("scan");
      setTimeout(() => {
        closeOcrScanner();
        setTimeout(dismissMobileKeyboard, 80);
      }, 220);
    }

    async function copyOcrCode(code) {
      const value = cleanOcrOrderCode(code);
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        setOcrStatus("Đã copy: " + value, "green");
      } catch {
        prompt("Copy mã này:", value);
      }
    }


    function addSuffixInput(value = "", options = {}) {
      const container = document.getElementById("suffixContainer");
      const row = document.createElement("div");
      row.className = "suffix-row";
      row.innerHTML = `
        <input class="suffix-input" autocomplete="off" placeholder="Nhập mã đơn hàng Shopee hoặc 5 ký tự cuối mã vận đơn" value="${escapeHtml(value)}">
        <button class="btn-red" type="button">Xóa</button>
      `;
      row.querySelector("button").addEventListener("click", () => {
        row.remove();
        if (!container.querySelector(".suffix-input")) addSuffixInput();
      });
      container.appendChild(row);
      const input = row.querySelector("input");
      if (!options || options.focus !== false) input.focus();
      else input.blur();
    }

    function getSuffixInputs() {
      return [...document.querySelectorAll(".suffix-input")]
        .map(input => clean(input.value))
        .filter(Boolean);
    }

    function resetSession() {
      handoverItems = [];
      currentHoldTicket = null;
      updateHoldButtons();
      document.getElementById("suffixContainer").innerHTML = "";
      addSuffixInput();
      document.getElementById("btnPrintPickList").disabled = true;
      document.getElementById("scanInput").value = "";
      document.getElementById("scanInput").disabled = true;
      document.getElementById("btnScan").disabled = true;
      document.getElementById("btnCameraScanHandover").disabled = true;
      document.getElementById("btnOcrScanHandover").disabled = true;
      closeModal();
      closeCameraScanner();
      closeOcrScanner();
      clearHoldSearchUiFreeze();
      renderHandoverItems();
      updateHandoverStats();
      setHandoverMessage("Đã làm mới phiên bàn giao", "green");
      playSound("success");
    }

    function openModal() {
      document.getElementById("handoverModal").classList.add("show");
      renderModalTicket();
    }
    function closeModal() {
      document.getElementById("handoverModal").classList.remove("show");
      if (cameraScannerMode === "handover") closeCameraScanner();
      if (ocrMode === "handover") closeOcrScanner();
    }



    async function resetAllCurrentDataNow() {
      const wh = getWarehouse();
      const confirmText = "RESET " + wh;
      if (!confirm("Admin Pro xác nhận xóa dữ liệu vận hành hiện tại ở TẤT CẢ kho? Hành động này xóa toàn bộ đơn, phiếu, BOX và Slot của ca hiện tại.")) return;
      const typed = prompt("Gõ chính xác RESET ALL để xác nhận.");
      if (String(typed || "").trim().toUpperCase() !== "RESET ALL") {
        setMessage("Đã hủy reset data.", "red");
        return;
      }
      try {
        setMessage("Đang reset toàn bộ data hiện tại...", "red");
        const res = await apiPost("/api/admin/reset_current_data", {
          warehouse: wh,
          all_warehouses: true,
          clear_d1store: true,
          clear_d1_all: true
        });
        if (!res || !res.ok) throw new Error(res?.error || "reset_current_data_failed");
        allOrders = [];
        holdTicketCache = new Map();
        currentHoldTicket = null;
        riderOverviewItems = [];
        await localClearCurrentWarehouseOrders().catch(err => console.warn("Local reset cache warning:", err));
        renderStats(allOrders);
        if (document.getElementById("pageManage")?.classList.contains("active")) renderOrders([]);
        renderHoldTicketList([]);
        renderRiderOverview();
        updateRefreshIndicator("Đã reset sạch dữ liệu hiện tại. Server và cache trình duyệt đã trống.");
        setMessage("Đã reset sạch data hiện tại.", "green");
      } catch (error) {
        setMessage("Lỗi reset toàn bộ data: " + (error.message || error), "red");
      }
    }

    async function cleanupDeliveredOlderThan15Days() {
      if (!confirm("Dọn dữ liệu ngày cũ cho kho " + getWarehouse() + "?\n- Dữ liệu vận hành ngày cũ sẽ được xóa theo quy tắc reset 06:00\n- Dữ liệu ca hiện tại được giữ nguyên")) return;
      try {
        setMessage("Đang dọn dữ liệu theo ngày trên Server...");
        const res = await apiPost("/api/cleanup/daily_retention", { warehouse: getWarehouse() });
        if (!res.ok) throw new Error(res.error || "daily_retention_failed");
        setMessage("Đã dọn dữ liệu ngày cũ thành công.", "green");
        playSound("success");
        await loadRecentOrdersPagesOnce(false);
      } catch (error) {
        setMessage("Lỗi dọn dữ liệu ngày cũ: " + (error.message || error), "red");
        playSound("error");
      }
    }

    function printPickList() {
      if (!handoverItems.length) {
        setHandoverMessage("Chưa có danh sách để in. Vui lòng bấm Check Bàn Giao trước.", "red");
        return;
      }
      const rows = handoverItems.map((item, i) => `
        <tr>
          <td>${i + 1}</td><td>${escapeHtml(item.suffix || "")}</td><td>${escapeHtml(item.order_code || "-")}</td>
          <td><b>${escapeHtml(item.location_code || "-")}</b></td><td>${escapeHtml(item.sub_code || item.sub || "-")}</td><td>${escapeHtml(item.status || "-")}</td><td>${escapeHtml(item.note || "")}</td>
        </tr>
      `).join("");
      const w = window.open("", "_blank");
      if (!w) {
        setHandoverMessage("Trình duyệt chặn popup. Vui lòng cho phép popup để in list.", "red");
        return;
      }
      w.document.write(`
        <html><head><meta charset="utf-8"><title>IFC_01 Handover</title>
        <style>
          body{font-family:var(--vnwl-ui-font, Arial, "Segoe UI", Tahoma, sans-serif);margin:20px} table{width:100%;border-collapse:collapse}
          th,td{border:1px solid #333;padding:8px;text-align:left} th{background:#eee}

    /* V2.0.3: dropdown HOLD nổi bật hơn bằng màu trạng thái rõ ràng */
    .hold-filter-select {
      min-width: 235px;
      height: 42px;
      border-radius: 12px;
      border: 2px solid #1d4ed8;
      color: #0f172a;
      font-weight: 900;
      font-size: 14px;
      padding: 0 42px 0 14px;
      outline: none;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      transition: box-shadow .18s ease, transform .18s ease, border-color .18s ease, background .18s ease;
      box-shadow: 0 2px 0 rgba(15,23,42,.12), 0 8px 18px rgba(15,23,42,.08);
      background-repeat: no-repeat;
      background-position: calc(100% - 19px) 18px, calc(100% - 13px) 18px, 0 0;
      background-size: 6px 6px, 6px 6px, 100% 100%;
    }
    .hold-filter-select.filter-all {
      border-color: #d97706;
      color: #7c2d12;
      background-image:
        linear-gradient(45deg, transparent 50%, #92400e 50%),
        linear-gradient(135deg, #92400e 50%, transparent 50%),
        linear-gradient(180deg, #fff7ed, #ffedd5);
      box-shadow: 0 0 0 3px rgba(245,158,11,.18), 0 8px 18px rgba(217,119,6,.12);
    }
    .hold-filter-select.filter-waiting {
      border-color: #2563eb;
      color: #1e3a8a;
      background-image:
        linear-gradient(45deg, transparent 50%, #1d4ed8 50%),
        linear-gradient(135deg, #1d4ed8 50%, transparent 50%),
        linear-gradient(180deg, #eff6ff, #dbeafe);
      box-shadow: 0 0 0 3px rgba(37,99,235,.16), 0 8px 18px rgba(37,99,235,.12);
    }
    .hold-filter-select.filter-mine {
      border-color: #059669;
      color: #065f46;
      background-image:
        linear-gradient(45deg, transparent 50%, #047857 50%),
        linear-gradient(135deg, #047857 50%, transparent 50%),
        linear-gradient(180deg, #ecfdf5, #d1fae5);
      box-shadow: 0 0 0 3px rgba(16,185,129,.18), 0 8px 18px rgba(5,150,105,.12);
    }
    .hold-filter-select:focus {
      transform: translateY(-1px);
    }
    .hold-filter-select:hover {
      transform: translateY(-1px);
      filter: saturate(1.04);
    }
    .hold-filter-select option {
      color: #0f172a;
      background: #ffffff;
      font-weight: 700;
    }
    @media (max-width: 760px) {
      .hold-filter-select {
        min-width: 100%;
        width: 100%;
        height: 44px;
        font-size: 14px;
      }
    }
</style></head><body>
        <h2>IFC_01 Handover · LIST LẤY HÀNG / CHECK LOCATION</h2>
        <p><b>Kho:</b> ${escapeHtml(getWarehouse())}</p>
        <table><thead><tr><th>STT</th><th>Ký tự cuối</th><th>Mã đơn</th><th>Location</th><th>Sub</th><th>Trạng thái</th><th>Ghi chú</th></tr></thead><tbody>${rows}</tbody></table>
        
</body></html>
      `);
      w.document.close();
      setTimeout(() => w.print(), 300);
    }

    function isHandoverPageVisible() {
      return !!document.getElementById("pageHandover")?.classList.contains("active");
    }

    function ensureHoldTicketsLiveOnHandoverPage() {
      if (!isHandoverPageVisible()) return;
      // Trang Bàn giao nhiều đơn phải tự live phiếu HOLD khi mở trang.
      // Trước đây người dùng phải bấm "View phiếu HOLD hôm nay" nên máy khác không thấy phiếu mới ngay.
      setTimeout(() => {
        if (!isHandoverPageVisible()) return;
        loadTodayHoldTickets();
        scheduleHoldAuthoritativeReload("handover_page_visible_authoritative_snapshot", 120);
      }, 80);
    }

    function showPage(page) {
      document.getElementById("pageManage").classList.toggle("active", page === "manage");
      document.getElementById("pageHandover").classList.toggle("active", page === "handover");
      document.getElementById("pageRiderOverview")?.classList.toggle("active", page === "rider");
      document.getElementById("navManage").classList.toggle("active", page === "manage");
      document.getElementById("navHandover").classList.toggle("active", page === "handover");
      document.getElementById("navRiderOverview")?.classList.toggle("active", page === "rider");
      if (page === "manage") renderOrders(applyCurrentFilters(allOrders));
      if (page === "handover") ensureHoldTicketsLiveOnHandoverPage();
      if (page === "rider") {
        loadRiderOverview(false);
        if (riderOverviewTimer) clearInterval(riderOverviewTimer);
        riderOverviewTimer = setInterval(() => { if (isRiderOverviewPageVisible()) renderRiderOverview(); }, 1000);
        setTimeout(() => {
          if (isRiderOverviewPageVisible() && !holdTicketsLiveStarted) loadTodayHoldTickets();
        }, 120);
      } else if (riderOverviewTimer) {
        clearInterval(riderOverviewTimer);
        riderOverviewTimer = null;
      }
    }

    function applyCurrentFilters(sourceOrders) {
      const keyword = clean(document.getElementById("searchInput").value);
      const status = document.getElementById("statusFilter").value;
      let result = [...sourceOrders].filter(o => !orderHiddenFromHtml(o));

      if (keyword) {
        result = result.filter(o =>
          exactIncludes(o.order_code || "", keyword) ||
          exactIncludes(getShopeeOrderSn(o), keyword) ||
          exactIncludes(o.location_code || "", keyword) ||
          exactIncludes(o.sub_code || "", keyword)
        );
      }

      if (status === "NO_RIDER") result = result.filter(o => normalizeStatusForUi(o.status) === "NO_RIDER" && !getOrderHoldDisplayStatus(o));
      if (status === "WAITING_HOLD") result = result.filter(o => getOrderHoldDisplayStatus(o)?.text === "CHỜ NHẬN PHIẾU");
      if (status === "PROCESSING") result = result.filter(o => getOrderHoldDisplayStatus(o)?.text === "ĐANG XỬ LÝ");
      if (status === "HANDED_OVER") result = result.filter(o => normalizeStatusForUi(o.status) === "HANDED_OVER");
      if (status === "ORDER_SN_DASH") result = result.filter(o => isShopeeOrderSnDash(o));
      if (status === "ORDER_SN_NO_CODE") result = result.filter(o => isShopeeOrderSnNoCode(o));

      // Nếu không search, chỉ hiển thị số dòng theo dropdown để bảng nhẹ.
      // Nhưng bộ nhớ vẫn giữ toàn bộ D0 đã tải để search không bị mất đơn.
      if (!keyword) return result.slice(0, getDisplayLimit());

      // Khi có search, cho hiển thị nhiều kết quả hơn để dễ tìm.
      return result.slice(0, 1000);
    }

    function searchOrders() {
      const result = applyCurrentFilters(allOrders);
      renderOrders(result);
      setMessage("Tìm thấy " + result.length + " đơn", "green");
    }

    async function advancedSearchOrders() {
      const keyword = clean(document.getElementById("searchInput").value);
      const status = document.getElementById("statusFilter").value;

      if (!keyword) {
        setMessage("Nhập mã đơn đầy đủ trước khi tìm nâng cao.", "red");
        document.getElementById("searchInput").focus();
        return;
      }

      if (!db) {
        setMessage("Server chưa sẵn sàng. Vui lòng thử lại.", "red");
        return;
      }

      const btn = document.getElementById("btnAdvancedSearch");
      const oldText = btn ? btn.textContent : "";

      try {
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Đang tìm...";
        }

        setMessage("Đang tìm mã đơn đầy đủ trên Server...", "green");
        const d1storeOrders = await searchOrdersFromD1Advanced(keyword);
        const filteredOrders = filterOrdersByStatus(d1storeOrders, status);

        if (filteredOrders.length) {
          mergeOrdersIntoMemory(filteredOrders);
          await localSaveOrders(filteredOrders);
          await localPersistCurrentState();
        }

        const result = applyCurrentFilters(allOrders);
        renderStats(allOrders);
        renderOrders(result);

        if (filteredOrders.length) {
          setMessage("Tìm nâng cao thấy " + filteredOrders.length + " đơn theo mã đơn đầy đủ. Đã lưu vào cache local.", "green");
        } else {
          setMessage("Tìm nâng cao không thấy mã đơn này trên Server.", "red");
        }
      } catch (error) {
        console.warn("Advanced search error:", error);
        setMessage("Tìm nâng cao lỗi: " + (error.message || error), "red");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = oldText || "Tìm nâng cao";
        }
      }
    }

    function filterOrdersByStatus(orders, status) {
      const list = Array.isArray(orders) ? orders : [];
      if (status === "NO_RIDER") return list.filter(o => normalizeStatusForUi(o.status) === "NO_RIDER" && !getOrderHoldDisplayStatus(o));
      if (status === "WAITING_HOLD") return list.filter(o => getOrderHoldDisplayStatus(o)?.text === "CHỜ NHẬN PHIẾU");
      if (status === "PROCESSING") return list.filter(o => getOrderHoldDisplayStatus(o)?.text === "ĐANG XỬ LÝ");
      if (status === "HANDED_OVER") return list.filter(o => normalizeStatusForUi(o.status) === "HANDED_OVER");
      return list;
    }

    async function searchOrdersFromD1Advanced(keyword) {
      const key = clean(keyword);
      const found = new Map();

      function addOrder(id, data) {
        const order = normalizeOrder({ id, ...(data || {}) });
        if (!order.id) return;
        if (order.warehouse_code !== getWarehouse()) return;

        // Tìm nâng cao chỉ phục vụ tìm đơn theo mã đơn đầy đủ.
        // Không tìm location, không tìm suffix để tránh read rộng.
        if (exactEqual(order.order_code || "", key) || exactEqual(getShopeeOrderSn(order), key) || exactEqual(order.id || "", safeOrderId(key))) {
          found.set(order.id, order);
        }
      }

      // 1) Tìm nhanh theo mã đơn đầy đủ: doc id = safeOrderId(order_code).
      try {
        const directSnap = await getDoc(doc(db, getOrdersCollectionName(), safeOrderId(key)));
        if (directSnap.exists()) addOrder(directSnap.id, directSnap.data());
      } catch (error) {
        console.warn("Advanced direct search warning:", error);
      }

      // 2) Tìm chính xác theo field order_code, phòng trường hợp doc id khác safeOrderId.
      try {
        const codeSnap = await getDocs(query(
          collection(db, getOrdersCollectionName()),
          where("order_code", "==", key),
          limit(1)
        ));
        codeSnap.forEach(d => addOrder(d.id, d.data()));
      } catch (error) {
        console.warn("Advanced order_code search warning:", error);
      }

      return Array.from(found.values())
        .sort((a, b) => getOrderUpdatedMs(b) - getOrderUpdatedMs(a));
    }


    function renderStats(orders) {
      const visible = (orders || []).filter(o => !orderHiddenFromHtml(o));
      const noRiderEl = document.getElementById("statNoRider");
      const waitingHoldEl = document.getElementById("statWaitingHold");
      const processingEl = document.getElementById("statProcessing");
      const doneEl = document.getElementById("statDone");
      if (noRiderEl) noRiderEl.textContent = visible.filter(o => normalizeStatusForUi(o.status) === "NO_RIDER" && !getOrderHoldDisplayStatus(o)).length;
      if (waitingHoldEl) waitingHoldEl.textContent = visible.filter(o => getOrderHoldDisplayStatus(o)?.text === "CHỜ NHẬN PHIẾU").length;
      if (processingEl) processingEl.textContent = visible.filter(o => getOrderHoldDisplayStatus(o)?.text === "ĐANG XỬ LÝ").length;
      if (doneEl) doneEl.textContent = visible.filter(o => normalizeStatusForUi(o.status) === "HANDED_OVER").length;
    }

    function updateHandoverStats() {
      // UI OPTIMIZED: đã bỏ 3 card thống kê bàn giao để không render/count phần không cần thiết.
      renderModalTicket();
    }

    function getValidHandoverCount() {
      return handoverItems.filter(i => i.valid && i.status === "NO_RIDER").length;
    }
    function getScannedCount() {
      return handoverItems.filter(i => i.valid && i.status === "NO_RIDER" && i.scanned).length;
    }

    function getOrderHoldDisplayStatus(order) {
      if (!order || normalizeStatusForUi(order.status || "NO_RIDER") !== "NO_RIDER") return null;
      const holdStage = String(order.hold_workflow_status || order.hold_status || "").toUpperCase();
      if (holdStage === "HOLD") return { text: "CHỜ NHẬN PHIẾU", cls: "badge-ready" };
      if (["RECEIVED", "CLAIMED", "IN_PICK", "PICKED", "READY_PICK", "READY_TO_PICK", "WAITING_RECEIVE"].includes(holdStage)) {
        return { text: "ĐANG XỬ LÝ", cls: "badge-scan" };
      }
      return null;
    }

    function renderStatus(status, valid = true, order = null) {
      if (!valid) return `<span class="badge badge-error">Lỗi</span>`;
      const holdDisplay = getOrderHoldDisplayStatus(order);
      if (holdDisplay) return `<span class="badge ${holdDisplay.cls}">${escapeHtml(holdDisplay.text)}</span>`;
      const st = normalizeStatusForUi(status);
      if (st === "NO_RIDER") return `<span class="badge badge-ready">CHUẨN BỊ</span>`;
      if (st === "HANDED_OVER") return `<span class="badge badge-done">ĐÃ BÀN GIAO</span>`;
      return `<span class="badge badge-error">${escapeHtml(status || "-")}</span>`;
    }



    function isDeletedOrCancelledStatus(status) {
      const s = String(status || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
      return ["DELETED", "DELETE", "REMOVED", "VOID", "CANCELLED", "CANCELED", "CANCEL", "CANCELLED_ORDER", "CANCELED_ORDER", "DA_HUY", "DAHUY", "ĐÃ_HỦY"].includes(s);
    }

    function orderHiddenFromHtml(order) {
      if (!order) return false;
      if (isDeletedOrCancelledStatus(order.status || order.queue_status || order.order_status)) return true;
      if (order.deleted === true || order.is_deleted === true || order.cancelled === true || order.canceled === true || order.is_cancelled === true || order.is_canceled === true) return true;
      // IMPORTANT: delete_at/delete_at_ms is only scheduled cleanup after handover,
      // not actual deletion. Do not hide HANDED_OVER orders because they have delete_at.
      const fields = ["deleted_at", "deleted_at_ms", "cancelled_at", "cancelled_at_ms", "canceled_at", "canceled_at_ms"];
      return fields.some(k => {
        const v = order[k];
        if (v === null || v === undefined || v === false) return false;
        if (typeof v === "number") return v > 0;
        const t = String(v).trim().toLowerCase();
        return !["", "-", "--", "0", "false", "null", "none", "nan", "undefined"].includes(t);
      });
    }

    function orderCanBeOperated(order) {
      const st = normalizeStatusForUi(order?.status || "");
      return !orderHiddenFromHtml(order) && st === "NO_RIDER";
    }

    function renderScan(item) {
      if (!item.valid) return `<span class="badge badge-error">Không hợp lệ</span>`;
      if (item.status !== "NO_RIDER") return `<span class="badge badge-error">Không nhận</span>`;
      if (item.scanned) return `<span class="badge badge-scan">Đã scan</span>`;
      return `<span class="badge badge-ready">Chờ scan</span>`;
    }

    function getWarehouse() {
      const wh = document.getElementById("warehouseSelect").value || "WH1";
      try { window.VNWL_CURRENT_WAREHOUSE = wh; window.WH4H_CURRENT_WAREHOUSE = wh; } catch {}
      return wh;
    }
    function getOrdersCollectionName() {
      return DATA_COLLECTION_PREFIX + getWarehouse();
    }
    function getHandoverIndexCollectionName() {
      return HANDOVER_INDEX_PREFIX + getWarehouse();
    }
    function getDeviceId() {
      let id = localStorage.getItem("WH4H_DEVICE_ID");
      if (!id) {
        id = "DEV_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
        localStorage.setItem("WH4H_DEVICE_ID", id);
      }
      return id;
    }
    function getDisplayLimit() {
      const value = Number(document.getElementById("displayLimit").value || 100);
      return [100, 200, 500, 1000].includes(value) ? value : 100;
    }
    function clean(v) { return String(v || "").trim(); }

    function normalizeCaseInsensitiveKey(value) {
      return String(value ?? "").normalize("NFKC").toUpperCase();
    }

    // So sánh mã không phân biệt HOA/thường.
    // Ví dụ: "ABC123", "abc123", "Abc123" được xem là cùng một mã.
    function exactEqual(a, b) {
      const x = normalizeCaseInsensitiveKey(a);
      const y = normalizeCaseInsensitiveKey(b);
      if (x.length !== y.length) return false;
      for (let i = 0; i < x.length; i++) {
        if (x.charCodeAt(i) !== y.charCodeAt(i)) return false;
      }
      return true;
    }

    function exactEndsWith(text, suffix) {
      const full = normalizeCaseInsensitiveKey(text);
      const tail = normalizeCaseInsensitiveKey(suffix);
      if (tail.length > full.length) return false;
      return exactEqual(full.slice(full.length - tail.length), tail);
    }

    function exactIncludes(text, keyword) {
      return normalizeCaseInsensitiveKey(text).includes(normalizeCaseInsensitiveKey(keyword));
    }

    function safeOrderId(code) {
      const bytes = new TextEncoder().encode(String(code));
      return "order_" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    }


    function buildSuffixKeys(code) {
      const s = String(code || "");
      const keys = [];
      const max = Math.min(20, s.length);
      for (let n = 5; n <= max; n++) {
        keys.push(s.slice(-n));
      }
      if (s.length > 0 && !keys.includes(s)) keys.push(s);
      return keys;
    }



    function buildOcrO0QSearchVariants(value) {
      // Chỉ dùng ở bước Check location khi mã OCR không tìm thấy đơn.
      // Mục tiêu: O/0/Q trong font Shopee rất giống nhau; không tự đoán trên ảnh,
      // mà thử biến thể và CHỈ nhận nếu khớp duy nhất với đơn thật trong dữ liệu.
      const original = clean(value);
      if (!original || original.length < 5 || original.length > 30) return [];
      if (!/[O0Qoq]/.test(original)) return [];

      const altMap = {
        "0": ["O", "Q"],
        "O": ["0", "Q"],
        "o": ["0", "Q"],
        "Q": ["0", "O"],
        "q": ["0", "O"]
      };

      const positions = [];
      for (let i = 0; i < original.length; i++) {
        const alts = altMap[original[i]];
        if (alts) positions.push({ index: i, from: original[i], alts });
      }
      if (!positions.length || positions.length > 8) return [];

      const variants = [];
      const seen = new Set([original]);
      function pushVariant(changes) {
        const chars = original.split("");
        changes.forEach(change => { chars[change.index] = change.to; });
        const code = chars.join("");
        if (code && code !== original && !seen.has(code)) {
          seen.add(code);
          variants.push(code);
        }
      }

      // Ưu tiên sửa 1 ký tự O/0/Q trước, rủi ro thấp nhất.
      for (const pos of positions) {
        for (const alt of pos.alts) {
          pushVariant([{ index: pos.index, to: alt }]);
          if (variants.length >= 12) return variants;
        }
      }

      // Nếu có 2 ký tự O/0/Q, thử thêm một số tổ hợp 2 vị trí.
      for (let a = 0; a < Math.min(positions.length, 4); a++) {
        for (let b = a + 1; b < Math.min(positions.length, 5); b++) {
          for (const altA of positions[a].alts.slice(0, 2)) {
            for (const altB of positions[b].alts.slice(0, 2)) {
              pushVariant([
                { index: positions[a].index, to: altA },
                { index: positions[b].index, to: altB }
              ]);
              if (variants.length >= 18) return variants;
            }
          }
        }
      }

      return variants.slice(0, 18);
    }

    async function findUniqueNoRiderOrderByO0QVariants(suffix) {
      const variants = buildOcrO0QSearchVariants(suffix);
      if (!variants.length) return { orders: [], ambiguous: false, usedKey: "", tried: 0 };

      const found = new Map();
      let firstUsedKey = "";
      let tried = 0;

      for (const variant of variants) {
        tried += 1;
        const result = await findNoRiderOrdersBySuffixLocalFirst(variant);
        for (const order of (result.orders || [])) {
          const key = String(order.order_code || order.id || "");
          if (!key) continue;
          if (!found.has(key)) found.set(key, order);
          if (!firstUsedKey) firstUsedKey = variant;
        }
        // Có hơn 1 đơn thật thì không tự chọn để tránh sai O/0.
        if (found.size > 1) {
          return { orders: Array.from(found.values()), ambiguous: true, usedKey: firstUsedKey, tried };
        }
      }

      const orders = Array.from(found.values());
      return { orders: orders.length === 1 ? orders : [], ambiguous: orders.length > 1, usedKey: firstUsedKey, tried };
    }

    function collectNoRiderOrdersByLooseOcrSuffix(orders, suffix) {
      const key = cleanOcrOrderCode(suffix);
      if (!key || key.length < 5 || key.length > 30) return [];
      const looseKey = makeOcrLooseKey(key);
      if (!looseKey) return [];

      const found = new Map();
      (orders || []).forEach(order => {
        if (!order || order.warehouse_code !== getWarehouse() || order.status !== "NO_RIDER") return;
        const code = String(order.order_code || "");
        if (code.length < key.length) return;
        const tail = code.slice(code.length - key.length);
        if (makeOcrLooseKey(tail) !== looseKey) return;
        found.set(order.id || code, order);
      });
      return Array.from(found.values());
    }

    function getDbVerifiedOrderKey(order) {
      return String(order?.id || order?.order_code || "");
    }

    function buildDbVerifiedOcrNote(input, result) {
      const order = result?.orders?.[0];
      const realCode = String(order?.order_code || "");
      const usedKey = result?.usedKey ? " | biến thể khớp DB: " + result.usedKey : "";
      const reason = result?.reason ? " | " + result.reason : "";
      const source = result?.source ? " | nguồn: " + result.source : "";
      return "OCR DB-verified 100%: OCR nhập " + cleanOcrOrderCode(input) + " → chốt mã thật " + realCode + usedKey + reason + source;
    }

    function buildDbVerifiedOcrAmbiguousNote(input, result) {
      const orders = result?.orders || [];
      const preview = orders.slice(0, 3).map(o => o.order_code).filter(Boolean).join(", ");
      const more = orders.length > 3 ? "..." : "";
      return "OCR DB-verified chưa thể chốt 100%: OCR nhập " + cleanOcrOrderCode(input) +
        " nhưng DB có " + orders.length + " đơn có thể khớp" +
        (preview ? " (" + preview + more + ")" : "") +
        ". Vui lòng nhập thêm ký tự cuối hoặc kiểm tra ảnh.";
    }

    function getDbVerifiedOcrAltMap() {
      return {
        "O": ["0", "Q"], "o": ["0", "q"], "0": ["O", "o", "Q", "q"], "Q": ["O", "0"], "q": ["o", "0"],
        "I": ["J", "1", "l"], "J": ["I", "1", "l"], "i": ["j", "1", "l"], "j": ["i", "1", "l"], "l": ["I", "J", "1", "i", "j"], "1": ["I", "J", "i", "j", "l"],
        "V": ["Y"], "Y": ["V"], "v": ["y"], "y": ["v"],
        "S": ["5"], "s": ["5"], "5": ["S", "s"],
        "B": ["8"], "b": ["8"], "8": ["B", "b"],
        "Z": ["2"], "z": ["2"], "2": ["Z", "z"],
        "G": ["6"], "g": ["6"], "6": ["G", "g"],
        "T": ["7"], "t": ["7"], "7": ["T", "t"],
        "A": ["4"], "a": ["4"], "4": ["A", "a"],
        "C": ["G"], "c": ["g"], "K": ["X"], "k": ["x"], "X": ["K"], "x": ["k"]
      };
    }

    function buildOcrDbVerifiedSearchStages(value) {
      const original = cleanOcrOrderCode(value);
      if (!original || original.length < 5 || original.length > 30) return [];

      const seen = new Set([original]);
      function addVariant(list, code, reason) {
        const cleaned = cleanOcrOrderCode(code);
        if (!cleaned || cleaned.length < 5 || cleaned.length > 30 || seen.has(cleaned)) return;
        seen.add(cleaned);
        list.push({ code: cleaned, reason });
      }

      const caret = [];
      addVariant(caret, getOcrTerminalCaretDropCandidate(original), "bỏ dấu nhấp/caret cuối dòng");
      const normalized = normalizeOcrCandidateCode(original);
      if (normalized !== original) addVariant(caret, normalized, "chuẩn hóa lỗi OCR chắc chắn");

      const caseFix = [];
      if (/^[0-9]/.test(original) && /[a-z]/.test(original)) {
        addVariant(caseFix, original.replace(/[a-z]/g, ch => ch.toUpperCase()), "sửa HOA/thường theo mã Shopee bắt đầu bằng số");
      }
      const leadingLetters = original.match(/^([A-Za-z]{2,10})(?=[0-9])/);
      if (leadingLetters) {
        addVariant(caseFix, leadingLetters[1].toLowerCase() + original.slice(leadingLetters[1].length), "sửa cụm chữ đầu mã sang thường theo DB");
        addVariant(caseFix, leadingLetters[1].toUpperCase() + original.slice(leadingLetters[1].length), "sửa cụm chữ đầu mã sang HOA theo DB");
      }

      const altMap = getDbVerifiedOcrAltMap();
      const positions = [];
      for (let i = 0; i < original.length; i++) {
        const alts = altMap[original[i]];
        if (alts && alts.length) positions.push({ index: i, from: original[i], alts });
      }

      const o0One = [];
      const otherOne = [];
      const twoChars = [];
      for (const pos of positions.slice(0, 12)) {
        for (const alt of pos.alts.slice(0, 5)) {
          const chars = original.split("");
          chars[pos.index] = alt;
          const list = /[O0Qoq]/.test(pos.from) ? o0One : otherOne;
          addVariant(list, chars.join(""), "sửa 1 ký tự OCR dễ nhầm " + pos.from + "→" + alt);
          if (o0One.length + otherOne.length >= 48) break;
        }
      }

      for (let a = 0; a < Math.min(positions.length, 8); a++) {
        for (let b = a + 1; b < Math.min(positions.length, 9); b++) {
          for (const altA of positions[a].alts.slice(0, 3)) {
            for (const altB of positions[b].alts.slice(0, 3)) {
              const chars = original.split("");
              chars[positions[a].index] = altA;
              chars[positions[b].index] = altB;
              addVariant(twoChars, chars.join(""), "sửa 2 ký tự OCR dễ nhầm");
              if (twoChars.length >= 72) break;
            }
            if (twoChars.length >= 72) break;
          }
          if (twoChars.length >= 72) break;
        }
        if (twoChars.length >= 72) break;
      }

      return [
        { name: "caret", sourceLabel: "DB exact", mode: "exact", variants: caret, d1storeLimit: 16 },
        { name: "case", sourceLabel: "DB exact", mode: "exact", variants: caseFix, d1storeLimit: 16 },
        { name: "O/0/Q", sourceLabel: "DB exact", mode: "exact", variants: o0One, d1storeLimit: 24 },
        { name: "1 ký tự dễ nhầm", sourceLabel: "DB exact", mode: "exact", variants: otherOne, d1storeLimit: 36 },
        { name: "2 ký tự dễ nhầm", sourceLabel: "DB exact", mode: "exact", variants: twoChars, d1storeLimit: 48 },
        { name: "khóa OCR gần đúng", sourceLabel: "IndexedDB loose", mode: "loose", variants: [{ code: original, reason: "khớp khóa OCR gần đúng duy nhất trong cache đơn thật" }], d1storeLimit: 0 }
      ].filter(stage => stage.variants.length);
    }

    function addDbVerifiedFound(found, order, variant, source, stageName) {
      if (!order || order.warehouse_code !== getWarehouse() || order.status !== "NO_RIDER") return;
      const key = getDbVerifiedOrderKey(order);
      if (!key) return;
      if (!found.has(key)) {
        found.set(key, {
          order,
          usedKey: variant?.code || "",
          reason: (variant?.reason || stageName || "khớp DB duy nhất"),
          source
        });
      }
    }

    function buildDbVerifiedResult(found, stage, tried) {
      const values = Array.from(found.values());
      return {
        orders: values.map(item => item.order),
        ambiguous: values.length > 1,
        usedKey: values[0]?.usedKey || "",
        reason: values[0]?.reason || stage?.name || "",
        source: values[0]?.source || stage?.sourceLabel || "",
        tried
      };
    }

    async function findUniqueNoRiderOrderByDbVerifiedOcr(suffix) {
      const key = cleanOcrOrderCode(suffix);
      if (!key || key.length < 5 || key.length > 30) return { orders: [], ambiguous: false, usedKey: "", tried: 0 };
      const stages = buildOcrDbVerifiedSearchStages(key);
      if (!stages.length) return { orders: [], ambiguous: false, usedKey: "", tried: 0 };

      let localOrders = null;
      async function getLocalOrders() {
        if (localOrders) return localOrders;
        const map = new Map();
        function add(order) {
          if (!order || order.warehouse_code !== getWarehouse() || order.status !== "NO_RIDER") return;
          const orderKey = getDbVerifiedOrderKey(order);
          if (orderKey) map.set(orderKey, order);
        }
        (allOrders || []).forEach(add);
        try {
          const cachedOrders = await localLoadOrdersForCurrentWarehouse();
          (cachedOrders || []).forEach(add);
          if (cachedOrders?.length) mergeOrdersIntoMemory(cachedOrders);
        } catch (cacheError) {
          console.warn("DB verified OCR cache warning:", cacheError);
        }
        localOrders = Array.from(map.values());
        return localOrders;
      }

      let totalTried = 0;
      for (const stage of stages) {
        const found = new Map();
        const variants = stage.variants || [];
        totalTried += variants.length;

        const orders = await getLocalOrders();
        if (stage.mode === "loose") {
          const looseMatches = collectNoRiderOrdersByLooseOcrSuffix(orders, key);
          looseMatches.forEach(order => addDbVerifiedFound(found, order, variants[0], "IndexedDB loose", stage.name));
        } else {
          for (const variant of variants) {
            orders.forEach(order => {
              if (exactEndsWith(order.order_code, variant.code)) {
                addDbVerifiedFound(found, order, variant, "IndexedDB exact", stage.name);
              }
            });
          }
        }

        if (found.size) {
          const result = buildDbVerifiedResult(found, stage, totalTried);
          return found.size === 1 ? result : { ...result, ambiguous: true };
        }

        if (stage.mode !== "exact" || !stage.d1storeLimit) continue;
        for (const variant of variants.slice(0, stage.d1storeLimit)) {
          const d1storeOrders = await findNoRiderOrdersBySuffixFromD1(variant.code);
          if (d1storeOrders.length) {
            mergeOrdersIntoMemory(d1storeOrders);
            try { await localSaveOrders(d1storeOrders); } catch {}
          }
          d1storeOrders.forEach(order => addDbVerifiedFound(found, order, variant, "Server exact", stage.name));
          if (found.size > 1) break;
        }

        if (found.size) {
          const result = buildDbVerifiedResult(found, stage, totalTried);
          return found.size === 1 ? result : { ...result, ambiguous: true };
        }
      }

      return { orders: [], ambiguous: false, usedKey: "", tried: totalTried };
    }

    async function findUniqueNoRiderOrderByLooseOcrKeyLocalFirst(suffix) {
      const key = cleanOcrOrderCode(suffix);
      if (!key || key.length < 5 || key.length > 30) return { orders: [], ambiguous: false, usedKey: "", tried: 0 };

      let matches = collectNoRiderOrdersByLooseOcrSuffix(allOrders, key);
      if (!matches.length) {
        try {
          const cachedOrders = await localLoadOrdersForCurrentWarehouse();
          matches = collectNoRiderOrdersByLooseOcrSuffix(cachedOrders, key);
          if (matches.length) mergeOrdersIntoMemory(matches);
        } catch (cacheError) {
          console.warn("Loose OCR local search warning:", cacheError);
        }
      }

      if (matches.length === 1) {
        const usedKey = String(matches[0].order_code || "").slice(-key.length);
        return { orders: matches, ambiguous: false, usedKey, tried: 1 };
      }
      if (matches.length > 1) return { orders: matches, ambiguous: true, usedKey: "", tried: 1 };
      return { orders: [], ambiguous: false, usedKey: "", tried: 1 };
    }

    function buildOcrDbVerifiedConfusionSearchVariants(value) {
      const original = cleanOcrOrderCode(value);
      if (!original || original.length < 5 || original.length > 30) return [];

      const variants = [];
      const seen = new Set([original]);
      function addVariant(code) {
        const cleaned = cleanOcrOrderCode(code);
        if (!cleaned || cleaned === original || seen.has(cleaned)) return;
        seen.add(cleaned);
        variants.push(cleaned);
      }

      if (/^[0-9]/.test(original) && /[a-z]/.test(original)) {
        addVariant(original.replace(/[a-z]/g, ch => ch.toUpperCase()));
      }

      const altMap = {
        "I": ["J", "1", "l"], "J": ["I", "1", "l"], "i": ["j", "1", "l"], "j": ["i", "1", "l"], "l": ["I", "J", "1", "i", "j"], "1": ["I", "J", "i", "j", "l"],
        "V": ["Y"], "Y": ["V"], "v": ["y"], "y": ["v"],
        "S": ["5"], "s": ["5"], "5": ["S", "s"],
        "B": ["8"], "b": ["8"], "8": ["B", "b"],
        "Z": ["2"], "z": ["2"], "2": ["Z", "z"],
        "G": ["6"], "g": ["6"], "6": ["G", "g"],
        "T": ["7"], "t": ["7"], "7": ["T", "t"],
        "A": ["4"], "a": ["4"], "4": ["A", "a"]
      };

      const positions = [];
      for (let i = 0; i < original.length; i++) {
        const alts = altMap[original[i]];
        if (alts && alts.length) positions.push({ index: i, alts });
      }

      for (const pos of positions.slice(0, 10)) {
        for (const alt of pos.alts.slice(0, 5)) {
          const chars = original.split("");
          chars[pos.index] = alt;
          addVariant(chars.join(""));
          if (variants.length >= 24) return variants;
        }
      }

      return variants.slice(0, 24);
    }

    async function findUniqueNoRiderOrderByOcrConfusionVariants(suffix) {
      const variants = buildOcrDbVerifiedConfusionSearchVariants(suffix);
      if (!variants.length) return { orders: [], ambiguous: false, usedKey: "", tried: 0 };

      const found = new Map();
      let firstUsedKey = "";
      let tried = 0;

      for (const variant of variants) {
        tried += 1;
        const result = await findNoRiderOrdersBySuffixLocalFirst(variant);
        for (const order of (result.orders || [])) {
          const key = String(order.order_code || order.id || "");
          if (!key) continue;
          if (!found.has(key)) found.set(key, order);
          if (!firstUsedKey) firstUsedKey = variant;
        }
        if (found.size > 1) {
          return { orders: Array.from(found.values()), ambiguous: true, usedKey: firstUsedKey, tried };
        }
      }

      const orders = Array.from(found.values());
      return { orders: orders.length === 1 ? orders : [], ambiguous: orders.length > 1, usedKey: firstUsedKey, tried };
    }



    async function findUniqueNoRiderOrderByTerminalCaretVariant(suffix) {
      const variant = getOcrTerminalCaretDropCandidate(suffix);
      const original = cleanOcrOrderCode(suffix);
      if (!variant || !original || variant === original) {
        return { orders: [], ambiguous: false, usedKey: "", tried: 0 };
      }

      const result = await findNoRiderOrdersBySuffixLocalFirst(variant);
      const orders = result.orders || [];
      if (orders.length === 1) return { orders, ambiguous: false, usedKey: variant, tried: 1 };
      if (orders.length > 1) return { orders, ambiguous: true, usedKey: variant, tried: 1 };
      return { orders: [], ambiguous: false, usedKey: variant, tried: 1 };
    }


    function matchOrderByHandoverLookupKey(order, key) {
      const k = clean(key);
      if (!order || !k) return "";
      const orderCode = clean(order.order_code || order.tracking_no || "");
      const orderSn = getRealShopeeOrderSn(order);
      if (orderCode && (exactEqual(orderCode, k) || exactEndsWith(orderCode, k))) return "Mã vận đơn";
      if (orderSn && (exactEqual(orderSn, k) || exactEndsWith(orderSn, k))) return "Mã đơn hàng";
      return "";
    }

    function normalizeLookupMatchedOrders(orders, key, source) {
      return (orders || []).map(o => {
        const n = normalizeOrder(o);
        n.matched_by = o.matched_by || matchOrderByHandoverLookupKey(n, key) || source || "";
        n.lookup_key = key;
        return n;
      });
    }

    async function findNoRiderOrdersByLookupFromCloud(key) {
      if (typeof apiPost !== "function") return [];
      try {
        const res = await apiPost("/api/orders/lookup_for_handover", {
          warehouse: getWarehouse(),
          keys: [key],
          limit: 50,
          days: INITIAL_LOAD_DAYS_BACK
        });
        const first = res && Array.isArray(res.results) ? res.results.find(r => clean(r.key) === clean(key)) : null;
        const orders = first && Array.isArray(first.orders) ? first.orders : [];
        return normalizeLookupMatchedOrders(orders, key, "Server");
      } catch (e) {
        console.warn("D1 lookup_for_handover warning:", e);
        return [];
      }
    }

    async function findNoRiderOrdersBySuffixLocalFirst(suffix) {
      const key = clean(suffix);
      if (!key) return { source: "EMPTY", orders: [] };

      // V31: Rider thường đưa Mã đơn hàng/order_sn trên điện thoại.
      // App phải dùng order_sn để tìm ngược location + Mã vận đơn; bước bàn giao vẫn scan Mã vận đơn trên bill.
      let localMatches = normalizeLookupMatchedOrders(
        allOrders
          .filter(order => order.warehouse_code === getWarehouse())
          .filter(order => order.status === "NO_RIDER")
          .filter(order => !!matchOrderByHandoverLookupKey(order, key)),
        key,
        "Bộ nhớ"
      );

      if (localMatches.length) {
        return { source: "INDEXEDDB_MEMORY", orders: localMatches };
      }

      // 2) Nếu bộ nhớ chưa có đủ, đọc lại IndexedDB trực tiếp.
      try {
        const cachedOrders = await localLoadOrdersForCurrentWarehouse();
        localMatches = normalizeLookupMatchedOrders(
          cachedOrders
            .filter(order => order.status === "NO_RIDER")
            .filter(order => !!matchOrderByHandoverLookupKey(order, key)),
          key,
          "IndexedDB"
        );

        if (localMatches.length) {
          mergeOrdersIntoMemory(localMatches);
          return { source: "INDEXEDDB", orders: localMatches };
        }
      } catch (cacheError) {
        console.warn("IndexedDB local lookup warning:", cacheError);
      }

      // 3) D1/Cloud local lookup: tìm cả Mã vận đơn và Mã đơn hàng/order_sn, không đọc D1.
      const d1Matches = await findNoRiderOrdersByLookupFromCloud(key);
      if (d1Matches.length) {
        mergeOrdersIntoMemory(d1Matches);
        await localSaveOrders(d1Matches);
        return { source: "D1ITE_LOOKUP", orders: d1Matches };
      }

      // 4) Fallback D1 cũ chỉ để cứu trường hợp nhập Mã vận đơn mà local/Cloud chưa có.
      const d1storeMatches = await findNoRiderOrdersBySuffixFromD1(key);
      if (d1storeMatches.length) {
        const normalizedD1 = normalizeLookupMatchedOrders(d1storeMatches, key, "Server");
        mergeOrdersIntoMemory(normalizedD1);
        await localSaveOrders(normalizedD1);
        await localPersistCurrentState();
        return { source: "FIRESTORE", orders: normalizedD1 };
      }

      return { source: "NOT_FOUND", orders: [] };
    }

    async function findNoRiderOrdersBySuffixFromD1(suffix) {
      const key = clean(suffix);
      if (!key) return [];

      // Full code phải tìm được dù đơn cũ chưa có suffix_keys hoặc doc id không theo safeOrderId.
      const directRef = doc(db, getOrdersCollectionName(), safeOrderId(key));
      const directSnap = await getDoc(directRef);
      if (directSnap.exists()) {
        const order = normalizeOrder({ id: directSnap.id, ...directSnap.data() });
        if (order.status === "NO_RIDER" && exactEndsWith(order.order_code, key)) return [order];
      }

      const exactCodeQuery = query(
        collection(db, getOrdersCollectionName()),
        where("order_code", "==", key),
        limit(5)
      );
      const exactCodeSnap = await getDocs(exactCodeQuery);
      const exactCodeMatches = exactCodeSnap.docs
        .map(d => normalizeOrder({ id: d.id, ...d.data() }))
        .filter(order => order.status === "NO_RIDER" && exactEqual(order.order_code, key));
      if (exactCodeMatches.length) return exactCodeMatches;

      // Nếu chỉ nhập/scan đuôi mã, dùng suffix_keys của đơn mới.
      const q = query(
        collection(db, getOrdersCollectionName()),
        where("suffix_keys", "array-contains", key),
        limit(20)
      );

      const snap = await getDocs(q);
      return snap.docs
        .map(d => normalizeOrder({ id: d.id, ...d.data() }))
        .filter(order => order.status === "NO_RIDER" && exactEndsWith(order.order_code, key));
    }

    function normalizeStatusForUi(status) {
      const raw = String(status || "NO_RIDER").trim();
      const s = raw.toUpperCase().replace(/[\s-]+/g, "_");
      if (["HANDED_OVER", "HANDEDOVER", "HANDOVER", "HANDOVERED", "HANDED", "DELIVERED", "DONE", "COMPLETED", "FINISHED", "SUCCESS", "DA_BAN_GIAO", "DABANGIAO", "ĐÃ_BÀN_GIAO"].includes(s)) return "HANDED_OVER";
      if (["DELETED", "DELETE", "REMOVED", "VOID"].includes(s)) return "DELETED";
      if (["CANCELLED", "CANCELED", "CANCEL", "CANCELLED_ORDER", "CANCELED_ORDER", "DA_HUY", "DAHUY", "ĐÃ_HỦY"].includes(s)) return "CANCELLED";
      if (["NO_RIDER", "NORIDER", "READY", "PREPARED", "CHUAN_BI", "CHUẨN_BỊ"].includes(s)) return "NO_RIDER";
      return raw || "NO_RIDER";
    }

    function normalizeOrder(o) {
      o = o || {};
      const code = o.order_code || o.tracking_no || o.trackingNo || o.code || "";
      const rawLoc = o.location_base || o.location || o.location_code || o.pick_location || "";
      const sub = o.sub_code || o.sub || o.pick_sub || "";
      let wh = String(o.warehouse_code || o.warehouse || "").trim().toUpperCase();
      // Free-form location upload in older builds could accidentally set warehouse_code to
      // values like "duy", "11", "A1". Those records belong to the selected orders_v280_WHx
      // collection and must still render on HTML. Only keep real WH codes; otherwise use current UI warehouse.
      if (!/^WH\d+$/i.test(wh)) wh = getWarehouse();
      return {
        id: o.id || o.doc_id || o.order_id || safeOrderId(code || ""),
        order_code: code,
        order_sn: o.order_sn || o.cloud_d0_aux2_order_sn || o.shopee_order_sn || o.shopee_order_code || "",
        cloud_d0_aux2_order_sn: o.cloud_d0_aux2_order_sn || o.order_sn || o.shopee_order_sn || o.shopee_order_code || "",
        shopee_order_sn: o.shopee_order_sn || o.order_sn || o.cloud_d0_aux2_order_sn || o.shopee_order_code || "",
        order_sn_display: o.order_sn_display || o.shopee_order_sn_display || o.cloud_d0_aux2_order_sn_display || "",
        shopee_order_sn_display: o.shopee_order_sn_display || o.order_sn_display || o.cloud_d0_aux2_order_sn_display || "",
        cloud_d0_aux2_order_sn_lookup_attempts: Number(o.cloud_d0_aux2_order_sn_lookup_attempts || o.order_sn_lookup_attempts || 0),
        order_sn_lookup_status: o.order_sn_lookup_status || o.cloud_d0_aux2_order_sn_lookup_status || "",
        matched_by: o.matched_by || "",
        lookup_key: o.lookup_key || "",
        sls_tn: "",
        cloud_d0_aux2_sls_tn: "",
        warehouse_code: wh,
        location_code: rawLoc,
        sub_code: sub,
        note: o.note || "",
        status: normalizeStatusForUi(o.status || o.queue_status || o.order_status || "NO_RIDER"),
        hold_id: o.hold_id || o.holdId || o.hold_ticket_id || "",
        hold_ticket_id: o.hold_ticket_id || o.hold_id || o.holdId || "",
        hold_ticket_no: o.hold_ticket_no || "",
        hold_status: o.hold_status || o.hold_workflow_status || "",
        hold_workflow_status: o.hold_workflow_status || o.hold_status || "",
        hold_driver_name: o.hold_driver_name || "",
        hold_received_by: o.hold_received_by || "",
        hold_picked_by: o.hold_picked_by || "",
        hold_handed_over_by: o.hold_handed_over_by || "",
        hold_last_operator: o.hold_last_operator || "",
        prepared_at: o.prepared_at || o.created_at || "",
        rider_arrived_at: o.rider_arrived_at || "",
        handed_over_at: o.handed_over_at || "",
        created_at: o.created_at || o.prepared_at || "",
        updated_at: o.updated_at || o.created_at || o.prepared_at || "",
        created_at_ms: Number(o.created_at_ms || o.prepared_at_ms || o.updated_at_ms || 0),
        updated_at_ms: Number(o.updated_at_ms || o.created_at_ms || o.prepared_at_ms || 0),
        rider_arrived_at_ms: Number(o.rider_arrived_at_ms || 0),
        handed_over_at_ms: Number(o.handed_over_at_ms || 0),
        cancelled_at_ms: Number(o.cancelled_at_ms || o.canceled_at_ms || 0),
        deleted_at_ms: Number(o.deleted_at_ms || 0),
        created_by: o.created_by || o.created_operator || "",
        updated_by: o.updated_by || o.updated_operator || "",
        handed_over_by: o.handed_over_by || "",
        deleted_by: o.deleted_by || "",
        cancelled_by: o.cancelled_by || o.canceled_by || "",
        last_operator: o.hold_last_operator || o.last_operator || o.last_operator_email || o.updated_by || o.handed_over_by || o.deleted_by || o.cancelled_by || o.created_by || "",
        last_operation: o.last_operation || o.last_action || o.operation || "",
        last_operation_at: o.last_operation_at || o.updated_at || o.created_at || "",
        last_operation_at_ms: Number(o.last_operation_at_ms || o.updated_at_ms || o.created_at_ms || 0)
      };
    }

    function toDate(value) {
      if (!value) return null;
      if (value.toDate) return value.toDate();
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    function formatDate(value) {
      const d = toDate(value);
      if (!d) return "-";
      return d.toLocaleTimeString("vi-VN") + " " + d.toLocaleDateString("vi-VN");
    }

    function getDeleteAtAfter15Days() {
      return new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    }

    function setMessage(text, color = "#333") {
      const el = document.getElementById("message");
      el.textContent = text || "";
      el.className = "message" + (color === "red" ? " red" : color === "green" ? " green" : "");
      if (color !== "red" && color !== "green") el.style.color = color;
    }
    function setHandoverMessage(text, color = "#333") {
      const el = document.getElementById("handoverMessage");
      el.textContent = text || "";
      el.className = "message" + (color === "red" ? " red" : color === "green" ? " green" : "");
      if (color !== "red" && color !== "green") el.style.color = color;
    }
    function setScanMessage(text, color = "#333") {
      const el = document.getElementById("scanMessage");
      el.textContent = text || "";
      el.className = "message" + (color === "red" ? " red" : color === "green" ? " green" : "");
      if (color !== "red" && color !== "green") el.style.color = color;
    }

    function withTimeout(promise, ms, label) {
      return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error((label || "Tác vụ") + " quá thời gian chờ")), ms))
      ]);
    }

    function maxOrderUpdatedAtMsFromList(orders) {
      return (orders || []).reduce((max, order) => Math.max(max, Number(order?.updated_at_ms || 0), dateToMs(order?.updated_at), dateToMs(order?.created_at), dateToMs(order?.prepared_at)), 0);
    }

    function updateTodayLoadedOrderMeta(orders) {
      const list = Array.isArray(orders) ? orders : allOrders;
      todayLoadedOrderCount = Array.isArray(list) ? list.filter(order => order && order.warehouse_code === getWarehouse() && !orderHiddenFromHtml(order)).length : 0;
      ordersLastServerUpdatedAtMs = Math.max(ordersLastServerUpdatedAtMs || 0, maxOrderUpdatedAtMsFromList(list));
    }

    function updateRefreshIndicator(statusText = "") {
      const countdownEl = document.getElementById("refreshCountdown");
      if (countdownEl) countdownEl.textContent = String(todayLoadedOrderCount || (Array.isArray(allOrders) ? allOrders.length : 0));
      document.getElementById("refreshDot").classList.toggle("loading", isLoadingOrders);
      if (statusText) document.getElementById("refreshStatus").textContent = statusText;
    }

    function startAutoRefresh() {
      if (autoRefreshTimer) clearInterval(autoRefreshTimer);
      refreshCountdownValue = refreshIntervalSeconds;
      updateRefreshIndicator("Đọc theo số đơn hôm nay + đang nghe đơn mới.");
      autoRefreshTimer = setInterval(async () => {
        if (!db) return;
        if (isLoadingOrders) {
          updateRefreshIndicator("Đang tải dữ liệu...");
          return;
        }
        refreshCountdownValue -= 1;
        if (refreshCountdownValue <= 0) {
          refreshCountdownValue = refreshIntervalSeconds;
          updateRefreshIndicator("Đang kiểm tra đơn mới...");
          // Không loadOrders lại để giảm read; live_updates sẽ cập nhật.
          updateRefreshIndicator("Cập nhật trực tuyến đang chạy. Lần cuối kiểm tra: " + new Date().toLocaleTimeString("vi-VN"));
          return;
        }
        updateRefreshIndicator("Đọc theo số đơn hôm nay + đang nghe đơn mới.");
      }, 1000);
    }

    function playSound(type = "success") {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const ctx = new AudioContextClass();
        const playTone = (freq, start, dur, vol = .85) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "square";
          osc.frequency.setValueAtTime(freq, start);
          osc.connect(gain);
          gain.connect(ctx.destination);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(vol, start + .015);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
          osc.start(start);
          osc.stop(start + dur + .03);
        };
        const now = ctx.currentTime;
        if (type === "error") {
          playTone(220, now, .22, .95); playTone(160, now + .24, .28, .95);
        } else if (type === "scan") {
          playTone(880, now, .16, .9); playTone(1175, now + .17, .18, .9);
        } else if (type === "handover") {
          playTone(660, now, .16, .95); playTone(880, now + .18, .16, .95); playTone(1320, now + .36, .28, .95);
        } else {
          playTone(660, now, .16, .85); playTone(880, now + .18, .18, .85);
        }
      } catch (e) { console.warn("Sound blocked", e); }
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }
  
