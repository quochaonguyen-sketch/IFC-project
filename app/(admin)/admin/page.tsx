import Brand from '@/components/Brand';
export default function Page(){
 return <>
<header><Brand subtitle="Quản trị hệ thống" /><nav className="ui-topbar-links" aria-label="Điều hướng quản trị"><a href="/">Vận hành kho</a><a href="/support/">Hỗ trợ</a></nav></header>
<main><p className="ui-kicker">Quản trị hệ thống</p><h1>{"Kho và tài khoản"}</h1>
<p className={"sub"}>Tạo kho mới, chọn email tài khoản và cấp quyền sử dụng theo từng kho. Người dùng đăng nhập bằng đúng email đã được cấp quyền.</p>
<p id={"account"} className={"muted"}></p>
<p id={"adminScope"} className={"muted"}></p>
<section id={"adminGlobalCard"} className={"card"} hidden={true}>
<h2>Admin Pro — toàn hệ thống</h2>
<p>Quản lý mọi kho, phân quyền tài khoản và sử dụng Customer Service. Quyền này không gắn với một kho riêng.</p>
<form id={"adminForm"}>
<label htmlFor={"adminEmail"}>Email tài khoản nhận Admin Pro</label>
<input id={"adminEmail"} type={"email"} autoComplete={"email"} required={true} placeholder={"email@company.com"} />
<div className={"links"}><button type={"submit"} value={"grant"}>Cấp Admin Pro</button><button type={"submit"} value={"transfer"} className={"secondary"}>Chuyển quyền của tôi</button></div>
<p className={"muted"}>Chuyển quyền sẽ cấp Admin Pro cho email trên và thu hồi quyền Admin Pro của bạn. Hệ thống luôn giữ ít nhất một Admin Pro.</p>
<p id={"adminMsg"} role={"status"} className={"admin-feedback"}></p>
</form>
<h3>Tài khoản Admin Pro</h3><ul id={"admins"}></ul>
</section>
{"\n"}<section className={"card"} id={"warehouseCard"} hidden={true}><h2>Tạo kho</h2>
<form id={"warehouseForm"}>
<div className={"grid"}><div><label htmlFor={"newCode"}>{"Mã kho mới"}</label>
<input id={"newCode"} maxLength={24} placeholder={"Ví dụ: WH6"} /></div>
<div><label htmlFor={"newName"}>Tên kho (không bắt buộc)</label>
<input id={"newName"} maxLength={80} placeholder={"Ví dụ: Kho Quận 7"} /></div>
</div>
<p className={"muted"}>Mã kho gồm 2–24 ký tự chữ, số, dấu _ hoặc -. Sau khi tạo, kho mới được chọn sẵn để cấp quyền.</p>
<button id={"addWarehouse"} type={"submit"}>Tạo kho</button>
<p id={"warehouseMsg"} role={"status"} className={"admin-feedback"}></p>
</form>
<h3>Kho đã tạo</h3>
<p className={"muted"}>Xóa kho sẽ gỡ khỏi danh sách hoạt động và thu hồi quyền tại kho; lịch sử bàn giao được giữ lại.</p>
<ul id={"warehouses"}></ul>
</section>
{"\n"}<section className={"card"}><h2>{"Chọn kho cần quản lý"}</h2>
<label htmlFor={"warehouse"}>{"Mã kho"}</label>
<select id={"warehouse"}></select>
<button id={"stationQrOpen"} type={"button"} hidden={true} aria-haspopup={"dialog"} aria-controls={"stationQrDialog"}>Xem / in mã QR lấy hàng</button>
<p className={"muted"}>Chọn kho để xem tài khoản đã được cấp quyền. Bạn có thể chọn thêm kho khác trong phần cấp quyền bên dưới.</p>
</section>
{"\n"}<section className={"card"} id={"grantCard"}><h2>{"Cấp quyền tài khoản"}</h2>
<form id={"grant"}><div className={"grid"}><div><label htmlFor={"email"}>Email tài khoản</label>
<input id={"email"} type={"email"} autoComplete={"email"} required={true} placeholder={"nhanvien@company.com"} /></div>
<div><fieldset id={"role"}><legend>{"Chức năng cần cấp"}</legend>
<label className={"wh-check"}><input type={"checkbox"} defaultValue={"staff"} defaultChecked={true} />{"Nhân viên"}</label>
<label className={"wh-check"}><input type={"checkbox"} defaultValue={"warehouse_admin"} />{"Quản trị viên kho (bao gồm nghiệp vụ nhân viên)"}</label>
<label className={"wh-check"}><input type={"checkbox"} defaultValue={"customer_service"} />{"Customer Service"}</label>
</fieldset>
</div>
</div>
<label>{"Kho được cấp (chọn một hoặc nhiều)"}</label>
<div id={"grantWarehouses"} className={"grid"}></div>
<button type={"submit"}>Cấp quyền tài khoản</button>
<p id={"grantMsg"} role={"status"} className={"admin-feedback"}></p>
</form>
<h3>Tài khoản tại kho đang chọn</h3>
<ul id={"users"}></ul>
</section>
{"\n"}<p id={"msg"} role={"status"}></p>
<div className={"links"}><a href={"/"}>{"Mở app vận hành"}</a>
<button id={"logout"} className={"secondary"}>{"Đăng xuất"}</button>
</div>
</main>
<dialog id={"stationQrDialog"} aria-labelledby={"stationQrTitle"}>
  <h2 id={"stationQrTitle"}>Mã QR đăng ký lấy hàng</h2>
  <p id={"stationQrStatus"} className={"qr-screen-only"} role={"status"}></p>
  <div id={"stationQrPoster"} hidden={true}>
    <p id={"stationQrWarehouse"}></p>
    <img id={"stationQrImage"} width={400} height={400} alt={"Mã QR để tài xế đăng ký lấy hàng và gọi hỗ trợ"} />
    <p>Quét QR, nhập 3 ký tự cuối mã đơn rồi lấy số và chờ gọi.</p>
    <p>Cần giúp đỡ? Bấm Gọi hỗ trợ trên điện thoại.</p>
  </div>
  <div className={"station-qr-actions qr-screen-only"}>
    <button id={"stationQrClose"} type={"button"} className={"secondary"}>Đóng</button>
    <button id={"stationQrPrint"} type={"button"} disabled={true}>In mã QR</button>
  </div>
</dialog>
{"\n"}
</>;
}
