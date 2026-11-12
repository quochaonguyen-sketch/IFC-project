import {gate, authenticatedFetch, logout} from "/auth-client.js";
let app = null;
let auth = null;
let listeners = [];
let ws = null;
let wsBusy = false;
let wsPaused = false;
let reconnectTimer = null;
let lastSeq = 0;
let lastWsActivityMs = 0;
let heartbeatTimer = null;
let reconnectAttempt = 0;
let currentStatus = {
  ok: false,
  transport: "cloudflare_realtime_d1_d0",
  sql: { status: "offline" },
  websocket: { status: "offline", clients: 0 },
  updated_at_ms: 0
};

const RELOAD_DEBOUNCE = new Map();

function workerBase(){return location.origin;}
function id(prefix="id") { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`; }
function cleanParts(parts) { return parts.flatMap(v => String(v || "").split("/")).filter(Boolean).join("/"); }
function getUser() { return auth?.currentUser || null; }
function userEmail() { return String(getUser()?.email || "").toLowerCase(); }
function emit(name, detail) { try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {} }
function makeDate(value) { return value instanceof Date ? value : new Date(value); }
function normalize(value) {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (value && value.__serverTimestamp) return new Date().toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out = {};
    Object.entries(value).forEach(([k,v]) => { out[k] = normalize(v); });
    return out;
  }
  return value;
}
function snapDoc(row) {
  const data = row?.data || row || {};
  const docId = String(row?.id || data.id || "");
  return { id: docId, exists: () => !!row, data: () => ({ ...data, id: docId }) };
}
function missingDoc(docId) { return { id: docId, exists: () => false, data: () => undefined }; }
function querySnap(rows) { return { docs: (rows || []).map(r => snapDoc(r)), empty: !(rows || []).length, size: (rows || []).length }; }
function compareLocal(a, b) {
  const aa = typeof a === "string" && !Number.isNaN(Date.parse(a)) ? Date.parse(a) : a;
  const bb = typeof b === "string" && !Number.isNaN(Date.parse(b)) ? Date.parse(b) : b;
  if (aa === bb) return 0;
  return aa > bb ? 1 : -1;
}
function applyLocalConstraints(rows, constraints = []) {
  let output = Array.isArray(rows) ? rows.slice() : [];
  let limitN = null;
  for (const c of constraints || []) {
    if (c.type === "where") {
      output = output.filter(row => {
        const actual = row?.[c.field]; const expected = c.value; const cmp = compareLocal(actual, expected);
        if (c.op === "==") return actual === expected;
        if (c.op === ">") return cmp > 0;
        if (c.op === ">=") return cmp >= 0;
        if (c.op === "<") return cmp < 0;
        if (c.op === "<=") return cmp <= 0;
        if (c.op === "array-contains") return Array.isArray(actual) && actual.includes(expected);
        return true;
      });
    } else if (c.type === "orderBy") {
      const mult = String(c.direction || "asc").toLowerCase() === "desc" ? -1 : 1;
      output.sort((a, b) => compareLocal(a?.[c.field], b?.[c.field]) * mult);
    } else if (c.type === "limit") {
      limitN = Math.max(1, Number(c.n || 1));
    }
  }
  return limitN ? output.slice(0, limitN) : output;
}
function snapshotListenerFromCache(listener) {
  const rows = Array.from(listener.cache.values());
  return querySnap(applyLocalConstraints(rows, listener.constraints));
}
function hydrateListenerCache(listener, snapshot) {
  listener.cache.clear();
  (snapshot?.docs || []).forEach(d => {
    const data = d.data() || {}; const id = String(d.id || data.id || "");
    if (id) listener.cache.set(id, { ...data, id });
  });
  listener.hydratedAt = Date.now();
}
function applyDeltaToSingleListener(listener, msg = {}) {
  const relevant = msg.docs.filter(d => String(d?.collection_path || d?.collection || msg.collection || "") === listener.collection);
  if (!relevant.length) return false;
  for (const item of relevant) {
    const id = String(item?.id || item?.doc_id || item?.data?.id || "");
    if (!id) continue;
    if (item.deleted || item.op === "delete") listener.cache.delete(id);
    else listener.cache.set(id, { ...(item.data || item), id });
  }
  return true;
}
function applyRealtimeDeltaToListeners(msg = {}) {
  if (!Array.isArray(msg.docs)) return false;
  let notified = false;
  for (const listener of listeners) {
    const relevant = msg.docs.some(d => String(d?.collection_path || d?.collection || msg.collection || "") === listener.collection);
    if (!relevant) continue;
    // STRICT REALTIME: do not notify a listener from a single delta before the first full snapshot is hydrated.
    // This prevents a CANCELLED delta from temporarily replacing the whole HOLD list with an empty HTML view.
    if (!listener.hydrated) {
      listener.pendingDeltas = (listener.pendingDeltas || []).slice(-50);
      listener.pendingDeltas.push(msg);
      continue;
    }
    if (!applyDeltaToSingleListener(listener, msg)) continue;
    try { listener.callback(snapshotListenerFromCache(listener)); } catch (e) { if (listener.error) listener.error(e); }
    notified = true;
  }
  return notified;
}

function clearRealtimeListenerCachesForReset() {
  for (const listener of listeners) {
    listener.cache.clear();
    listener.pendingDeltas = [];
    listener.hydrated = true;
    try { listener.callback(snapshotListenerFromCache(listener)); } catch (e) { if (listener.error) listener.error(e); }
  }
}

async function cloudRequest(path, options = {}) {
  const user = getUser();
  if (!user) throw new Error("Bạn chưa đăng nhập IFC_01 Handover");
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || 15000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    
    const headers = new Headers(options.headers || {});
    
    headers.set("X-VNWL-Request-ID", id("req"));
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const target=new URL(path,workerBase());
    if(target.pathname.startsWith("/api/")&&!target.pathname.startsWith("/api/admin/")&&!target.pathname.startsWith("/api/kiosk/")&&!target.searchParams.has("warehouse")){
      const selected=document.getElementById("warehouseSelect")?.value||localStorage.getItem("ifc-warehouse")||"WH1";
      target.searchParams.set("warehouse",selected);
    }
    const response = await authenticatedFetch(target.href, { ...options, headers, cache: "no-store", signal: controller.signal });
    const payload = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
    if (!response.ok || payload?.ok === false) {
      const msg = payload?.message || (payload?.error && payload?.error !== "IFC_REQUEST" ? payload.error : null) || `HTTP ${response.status}`;
      const e = new Error(msg);
      e.status = response.status;
      e.payload = payload;
      throw e;
    }
    return payload;
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error("Server quá thời gian phản hồi (15 giây). Vui lòng thử lại.");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
async function get(path, options = {}) { return cloudRequest(path, { method: "GET", ...options }); }
async function post(path, payload = {}, options = {}) { return cloudRequest(path, { method: "POST", body: JSON.stringify(normalize(payload)), ...options }); }

function colPath(refOrQuery) { return refOrQuery?.__type === "query" ? refOrQuery.collectionRef.path : (refOrQuery?.path || ""); }
function scheduleReload(collectionPath = "*") {
  listeners.filter(l => collectionPath === "*" || l.collection === collectionPath).forEach(l => {
    if (l.hydratedAt && Date.now() - Number(l.hydratedAt || 0) < 5000) return;
    if (RELOAD_DEBOUNCE.has(l.id)) clearTimeout(RELOAD_DEBOUNCE.get(l.id));
    RELOAD_DEBOUNCE.set(l.id, setTimeout(async () => {
      RELOAD_DEBOUNCE.delete(l.id);
      try {
        const snapshot = await getDocs(l.ref);
        hydrateListenerCache(l, snapshot);
        l.hydrated = true;
        l.callback(snapshotListenerFromCache(l));
      } catch (e) { if (l.error) l.error(e); }
    }, 120));
  });
}
function wsUrl(ticket) {
  const base = workerBase().replace(/^http/i, "ws");
  return `${base}/v1/browser/ws?ticket=${encodeURIComponent(ticket)}`;
}
function markRealtimeOnline() {
  lastWsActivityMs = Date.now();
  const clients = Number(currentStatus?.websocket?.clients || 1);
  currentStatus = { ok: true, transport: "cloudflare_realtime_d1_d0", sql: { status: "online", ok: true }, websocket: { status: "online", clients }, updated_at_ms: lastWsActivityMs };
  emit("vnwl:connection_status", currentStatus);
}
function stopHeartbeat() { if (heartbeatTimer) clearInterval(heartbeatTimer); heartbeatTimer = null; }
function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send("ping"); markRealtimeOnline(); } catch (_) {}
  }, 60000);
}
async function connectRealtime() {
  if (wsPaused || wsBusy || !getUser() || (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING))) return;
  wsBusy = true;
  try {
    const ticket = await post("/v1/ws-ticket", {});
    ws = new WebSocket(wsUrl(ticket.ticket));
    ws.onopen = () => {
      reconnectAttempt = 0;
      markRealtimeOnline();
      startHeartbeat();
      emit("vnwl:ws_state", { status: "online", transport: "cloudflare_realtime_d1_d0", at_ms: Date.now() });
      // On open/reconnect, reconcile active listeners once so mobile/PC catch any event missed while sleeping/offline.
      setTimeout(() => scheduleReload("*"), 250);
    };
    ws.onmessage = (event) => {
      if (event.data === "pong") { markRealtimeOnline(); return; }
      let msg = null; try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.type === "connection_status") {
        currentStatus = msg.status || currentStatus;
        markRealtimeOnline();
        return;
      }
      markRealtimeOnline();
      if (msg.seq) lastSeq = Math.max(lastSeq, Number(msg.seq || 0));
      if (msg.type === "reset_all_data") clearRealtimeListenerCachesForReset();
      applyRealtimeDeltaToListeners(msg);
      emit("vnwl:ws_message", msg);
      // V2.0.23 QUOTA-SAFE: direct delta is already applied locally.
      // Do not re-read full D1 collection after every HOLD WebSocket delta.
      // Full reload is reserved only for explicit bootstrap/reload events or non-delta messages.
      const deltaCollection = msg.collection || msg.collection_path || "*";
      const needsFullReload = !!(msg.force_bootstrap || msg.bootstrap_required || msg.reload_d1 || msg.full_reload);
      if (needsFullReload || (!msg.direct_delta && msg.type !== "reset_all_data")) scheduleReload(deltaCollection);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      stopHeartbeat();
      ws = null;
      currentStatus = { ...currentStatus, ok: false, sql: { status: "offline" }, websocket: { status: "offline", clients: 0 }, updated_at_ms: Date.now() };
      emit("vnwl:connection_status", currentStatus);
      emit("vnwl:ws_state", { status: "offline", at_ms: Date.now() });
      if (!wsPaused && getUser()) {
        reconnectAttempt = Math.min(reconnectAttempt + 1, 5);
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectRealtime, Math.min(12000, 1000 * (2 ** reconnectAttempt)));
      }
    };
  } catch (e) {
    currentStatus = { ...currentStatus, ok: false, sql: { status: "offline", error: e.message }, websocket: { status: "offline", clients: 0 }, updated_at_ms: Date.now() };
    emit("vnwl:connection_status", currentStatus);
    if (!wsPaused && getUser()) {
      reconnectAttempt = Math.min(reconnectAttempt + 1, 5);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectRealtime, Math.min(12000, 1000 * (2 ** reconnectAttempt)));
    }
  } finally { wsBusy = false; }
}
function closeRealtime() { stopHeartbeat(); try { ws?.close(1000, "paused"); } catch (_) {} ws = null; }

export function initializeApp(){auth={currentUser:null};return {};}
export function initializeD1(){return {};}
export const initializeFirestore=initializeD1,getFirestore=initializeD1;
export function getAuth(){return auth;}
export async function signOut(){closeRealtime();await logout();}
export function onAuthStateChanged(obj,callback){
  let active=true;
  gate().then(user=>{
    if(!active||!user)return;
    obj.currentUser=user;
    const warehouseSelect=document.getElementById("warehouseSelect");
    if(warehouseSelect&&Array.isArray(user.warehouses)&&user.warehouses.length){
      const saved=localStorage.getItem("ifc-warehouse"),selected=user.warehouses.includes(saved)?saved:user.warehouses[0];
      warehouseSelect.replaceChildren(...user.warehouses.map(code=>{const option=document.createElement("option");option.value=code;option.textContent=code;return option;}));
      warehouseSelect.value=selected;localStorage.setItem("ifc-warehouse",selected);
    }
    const resetButton=document.getElementById("btnResetAllCurrentData");if(resetButton&&user.role!=="admin")resetButton.hidden=true;
    if((user.role==="admin"||user.role==="warehouse_admin")&&!document.getElementById("ifc-admin-link")){
      const link=document.createElement("a");link.id="ifc-admin-link";link.className="nav-link";link.href="/admin/";link.textContent="Quản trị kho và tài khoản";
      (document.querySelector(".nav-menu")||document.querySelector("aside")||document.body).append(link);
    }
    if(user.supportStations?.length&&!document.getElementById("ifc-desk-link")){
      const menu = document.querySelector(".nav-menu");
      const link = document.createElement("a");
      link.id = "ifc-desk-link";
      if (menu) link.className = "nav-link";
      link.href = "/support/";
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Bàn Customer Service";
      (menu || document.querySelector("aside") || document.body).append(link);
    }
    callback(user);connectRealtime();
  }).catch(e=>{if(active)document.body.textContent=e.message;});
  return ()=>{active=false;};
}
export function getConnectionStatus() {
  if (ws && ws.readyState === WebSocket.OPEN) { markRealtimeOnline(); }
  return currentStatus;
}
export async function getBackendMode() { return { ok: true, mode: "cloud_d1", apiBase: workerBase(), transport: "cloudflare_realtime_d1_d0" }; }
export function isRealtimeTransportSuspended() { return wsPaused; }
export async function suspendRealtimeTransportForIdle() { wsPaused = true; closeRealtime(); return { ok: true, suspended: true }; }
export async function resumeRealtimeTransportAfterIdle() { wsPaused = false; await connectRealtime(); return { ok: true, suspended: false }; }

export function collection(db, ...parts) { return { __type: "collection", path: cleanParts(parts) }; }
export function doc(dbOrCol, ...parts) {
  const path = dbOrCol?.__type === "collection" ? cleanParts([dbOrCol.path, ...parts]) : cleanParts(parts);
  const segments = path.split("/"); const docId = segments.pop() || "";
  return { __type: "doc", id: docId, path, collectionPath: segments.join("/") };
}
export function where(field, op, value) { return { type: "where", field, op, value: normalize(value) }; }
export function orderBy(field, direction = "asc") { return { type: "orderBy", field, direction }; }
export function limit(n) { return { type: "limit", n: Number(n || 0) }; }
export function query(collectionRef, ...constraints) { return { __type: "query", collectionRef, constraints }; }
export function serverTimestamp() { return { __serverTimestamp: true }; }
export async function getDoc(ref) {
  const d = await get(`/api/fs/doc?collection=${encodeURIComponent(ref.collectionPath)}&id=${encodeURIComponent(ref.id)}`);
  return d.exists ? snapDoc(d.doc) : missingDoc(ref.id);
}
export async function getDocs(ref) {
  const collectionPath = colPath(ref);
  const constraints = ref?.__type === "query" ? ref.constraints : [];
  const d = await post("/api/fs/query", { collection: collectionPath, constraints });
  return querySnap(d.docs || []);
}
async function commit(ops) { return post("/api/fs/commit", { request_id: id("commit"), ops }); }
export async function setDoc(ref, data, options = {}) { return commit([{ type: "set", collection: ref.collectionPath, id: ref.id, data: normalize(data), merge: !!options.merge }]); }
export async function updateDoc(ref, data) { return commit([{ type: "update", collection: ref.collectionPath, id: ref.id, data: normalize(data) }]); }
export async function deleteDoc(ref) { return commit([{ type: "delete", collection: ref.collectionPath, id: ref.id }]); }
export async function addDoc(col, data) { const ref = doc(col, data?.id || data?.order_id || id("doc")); await setDoc(ref, data); return ref; }
export function writeBatch() {
  const ops = [];
  return { set:(ref,d,o={})=>ops.push({type:"set",collection:ref.collectionPath,id:ref.id,data:normalize(d),merge:!!o.merge}), update:(ref,d)=>ops.push({type:"update",collection:ref.collectionPath,id:ref.id,data:normalize(d)}), delete:(ref)=>ops.push({type:"delete",collection:ref.collectionPath,id:ref.id}), commit:()=>commit(ops) };
}
export async function runTransaction(db, fn) {
  const ops=[];
  const tx={ get:getDoc, set:(ref,d,o={})=>ops.push({type:"set",collection:ref.collectionPath,id:ref.id,data:normalize(d),merge:!!o.merge}), update:(ref,d)=>ops.push({type:"update",collection:ref.collectionPath,id:ref.id,data:normalize(d)}), delete:(ref)=>ops.push({type:"delete",collection:ref.collectionPath,id:ref.id}) };
  const result=await fn(tx); if (ops.length) await commit(ops); return result;
}
export function onSnapshot(ref, callback, error) {
  const item={ id:id("listen"), collection:colPath(ref), ref, callback, error, constraints: ref?.__type === "query" ? (ref.constraints || []) : [], cache: new Map(), hydrated:false, hydratedAt:0, pendingDeltas:[] };
  listeners.push(item);
  const finishHydrate = (snapshot) => {
    hydrateListenerCache(item, snapshot);
    item.hydrated = true;
    const pending = item.pendingDeltas || [];
    item.pendingDeltas = [];
    pending.forEach(msg => { try { applyDeltaToSingleListener(item, msg); } catch (_) {} });
    callback(snapshotListenerFromCache(item));
  };
  const seed = window.__VNWL_D1_LISTENER_SEED?.[item.collection];
  if (seed && Array.isArray(seed.docs) && Date.now() - Number(seed.at_ms || 0) < 10000) {
    finishHydrate(querySnap(seed.docs));
  } else {
    getDocs(ref).then(finishHydrate).catch(e => error ? error(e) : console.error(e));
  }
  connectRealtime();
  return () => { listeners = listeners.filter(x => x.id !== item.id); };
}
export async function apiGet(path, options = {}) { return get(path, options); }
export async function apiPost(path, payload, options = {}) { return post(path, payload || {}, options); }
export async function createFirestoreBackup() { return { ok: true, disabled: true, message: "IFC_01 Handover vận hành dữ liệu trên Cloudflare." }; }
export async function listFirestoreBackups() { return { ok: true, disabled: true, items: [] }; }
export async function restoreFirestoreBackup() { throw new Error("Ứng dụng không lưu bản lịch sử vận hành trong trình duyệt."); }
export function getMasterMaintenanceState() { return { enabled: false }; }
export function startFallbackSync() { return null; }
export function stopFallbackSync() {}
