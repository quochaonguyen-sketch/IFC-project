export function browserContext(userAgent, maxTouchPoints = 0) {
  const android = /Android/i.test(userAgent);
  const ios = /iPad|iPhone|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
  // In-app browsers do not consistently identify themselves. Keep manual help available too.
  const inApp = /Zalo|FBAN|FBAV|Instagram|\bLine\/|;\s*wv\b/i.test(userAgent);
  return {android, ios, inApp};
}

export function defaultBrowserIntent(href) {
  const url = new URL(href);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw Error("Link IFC không hợp lệ.");
  // Encode the fragment as opaque data so it cannot add Intent directives.
  const fragment = url.hash ? "#" + encodeURIComponent(url.hash.slice(1)) : "";
  url.hash = fragment;
  url.searchParams.delete("browser_help");
  const fallback = new URL(url); fallback.searchParams.set("browser_help", "1");
  // No package/component: Android uses its resolver and configured default browser.
  return "intent://" + url.host + url.pathname + url.search + url.hash + "#Intent;scheme=" + url.protocol.slice(0, -1) + ";action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=" + encodeURIComponent(fallback.href) + ";end";
}

export async function browserHandoff(container, href, onLeave = () => {}) {
  const context = browserContext(navigator.userAgent, navigator.maxTouchPoints);
  const fallback = new URL(href).searchParams.has("browser_help");
  const make = (tag, text) => { const node = document.createElement(tag); node.textContent = text || ""; return node; };
  const box = make("details");
  box.className = "ifc-browser-help";
  box.open = fallback;
  box.append(make("summary", "Cuộc gọi trong Zalo bị lỗi? Mở bằng trình duyệt mặc định"));
  box.append(make("p", "Bạn có thể nhập mã đơn và gửi yêu cầu hỗ trợ tại đây. Nếu Zalo không cho mở camera hoặc micro, hãy mở bằng trình duyệt mặc định để tiếp tục cuộc gọi. Không cần đăng nhập Gmail."));
  const instructions = make("p", "Bấm menu ⋯ hoặc ⋮ của Zalo, chọn Mở bằng trình duyệt / Mở ngoài. Nếu không có mục này, sao chép link bên dưới rồi dán vào trình duyệt bạn thường dùng.");
  const feedback = make("p"); feedback.setAttribute("role", "status");
  const url = new URL(href); url.searchParams.delete("browser_help");
  let leave = onLeave;
  const setOnLeave = callback => { leave = callback; };
  if (context.android) {
    const open = make("a", "Mở bằng trình duyệt mặc định");
    open.className = "ifc-browser-open"; open.href = defaultBrowserIntent(url.href);
    open.onclick = () => {
      leave();
      feedback.textContent = "Nếu không chuyển được, dùng menu Zalo để mở ngoài hoặc sao chép link. Nếu điện thoại hỏi chọn ứng dụng, hãy chọn trình duyệt bạn muốn dùng.";
    };
    box.append(open);
  } else if (context.ios) {
    box.append(make("p", "Trên iPhone, dùng menu của ứng dụng quét QR để mở ra trình duyệt. IFC không thể tự chuyển thay lựa chọn này."));
  }
  const link = make("input"); link.readOnly = true; link.value = url.href;
  link.setAttribute("aria-label", "Link IFC để mở trong trình duyệt");
  const copy = make("button", "Sao chép link"); copy.type = "button";
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(url.href); feedback.textContent = "Đã sao chép. Mở trình duyệt mặc định và dán link để gặp lễ tân."; }
    catch { link.focus(); link.select(); feedback.textContent = "Hãy nhấn giữ link đã chọn, chọn Sao chép, rồi dán vào trình duyệt mặc định."; }
  };
  box.append(instructions, link, copy, feedback); container.append(box);
  return setOnLeave;
}
