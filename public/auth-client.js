import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import config from "/firebase-config.js";

// The counter has its own Firebase identity even when staff open it in another tab.
export const deviceContext = location.pathname.startsWith("/kiosk/") ||
  (location.pathname.startsWith("/login/") && new URLSearchParams(location.search).get("device")==="1");
export const auth = getAuth(deviceContext ? initializeApp(config,"ifc-station-kiosk") : initializeApp(config));
export async function authenticatedFetch(path, options = {}) {
  const url = new URL(path, location.origin);
  if (url.origin !== location.origin) throw Error("Địa chỉ API không hợp lệ.");
  await auth.authStateReady();
  if (!auth.currentUser) throw Error("Bạn chưa đăng nhập.");
  const headers = new Headers(options.headers);
  headers.set("Authorization", "Bearer " + await auth.currentUser.getIdToken());
  return fetch(url, {...options, headers, cache:"no-store"});
}
export async function session() {
  const r = await authenticatedFetch("/api/session");
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Không lấy được quyền.");
  return data;
}
export async function gate() {
  try {
    const user = await session();
    if(location.pathname.startsWith("/kiosk/")&&user.role!=="kiosk"){
      location.replace("/login/?device=1");return null;
    }
    if ((location.pathname.startsWith("/admin/") && !["admin","warehouse_admin"].includes(user.role)) ||
        (!deviceContext && user.role==="kiosk")) {
      location.replace("/login/?next="+encodeURIComponent(location.pathname)); return null;
    }
    if (user.role==="customer_service" && !location.pathname.startsWith("/support/")) {
      location.replace("/support/"); return null;
    }
    return user;
  } catch {
    const next=encodeURIComponent(location.pathname);
    location.replace(location.pathname.startsWith("/kiosk/")?"/login/?device=1":"/login/?next="+next); return null;
  }
}
export async function logout() {
  sessionStorage.removeItem("ifc-draft");
  await signOut(auth);
  location.replace(deviceContext?"/login/?device=1":"/login/");
}
