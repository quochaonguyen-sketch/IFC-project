import Brand from '@/components/Brand';
export default function Page(){
 return <>
<header><Brand subtitle="Quản lý bàn giao" /><span className="ui-topbar-label">Không gian làm việc IFC</span></header>
<main><p className="ui-kicker">Chào mừng trở lại</p><h1>{"Đăng nhập"}</h1>
<p className="ui-login-description">Sử dụng tài khoản đã được cấp quyền để truy cập kho của bạn.</p>
<button id={"google"}><span className="ui-google-mark" aria-hidden="true">G</span>{"Tiếp tục với Google"}</button>
<div className="ui-login-divider">HOẶC ĐĂNG NHẬP BẰNG EMAIL</div>
<form id={"form"}><label>{"Email"}<input id={"email"} type={"email"} autoComplete={"username"} required={true} /></label>
<label>{"Mật khẩu"}<input id={"password"} type={"password"} autoComplete={"current-password"} required={true} /></label>
<button>{"Đăng nhập bằng email"}</button>
</form>
<p id={"msg"} role={"status"}></p>
<button id={"verify"} hidden={true}>{"Gửi email xác minh"}</button>
<button id={"retry"} hidden={true}>{"Kiểm tra lại quyền"}</button>
<button id={"switch"} hidden={true}>{"Đổi tài khoản"}</button>
<p className="ui-login-note">Máy tại quầy sử dụng tài khoản kiosk riêng.</p>
</main>
{"\n"}
</>;
}
