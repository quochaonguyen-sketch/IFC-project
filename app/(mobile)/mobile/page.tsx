// Restored from the user-supplied VNWL frontend archive.
export default function Page(){return <>
{"\n\n  "}<div id={"authLoginScreen"} className={"auth-login-screen"}><p id={"authRestoreStatus"} className={"auth-restore-status"} role={"status"}>Đang khôi phục phiên đăng nhập…</p>{"\n    "}<div className={"auth-login-box"} hidden={true}>{"\n      "}<div className={"auth-login-title"}>{"🔐 VNWL Login"}</div>
{"\n      "}<div className={"auth-login-subtitle"}>{"Chọn 1 trong 2 cách đăng nhập: Email/Password do admin cấp hoặc Google công ty đã được cấp quyền."}</div>
{"\n      "}<label htmlFor={"authEmailInput"}>{"Email"}</label>
{"\n      "}<input id={"authEmailInput"} type={"email"} autoComplete={"username"} placeholder={"Nhập email được cấp quyền"} />{"\n      "}<label htmlFor={"authPasswordInput"}>{"Mật khẩu"}</label>
{"\n      "}<input id={"authPasswordInput"} type={"password"} autoComplete={"current-password"} placeholder={"Nhập mật khẩu"} />{"\n      "}<button id={"btnAuthEmailPasswordLogin"} type={"button"} className={"auth-email-button"}>{"Đăng nhập bằng Email/Password"}</button>
{"\n      "}<button id={"btnAuthGoogleLogin"} type={"button"} className={"auth-google-button"}>{"Đăng nhập bằng Google"}</button>
{"\n      "}<div id={"authLoginError"} className={"auth-login-error"}></div>
{"\n      "}<div className={"auth-login-note"}>{"Email phải nằm trong danh sách user access. Tài khoản được cấp quyền dùng đầy đủ chức năng app VNWL, không chia quyền admin/operator."}</div>
{"\n    "}</div>
{"\n  "}</div>
<dialog id={"mobileSidebar"} aria-labelledby={"mobileSidebarTitle"}>
    <aside>
      <div className={"mobile-sidebar-heading"}>
        <strong id={"mobileSidebarTitle"}>VNWL App</strong>
        <button id={"mobileSidebarClose"} type={"button"} aria-label={"Đóng menu"}>×</button>
      </div>
{"\n      "}<label htmlFor={"warehouseSelect"}>{"Mã kho"}</label>
{"\n      "}<select id={"warehouseSelect"}>{"\n        "}<option value={"WH1"}>{"WH1"}</option>
{"\n        "}<option value={"WH2"}>{"WH2"}</option>
{"\n        "}<option value={"WH3"}>{"WH3"}</option>
{"\n        "}<option value={"WH4"}>{"WH4"}</option>
{"\n        "}<option value={"WH5"}>{"WH5"}</option>
{"\n      "}</select>
{"\n      "}<div className={"version-box"}>{"VNWL V2.0"}</div>
{"\n      "}<div id={"authUserBox"} className={"auth-user-box"}>{"Login: -"}</div>
{"\n      "}<button id={"btnAuthLogout"} className={"auth-logout-button"}>{"Đăng xuất"}</button>
{"\n      "}<div className={"nav-menu"}>{"\n        "}<button id={"navManage"} className={"nav-link"} style={{"display":"none"}} type={"button"}>{"📋 Quản lý đơn hàng"}</button>
{"\n        "}<button id={"navHandover"} className={"nav-link active"} type={"button"}>{"🚚 Bàn giao đơn"}</button>
{"\n      "}</div>
{"\n      "}<div className={"refresh-indicator"} style={{"display":"none"}}>{"\n        "}<div><span id={"refreshDot"} className={"refresh-dot"}></span>
<b>{"Cập nhật trực tuyến"}</b>
</div>
{"\n        "}<div>{"Đơn hôm nay đã tải: "}<b id={"refreshCountdown"}>{"0"}</b>
{" đơn"}</div>
{"\n        "}<div id={"refreshStatus"}>{"Đọc dữ liệu theo ca hôm nay + đang nghe live update."}</div>
{"\n      "}</div>
{"\n      "}<div id={"sourceHealthBox"} className={"source-health-box"}>{"\n        "}<div className={"source-health-title"}>{"Tình trạng hệ thống"}</div>
{"\n        "}<div className={"source-health-grid"}>{"\n          "}<div id={"chipSqlLive"} className={"source-chip offline"}><span>{"Server"}</span>
<span className={"dot"}></span>
</div>
{"\n        "}</div>
{"\n        "}<div id={"sourceHealthText"} className={"source-health-small"}>{"Đang kiểm tra kết nối..."}</div>
{"\n        "}<div id={"dailyFullResetPanel"} style={{"marginTop":"9px","padding":"9px 10px","borderRadius":"9px","background":"#0f172a","border":"1px solid #334155","color":"#e2e8f0","fontSize":"12px","lineHeight":"1.45"}}>{"\n          "}<div style={{"fontWeight":"900","color":"#fff"}}>{"🧹 Reset sạch dữ liệu vận hành"}</div>
{"\n          "}<div>{"Đơn + Phiếu + BOX + Slot xóa lúc "}<b>{"06:00"}</b>
</div>
{"\n          "}<div>{"Còn lại: "}<b id={"dailyFullResetCountdown"} style={{"color":"#fbbf24"}}>{"--:--:--"}</b>
</div>
{"\n        "}</div>
{"\n        "}<div id={"mobileConnectionPill"} className={"mobile-connection-pill warn"}>{"Mobile đang nối server..."}</div>
{"\n        "}<div id={"idleRealtimePanel"} style={{"display":"none","marginTop":"8px","padding":"8px","borderRadius":"8px","background":"#fff7ed","color":"#9a3412","fontSize":"12px","lineHeight":"1.4"}}>{"\n          "}<div id={"idleRealtimeMessage"}>{"Đã tạm ngắt cập nhật trực tuyến để tiết kiệm quota."}</div>
{"\n          "}<button id={"btnResumeRealtime"} type={"button"} style={{"marginTop":"7px","border":"0","borderRadius":"7px","padding":"8px 10px","background":"#f97316","color":"white","fontWeight":"bold","cursor":"pointer"}}>{"Kết nối lại"}</button>
{"\n        "}</div>
{"\n      "}</div>
{"\n      "}<div className={"mobile-contact-box"}>{"\n        "}<div className={"title"}>{"Contact"}</div>
{"\n        "}<div className={"email"}>{"duy.nguyenhuu01@spxexpress.com"}</div>
{"\n      "}</div>
</aside>
  </dialog>
{"\n        "}<div id={"idleReconnectModal"} style={{"display":"none","position":"fixed","inset":"0","zIndex":"100000","background":"rgba(15,23,42,.62)","alignItems":"center","justifyContent":"center","padding":"16px"}}>{"\n          "}<div style={{"width":"min(390px,96vw)","background":"#fff","borderRadius":"16px","padding":"18px","boxShadow":"0 20px 50px rgba(0,0,0,.30)","textAlign":"left"}}>{"\n            "}<div style={{"fontSize":"18px","fontWeight":"800","color":"#111827","marginBottom":"10px"}}>{"⏸️ Đã tạm ngắt cập nhật trực tuyến"}</div>
{"\n            "}<div style={{"fontSize":"14px","lineHeight":"1.55","color":"#374151"}}>{"Đã 30 phút không có thao tác chạm trên APP. Hệ thống đã tạm ngắt realtime để giảm sử dụng quota. Bạn có muốn kết nối lại không?"}</div>
{"\n            "}<div style={{"display":"flex","gap":"10px","marginTop":"18px","flexDirection":"column-reverse"}}>{"\n              "}<button id={"btnIdleReconnectNo"} type={"button"} style={{"border":"1px solid #d1d5db","borderRadius":"10px","padding":"12px","background":"#fff","color":"#374151","fontWeight":"700","cursor":"pointer"}}>{"Không, để offline"}</button>
{"\n              "}<button id={"btnIdleReconnectYes"} type={"button"} style={{"border":"0","borderRadius":"10px","padding":"12px","background":"#16a34a","color":"#fff","fontWeight":"800","cursor":"pointer"}}>{"Có, kết nối lại"}</button>
{"\n            "}</div>
{"\n            "}<div style={{"marginTop":"12px","fontSize":"12px","color":"#6b7280"}}>{"Tài khoản vẫn đăng nhập. Dữ liệu chỉ cập nhật lại sau khi bạn bấm Có."}</div>
{"\n          "}</div>
{"\n        "}</div>

  <div className={"app"}>
    <main>
      <header className={"mobile-app-bar"}>
        <strong>VNWL App</strong>
        <button id={"mobileSidebarOpen"} type={"button"} aria-haspopup={"dialog"} aria-controls={"mobileSidebar"}>
          <span aria-hidden={"true"}>☰</span> Menu
        </button>
      </header>{"\n      "}<section id={"pageManage"} className={"page"}>{"\n        "}<h1>{"Quản Lý Đơn Hàng"}</h1>
{"\n        "}<div className={"cards main-status-cards"}>{"\n          "}<div className={"card orange"}><div className={"label"}>{"CHUẨN BỊ"}</div>
<div id={"statNoRider"} className={"number"}>{"0"}</div>
</div>
{"\n          "}<div className={"card green"}><div className={"label"}>{"ĐÃ BÀN GIAO"}</div>
<div id={"statDone"} className={"number"}>{"0"}</div>
</div>
{"\n        "}</div>
{"\n\n        "}<div className={"panel"}>{"\n          "}<div className={"toolbar"}>{"\n            "}<input id={"searchInput"} autoComplete={"off"} placeholder={"Nhập hoặc scan mã đơn / location"} />{"\n            "}<select id={"statusFilter"}>{"\n              "}<option value={"ALL"}>{"Tất cả trạng thái"}</option>
{"\n              "}<option value={"NO_RIDER"}>{"Chuẩn bị"}</option>
{"\n              "}<option value={"HANDED_OVER"}>{"Đã bàn giao"}</option>
{"\n            "}</select>
{"\n            "}<select id={"displayLimit"} defaultValue={"100"}>{"\n              "}<option value={"100"}>{"100 dòng"}</option>
{"\n              "}<option value={"200"}>{"200 dòng"}</option>
{"\n              "}<option value={"500"}>{"500 dòng"}</option>
{"\n              "}<option value={"1000"}>{"1000 dòng"}</option>
{"\n            "}</select>
{"\n            "}<button className={"btn-blue"} id={"btnSearch"}>{"🔎 Tìm kiếm"}</button>
{"\n            "}<button className={"btn-dark"} id={"btnAdvancedSearch"}>{"Tìm nâng cao"}</button>
{"\n            "}<button className={"btn-dark"} id={"btnRefresh"}>{"Làm mới"}</button>
{"\n          "}</div>
{"\n\n          "}<div className={"create-zone"}>{"\n            "}<div className={"create-zone-title"}>{"🔥 KHU VỰC TẠO ĐƠN MỚI"}</div>
{"\n            "}<div className={"scan-guide-normal"}>{"\n  "}<div>{"Máy scan: Mã đơn hàng Shopee → Location → Sub → Tạo đơn"}</div>
{"\n  "}<div>{"Nhập tay: Enter/Tab chuyển Mã đơn hàng Shopee → Location → Sub; tại ô Sub nhấn Enter để tạo đơn. Sub không bắt buộc."}</div>
{"\n"}</div>
{"\n            "}<div className={"form-grid"}>{"\n              "}<input id={"newOrderCode"} autoComplete={"off"} autoCorrect={"off"} autoCapitalize={"off"} spellCheck={"false"} placeholder={"Mã đơn hàng Shopee"} aria-label={"Mã đơn hàng Shopee"} />{"\n              "}<input id={"newLocation"} autoComplete={"off"} autoCorrect={"off"} autoCapitalize={"off"} spellCheck={"false"} placeholder={"Location"} />{"\n              "}<input id={"newSub"} autoComplete={"off"} placeholder={"Sub"} />{"\n              "}<button className={"btn-green"} id={"btnCreate"}>{"➕ Tạo đơn"}</button>
{"\n            "}</div>
{"\n            "}<div className={"create-zone-tip"}>{"👉 Khu vực tạo đơn mới."}</div>
{"\n          "}</div>
{"\n\n          "}<div style={{"marginTop":"12px"}}>{"\n            "}<button className={"btn-red"} id={"btnCleanupDelivered"}>{"🧹 Reset sạch dữ liệu vận hành ngày hiện tại"}</button>
{"\n            "}<button className={"btn-red"} id={"btnResetAllCurrentData"} title={"Xóa sạch toàn bộ dữ liệu vận hành ca hiện tại: đơn, phiếu, BOX và Slot"}>{"🧨 Reset nhanh toàn bộ data"}</button>
{"\n          "}</div>
{"\n\n          "}<div id={"message"} className={"message"}></div>
{"\n          "}<div className={"hint"}>{"Lưu ý: hệ thống không phân biệt chữ hoa/chữ thường. ABC123, abc123, Abc123 được nhận diện là cùng một mã. Scan mã đơn → tự nhảy sang Location. Scan Location → tự tạo đơn."}</div>
{"\n        "}</div>
{"\n\n        "}<table>{"\n          "}<thead>{"\n            "}<tr>{"\n              "}<th>{"Mã đơn"}</th>
<th>{"Kho"}</th>
<th>{"Trạng thái"}</th>
<th>{"Vị trí"}</th>
<th>{"Sub"}</th>
<th>{"Chuẩn bị"}</th>
<th>{"Bàn giao"}</th>
<th>{"Thao tác"}</th>
{"\n            "}</tr>
{"\n          "}</thead>
{"\n          "}<tbody id={"ordersTable"}><tr><td colSpan={8}>{"Đang tải dữ liệu..."}</td>
</tr>
</tbody>
{"\n        "}</table>
{"\n      "}</section>
{"\n\n      "}<section id={"pageHandover"} className={"page active"}>{"\n        "}<h1>{"Bàn Giao Đơn - Mobile"}</h1>
{"\n        "}<div className={"panel"}><h2 className={"mobile-hold-title"}>Phiếu HOLD</h2>
{"\n          "}<div className={"handover-actions"}>{"\n            "}<select className={"hold-filter-select"} id={"holdTicketFilterSelect"} title={"Lọc phiếu HOLD"}>{"\n              "}<option value={"all"}>{"👁️ Tất cả phiếu HOLD"}</option>
{"\n              "}<option value={"waiting"}>{"🕓 Phiếu chờ nhận"}</option>
{"\n              "}<option value={"mine"}>{"📦 Phiếu đã nhận của tôi"}</option>
{"\n            "}</select>
{"\n            "}<button className={"btn-gray"} id={"btnToggleHoldSortOrder"} type={"button"} title={"Đổi thứ tự STT phiếu HOLD"}>{"⇅ STT: Lớn → Nhỏ"}</button>
{"\n            "}<button className={"btn-blue"} id={"btnAutoClaimHoldTicket"} type={"button"}>{"📦 Nhận phiếu tự động"}</button>
{"\n            "}<button className={"btn-orange"} id={"btnSortingWhilePicking"} type={"button"}>{"🧺 Sorting while picking"}</button>
{"\n            "}<button className={"btn-gray"} id={"btnReset"}>{"Làm mới phiên"}</button>
{"\n          "}</div>
{"\n          "}<div className={"hold-ticket-search"} style={{"display":"grid","gridTemplateColumns":"1fr auto auto","gap":"8px","marginTop":"10px","alignItems":"center"}}>{"\n            "}<input id={"holdTicketSearchInput"} autoComplete={"off"} autoCorrect={"off"} autoCapitalize={"off"} spellCheck={"false"} placeholder={"Scan / nhập mã phiếu HOLD hoặc mã BOX, ví dụ 20260526-0001 / BOX-001"} />{"\n            "}<button className={"btn-blue"} id={"btnSearchHoldTicket"}>{"🔍 Tìm phiếu"}</button>
{"\n            "}<button className={"btn-camera"} id={"btnCameraScanHoldTicket"}>{"📷 Scan QR phiếu"}</button>
{"\n          "}</div>
{"\n          "}<div id={"handoverMessage"} className={"message"}></div>
{"\n          "}<div id={"holdTicketList"} className={"hold-ticket-list"}></div>
{"\n        "}</div>
{"\n      "}</section>
{"\n    "}</main>
{"\n  "}</div>
{"\n\n  "}<div id={"handoverModal"} className={"modal"}>{"\n    "}<div className={"modal-box"}>{"\n      "}<div className={"modal-header"}>{"\n        "}<div>{"🚚 Bàn Giao Đơn Hàng"}</div>
{"\n        "}<button id={"btnCloseModal"} className={"close-btn"}>{"×"}</button>
{"\n      "}</div>
{"\n\n      "}<div className={"ticket-top"}>{"\n        "}<div className={"info-card"}>{"\n          "}<div className={"ticket-title"}>{"🚚 Thông Tin Lấy Hàng"}</div>
{"\n          "}<div className={"info-row"}>{"🏷️ Kho:"}<span id={"modalWarehouse"} className={"info-value"}>{"-"}</span>
</div>
{"\n          "}<div className={"info-row"}>{"📦 Số đơn hàng:"}<span id={"modalOrderCount"} className={"info-value"}>{"0"}</span>
</div>
{"\n          "}<div className={"info-row"}>{"📍 Tổng vị trí:"}<span id={"modalLocations"} className={"info-value"}>{"-"}</span>
</div>
{"\n        "}</div>
{"\n\n        "}<div className={"orders-card"}>{"\n          "}<div className={"ticket-title"}>{"📦 Danh Sách Đơn Hàng"}</div>
{"\n          "}<div id={"modalOrderList"} className={"ticket-list"}></div>
{"\n          "}<div className={"ticket-warning"}>{"💡 Vui lòng scan/nhập mã đơn hàng cụ thể để bàn giao"}</div>
{"\n        "}</div>
{"\n      "}</div>
{"\n\n      "}<div className={"progress-card"}>{"\n        "}<div style={{"fontWeight":"bold","marginBottom":"10px","color":"#4b5563"}}>{"📊 Tiến Độ Bàn Giao"}</div>
{"\n        "}<div className={"progress-bar"}><div id={"modalProgressFill"} className={"progress-fill"}></div>
</div>
{"\n        "}<div id={"modalProgressCount"} className={"progress-count"}>{"0/0"}</div>
{"\n      "}</div>
{"\n\n      "}<div className={"scan-panel"}>{"\n        "}<div className={"scan-panel-title"}>{"📦 Scan Mã AWB Đơn Hàng (mã đầy đủ):"}</div>
{"\n        "}<div className={"scan-box"}>{"\n          "}<input id={"scanInput"} autoComplete={"off"} className={"scan-input"} placeholder={"VD: Scan full mã đơn tại đây"} disabled={true} />{"\n          "}<button className={"btn-camera"} id={"btnCameraScanHandover"} disabled={true}>{"📷 Scan"}</button>
{"\n          "}<button className={"btn-camera-light"} id={"btnOcrScanHandover"} disabled={true}>{"🔤 OCR"}</button>
{"\n          "}<button className={"btn-blue"} id={"btnScan"} disabled={true}>{"✓ Kiểm Tra Đơn"}</button>
{"\n        "}</div>
{"\n        "}<div id={"scanMessage"} className={"message"}></div>
{"\n      "}</div>
{"\n\n      "}<div className={"modal-footer"}>
{"\n        "}<button id={"btnScanFocus"} className={"btn-green"}>{"⏳ Scan Đơn Hàng (0/0)"}</button>
{"\n        "}<button id={"btnBackFromModal"} className={"btn-dark"}>{"← Quay Lại"}</button>
{"\n      "}</div>
{"\n    "}</div>
{"\n  "}</div>
{"\n\n\n  "}<div id={"holdQrModal"} className={"modal"} aria-hidden={"true"}>{"\n    "}<div className={"modal-box hold-qr-modal-box"}>{"\n      "}<div className={"modal-header"}>{"\n        "}<div>{"🔳 Mã QR phiếu"}</div>
{"\n        "}<button id={"btnCloseHoldQrModal"} className={"close-btn"} type={"button"}>{"×"}</button>
{"\n      "}</div>
{"\n      "}<div className={"hold-qr-content"}>{"\n        "}<img id={"holdQrImage"} alt={"Mã QR phiếu"} src={""} />{"\n        "}<div id={"holdQrTicketNo"} className={"hold-qr-ticket-no"}>{"-"}</div>
{"\n        "}<div className={"hold-qr-hint"}>{"Đưa mã QR này cho nhân viên bàn giao scan phiếu."}</div>
{"\n        "}<div className={"hold-qr-actions"}>{"\n          "}<button id={"btnCopyHoldQrTicketNo"} className={"btn-blue"} type={"button"}>{"📋 Copy mã phiếu"}</button>
{"\n          "}<button id={"btnCloseHoldQrModalBottom"} className={"btn-dark"} type={"button"}>{"Đóng"}</button>
{"\n        "}</div>
{"\n      "}</div>
{"\n    "}</div>
{"\n  "}</div>
{"\n\n\n  "}<div id={"holdBoxModal"} className={"modal"} aria-hidden={"true"}>{"\n    "}<div className={"modal-box hold-box-modal-box"}>{"\n      "}<div className={"modal-header"}>{"\n        "}<div>{"📦 Scan BOX đi pick"}</div>
{"\n        "}<button id={"btnCloseHoldBoxModal"} className={"close-btn"} type={"button"}>{"×"}</button>
{"\n      "}</div>
{"\n      "}<div className={"hold-box-content"}>{"\n        "}<div id={"holdBoxTicketInfo"} className={"hold-box-ticket"}>{"Phiếu: -"}</div>
{"\n        "}<div className={"hold-box-guide"}>{"Scan mã BOX sau khi nhận phiếu, hoặc bấm Bỏ qua BOX nếu không dùng BOX. Một BOX chỉ dùng cho một phiếu đang hoạt động; BOX tự được giải phóng sau khi bàn giao hoàn tất hoặc xóa phiếu."}</div>
{"\n        "}<div className={"hold-box-input-row"}>{"\n          "}<input id={"holdBoxScanInput"} autoComplete={"off"} autoCorrect={"off"} autoCapitalize={"characters"} spellCheck={"false"} placeholder={"Scan barcode BOX tại đây"} />{"\n          "}<button id={"btnCameraScanHoldBox"} className={"btn-camera"} type={"button"}>{"📷 Scan BOX"}</button>
{"\n        "}</div>
{"\n        "}<div id={"holdBoxMessage"} className={"message"}></div>
{"\n        "}<div className={"hold-box-actions"}>{"\n          "}<button id={"btnConfirmHoldBox"} className={"btn-green"} type={"button"}>{"✅ Gắn BOX và đi pick"}</button>
{"\n          "}<button id={"btnSkipHoldBox"} className={"btn-gray"} type={"button"}>{"⏭️ Bỏ qua BOX"}</button>
{"\n          "}<button id={"btnCloseHoldBoxModalBottom"} className={"btn-dark"} type={"button"}>{"Đóng"}</button>
{"\n        "}</div>
{"\n      "}</div>
{"\n    "}</div>
{"\n  "}</div>
{"\n\n\n\n  "}<div id={"sortingPickModal"} className={"modal"} aria-hidden={"true"}>{"\n    "}<div className={"modal-box sorting-modal-box"}>{"\n      "}<div className={"modal-header"}>{"\n        "}<div>{"🧺 Sorting while picking"}</div>
{"\n        "}<button id={"btnCloseSortingPickModal"} className={"close-btn"} type={"button"}>{"×"}</button>
{"\n      "}</div>
{"\n      "}<div className={"sorting-content"}>{"\n        "}<div className={"hint"}>{"Hệ thống tự nhận tối đa 3 phiếu chờ nhận theo STT nhỏ nhất. Mỗi phiếu phải gắn 1 mã rổ/BOX. Khi pick từng đơn, nhân viên phải scan đúng rổ của phiếu đó: đúng báo ting, sai báo è."}</div>
{"\n        "}<div id={"sortingPickBatchInfo"} className={"message green"}></div>
{"\n        "}<div id={"sortingTicketBoxList"} className={"sorting-ticket-grid"}></div>
{"\n        "}<div id={"sortingPickMessage"} className={"message"}></div>
{"\n        "}<div className={"sorting-pick-table-wrap"}>{"\n          "}<table className={"sorting-pick-table"}>{"\n            "}<thead>{"\n              "}<tr><th>{"STT"}</th>
<th>{"Phiếu"}</th>
<th>{"Location/Sub"}</th>
<th>{"Mã đơn"}</th>
<th>{"Rổ đúng"}</th>
<th>{"Scan rổ"}</th>
<th>{"KQ"}</th>
</tr>
{"\n            "}</thead>
{"\n            "}<tbody id={"sortingPickTableBody"}><tr><td colSpan={7}>{"Chưa có batch sorting."}</td>
</tr>
</tbody>
{"\n          "}</table>
{"\n        "}</div>
{"\n        "}<div className={"sorting-actions"}>{"\n          "}<button id={"btnFinishSortingPick"} className={"btn-green"} type={"button"}>{"✅ Hoàn tất pick & mở scan bàn giao"}</button>
{"\n          "}<button id={"btnCancelSortingPick"} className={"btn-dark"} type={"button"}>{"Đóng"}</button>
{"\n        "}</div>
{"\n      "}</div>
{"\n    "}</div>
{"\n  "}</div>
{"\n\n  "}<div id={"cameraScannerModal"} className={"camera-modal"}>{"\n    "}<div className={"camera-box"}>{"\n      "}<div className={"camera-header"}>{"\n        "}<div id={"cameraScannerTitle"}>{"📷 Camera Scan"}</div>
{"\n        "}<button id={"btnCloseCameraScanner"} className={"close-btn"}>{"×"}</button>
{"\n      "}</div>
{"\n\n      "}<div id={"cameraReader"}></div>
{"\n\n      "}<div className={"camera-mode-row"}>{"\n        "}<button className={"btn-camera-light"} id={"btnCameraRestart"}>{"🔁 Quét lại nhanh"}</button>
{"\n        "}<button className={"btn-orange"} id={"btnCameraPowerMode"}>{"⚡ Barcode mạnh"}</button>
{"\n      "}</div>
{"\n\n      "}<div className={"camera-tips"}>{"\n        Mẹo scan barcode: xoay ngang điện thoại nếu mã dài, đưa mã vào giữa khung, giữ cách 10–25cm, đủ sáng.\n      "}</div>
{"\n\n      "}<div style={{"fontWeight":"900","marginTop":"12px"}}>{"Mã vừa scan"}</div>
{"\n      "}<div id={"cameraLastCode"} className={"camera-last"}>{"-"}</div>
{"\n\n      "}<div id={"cameraScannerMessage"} className={"message"}></div>
{"\n\n      "}<div className={"camera-actions"}>{"\n        "}<button className={"btn-camera-light"} id={"btnCameraPaste"}>{"✍️ Nhập tay"}</button>
{"\n        "}<button className={"btn-dark"} id={"btnCameraStop"}>{"⛔ Tắt camera"}</button>
{"\n      "}</div>
{"\n\n      "}<div className={"hint"}>{"\n        Check Bàn Giao: scan mã đơn / 5 ký tự cuối."}<br />{"\n        Bàn giao: scan full mã đơn. Không dùng clipboard để tránh lấy nhầm nội dung copy.\n      "}</div>
{"\n    "}</div>
{"\n  "}</div>
{"\n\n\n  "}<div id={"resultPopup"} className={"result-popup"}>{"\n    "}<div id={"resultBox"} className={"result-box"}>{"\n      "}<div id={"resultIcon"} className={"result-icon"}>{"✅"}</div>
{"\n      "}<div id={"resultTitle"} className={"result-title"}>{"Thành công"}</div>
{"\n      "}<div id={"resultMessage"} className={"result-message"}></div>
{"\n      "}<div id={"resultSuccessCopyPanel"} className={"result-success-copy-panel"}>{"\n        "}<div className={"result-success-copy-title"}>{"📋 Danh sách mã đơn đã bàn giao:"}</div>
{"\n        "}<div id={"resultSuccessOrderList"} className={"result-success-order-list"}></div>
{"\n        "}<div id={"resultSuccessCopyMessage"} className={"message result-success-copy-message"}></div>
{"\n        "}<button id={"btnCopyResultSuccessCodes"} className={"btn-blue result-success-copy-btn"} type={"button"}>{"📋 Copy danh sách mã đơn"}</button>
{"\n      "}</div>
{"\n      "}<button id={"btnResultClose"} className={"btn-dark result-close"}>{"Đóng"}</button>
{"\n    "}</div>
{"\n  "}</div>
{"\n\n\n\n  "}{"\n  "}<div id={"driverOcrModal"} className={"driver-ocr-modal"} aria-hidden={"true"}>{"\n    "}<div className={"driver-ocr-header"}>{"\n      "}<div>{"📱 Scan Bàn Giao"}</div>
{"\n      "}<button id={"btnDriverOcrClose"} type={"button"} aria-label={"Đóng"}>{"×"}</button>
{"\n    "}</div>
{"\n    "}<div className={"driver-ocr-view"}>{"\n      "}<video id={"driverOcrVideo"} playsInline={true} webkit-playsinline={""} muted={true} autoPlay={true}></video>
{"\n      "}<div className={"driver-ocr-frame"} aria-hidden={"true"}></div>
{"\n      "}<div className={"driver-ocr-frame-label"}>{"Đưa đúng dòng “Mã đơn hàng Shopee” vào khung cam"}</div>
{"\n      "}<div id={"driverOcrProcessing"} className={"driver-ocr-processing"}>{"Đang đọc mã..."}</div>
{"\n      "}<div id={"driverOcrResult"} className={"driver-ocr-result"}>{"\n        "}<div className={"driver-ocr-result-label"}>{"Mã đã nhận diện"}</div>
{"\n        "}<input id={"driverOcrCode"} className={"driver-ocr-result-code"} autoComplete={"off"} spellCheck={"false"} inputMode={"text"} defaultValue={""} />{"\n        "}<div id={"driverOcrMeta"} className={"driver-ocr-result-meta"}></div>
{"\n        "}<div className={"driver-ocr-result-actions"}>{"\n          "}<button id={"btnDriverOcrUse"} type={"button"}>{"Dùng mã"}</button>
{"\n          "}<button id={"btnDriverOcrRetake"} type={"button"}>{"Chụp lại"}</button>
{"\n        "}</div>
{"\n      "}</div>
{"\n    "}</div>
{"\n    "}<div className={"driver-ocr-controls"}>{"\n      "}<div id={"driverOcrZoomRow"} className={"driver-ocr-zoom"}>{"\n        "}<button id={"btnDriverOcrZoomOut"} type={"button"}>{"− Xa"}</button>
{"\n        "}<span id={"driverOcrZoomValue"}>{"1.0×"}</span>
{"\n        "}<button id={"btnDriverOcrZoomIn"} type={"button"}>{"+ Gần"}</button>
{"\n      "}</div>
{"\n      "}<div className={"driver-ocr-top-actions"}>{"\n        "}<button id={"btnDriverOcrCapture"} type={"button"} disabled={true}>{"📸 Chụp"}</button>
{"\n      "}</div>
{"\n      "}<div id={"driverOcrStatus"}></div>
{"\n    "}</div>
{"\n  "}</div>
{"\n\n\n  "}<div id={"ocrScanModal"} className={"ocr-modal"}>{"\n    "}<div className={"ocr-box"}>{"\n      "}<div className={"ocr-header"}>{"\n        "}<div id={"ocrScanTitle"}>{"🔤 Chụp mã chữ Shopee"}</div>
{"\n        "}<button id={"btnCloseOcrScan"} className={"close-btn"}>{"×"}</button>
{"\n      "}</div>
{"\n      "}<div className={"ocr-body"}>{"\n        "}<div id={"ocrCameraCard"} className={"ocr-camera-card"}>{"\n          "}<video id={"ocrVideo"} className={"ocr-video"} playsInline={true} muted={true}></video>
{"\n          "}<div className={"ocr-guide-mask"}></div>
{"\n          "}<div className={"ocr-scan-frame"}></div>
{"\n          "}<div className={"ocr-actions-overlay"}>{"\n            "}<button id={"btnOcrCapture"} className={"btn-green ocr-primary-capture"}>{"📸 Chụp"}</button>
{"\n            "}<button id={"btnOcrSwitchCamera"} className={"btn-dark"}>{"🔄 Xoay camera"}</button>
{"\n            "}<button id={"btnOcrClose2"} className={"btn-gray"}>{"Đóng"}</button>
{"\n          "}</div>
{"\n        "}</div>
{"\n\n        "}<div id={"ocrPreviewWrap"} className={"ocr-preview-wrap"}>{"\n          "}<canvas id={"ocrPreviewCanvas"}></canvas>
{"\n        "}</div>
{"\n\n        "}<div id={"ocrStatus"} className={"ocr-status"}></div>
{"\n        "}<div id={"ocrResultList"} className={"ocr-result-list"}></div>
{"\n\n        "}<div className={"ocr-actions-bottom"}>{"\n          "}<button id={"btnOcrRead"} className={"btn-orange"} disabled={true}>{"🔎 Đọc kỹ hơn"}</button>
{"\n          "}<button id={"btnOcrRetake"} className={"btn-camera-light"} disabled={true}>{"📸 Chụp lại"}</button>
{"\n        "}</div>
{"\n\n        "}<div className={"ocr-hint"}>{"\n          Đưa dòng "}<b>{"Mã đơn hàng"}</b>
{" và mã ngay bên dưới nếu màn tài xế xuống dòng vào khung xanh rồi bấm "}<b>{"Chụp"}</b>
{". App ưu tiên lấy ký tự sau dòng này. Bấm "}<b>{"Lấy mã"}</b>
{" để thêm vào danh sách. Nếu mã có O/0/Q, app hiển thị từng ký tự thành ô rõ ràng: 0 là số không, O là chữ O; app không hiện popup O/0; có thể bấm ô màu cam để đổi 0/O/Q trước khi bấm Lấy mã. Sau đó bấm "}<b>{"Check Bàn Giao"}</b>
{" khi đủ mã.\n        "}</div>
{"\n        "}<pre id={"ocrRawText"} className={"ocr-raw"}></pre>
{"\n      "}</div>
{"\n    "}</div>
{"\n  "}</div>
{"\n\n  "}{"\n\n  "}{"\n\n\n\n"}
</>;}
