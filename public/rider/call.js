import {guestVideo} from "/support/guest-video.js?v=0.7.6";
import {browserHandoff} from "/rider/browser-handoff.js?v=0.7.2";

const registerLeave = await browserHandoff(document.querySelector("#browser-help"), location.href);
document.querySelector("#call-content").hidden = false;
const rawCode = (location.hash.slice(1)||"").trim();
const code = (rawCode.toLowerCase() === "b5edaac0-78a3-40eb-9e33-84022dd87248" ? "vnhcm1" : rawCode), key = "ifc-call-" + code;
const token = sessionStorage.getItem(key) || crypto.randomUUID();
sessionStorage.setItem(key, token);
const state = document.querySelector("#state"), join = document.querySelector("#join"), end = document.querySelector("#end");
let timer, inFlight = false, stopped = false, stopVideo, retry = 0, shownTicket;

function pickupName(){try{return JSON.parse(sessionStorage.getItem("ifc-pickup-"+code)||"{}").name||"";}catch{return "";}}
async function callApi(action, extra = {}) {
  const response = await fetch("/api/rider/call", {
    method: "POST", headers: {"Content-Type": "application/json"}, cache: "no-store",
    body: JSON.stringify({...extra, action, code, token, rider_name:pickupName()}), signal: globalThis.AbortSignal?.timeout?.(12000)
  });
  const data = await response.json();
  if (!response.ok) {
    const error = Error(data.error || "IFC chưa xử lý được yêu cầu.");
    error.status = response.status;
    throw error;
  }
  return data;
}
function showReceipt(receipt) {
  if (!receipt?.ticket_no || receipt.ticket_no === shownTicket) return;
  shownTicket = receipt.ticket_no;
  document.querySelector("#assisted-receipt-number").textContent = String(receipt.seq).padStart(3, "0");
  document.querySelector("#assisted-receipt-ticket").textContent = receipt.ticket_no;
  document.querySelector("#assisted-receipt").hidden = false;
  if (window.parent !== window) {
    window.parent.postMessage({type: "ifc-assisted-receipt", token, receipt}, location.origin);
  }
}
function finish(message) {
  stopped = true;
  clearTimeout(timer);
  stopVideo?.();
  stopVideo = null;
  sessionStorage.removeItem(key);
  join.hidden = end.hidden = true;
  state.textContent = message;
}
function later(action, delay) {
  clearTimeout(timer);
  if (!stopped) timer = setTimeout(() => poll(action), delay);
}
async function poll(action) {
  if (stopped || inFlight) return;
  inFlight = true;
  try {
    const data = await callApi(action);
    if (stopped) return;
    showReceipt(data.receipt);
    if (["resolved", "cancelled"].includes(data.status)) { finish("Yêu cầu đã kết thúc."); return; }
    retry = 0;
    const number = String(data.queue?.number || 0).padStart(3, "0");
    state.textContent = data.station + " · Số chờ " + number + (data.status === "waiting"
      ? " · " + data.queue.ahead + " lượt trước bạn"
      : (data.status === "held" ? " · Cuộc gọi đang tạm giữ (Vui lòng giữ máy)…" : " · Lễ tân đã nhận lượt"));
    if (["accepted", "held"].includes(data.status) && !stopVideo) {
      join.hidden = false;
      stopVideo = guestVideo(join, signal => callApi("signal", signal), false, {
        autoStart: true, screenSharing: false, onEnded: error => {
          finish(error.message);
          callApi("receipt").then(data => showReceipt(data.receipt)).catch(() => {});
        }
      });
    }
    later("status", data.status === "waiting" ? 750 : 3000);
  } catch (error) {
    if (stopped) return;
    if ([400, 401, 403, 404, 410].includes(error.status)) { finish(error.message); return; }
    retry = Math.min(6000, retry ? retry * 2 : 1000);
    state.textContent = "Đang kết nối lại với IFC. Bạn giữ trang này để tiếp tục cùng lượt.";
    // A start whose response was lost is idempotent for this private token.
    later(action, retry);
  } finally { inFlight = false; }
}
end.onclick = async () => {
  stopped = true;
  clearTimeout(timer);
  stopVideo?.();
  end.disabled = true;
  try {
    const data = await callApi("cancel");
    showReceipt(data.receipt);
    finish("Yêu cầu đã kết thúc.");
  } catch {
    end.disabled = false;
    end.textContent = "Thử kết thúc lượt lại";
    state.textContent = "Đã dừng camera, micro và màn hình ở thiết bị. Hãy thử kết thúc lượt khi có mạng.";
  }
};
registerLeave(() => {
  stopped = true;
  clearTimeout(timer);
  stopVideo?.();
  sessionStorage.removeItem(key);
  const body = JSON.stringify({code, token, action: "cancel"});
  if (!navigator.sendBeacon?.("/api/rider/call", new Blob([body], {type: "application/json"}))) {
    fetch("/api/rider/call", {method: "POST", headers: {"Content-Type": "application/json"}, body, keepalive: true}).catch(() => {});
  }
  state.textContent = "Đang mở trình duyệt mặc định. IFC đã gửi yêu cầu kết thúc lượt ở trang này.";
});
void poll("start");
