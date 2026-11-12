import Brand from '@/components/Brand';
import Icon from '@/components/Icon';
export default function Page(){
 return <>
{"\n"}<header><Brand subtitle={<span id={"station"}>Đăng ký lấy hàng</span>} />
<span className={"live"}>{"TẠI KHO"}</span>
</header>
{"\n"}<main>{"\n"}<div id={"browser-help"}></div>
{"\n"}<div className={"topline"}><span id={"step"}>{"XIN CHÀO BÁC TÀI"}</span>
<button id={"repeat"} className={"small"} type={"button"}><span className="ui-button-content"><Icon name="volume" />Nghe hướng dẫn</span></button>
</div>
<p id={"voice-note"} className={"footnote"} role="status"></p>
{"\n"}<section className={"card"} aria-labelledby={"title"}><h1 id={"title"}>{"Đăng ký lấy hàng"}</h1>
<p id={"hint"} role={"status"}>Xin chào bác tài! Quét mã QR tại kho hoặc chọn kho để đăng ký lấy hàng.</p>
<div id={"view"}></div>
<div id={"message"} role={"status"} aria-live={"polite"}></div>
</section>
{"\n"}<section className={"help-card"}><div><strong>{"Cần nhân viên giúp?"}</strong>
<p>{"Bấm nút bên dưới để gọi lễ tân."}</p>
</div>
<button id={"support"} type={"button"} className={"support"} disabled={true}><span className="ui-button-content"><Icon name="headset" />Gọi hỗ trợ</span></button>
</section>
{"\n"}<footer>{"IFC_01 · Rider tự đăng ký · v0.7.0"}</footer>
{"\n"}</main>
{"\n"}<dialog id={"confirm-dialog"} aria-labelledby={"confirm-title"} aria-describedby={"confirm-count"}>
<h2 id={"confirm-title"}>Bạn chắc chắn kết thúc?</h2>
<p id={"confirm-count"}></p>
<ul id={"confirm-orders"} aria-label={"Các mã đơn đã nhập"}></ul>
<p id={"confirm-message"} role={"alert"}></p>
<div className={"confirm-actions"}><button id={"confirm-back"} type={"button"} className={"secondary"}>Kiểm tra lại</button>
<button id={"confirm-submit"} type={"button"}>Xác nhận</button></div>
</dialog>
{"\n"}<dialog id={"support-dialog"} aria-labelledby={"support-title"}><div className={"dialog-head"}><h2 id={"support-title"}>{"Nhân viên hỗ trợ"}</h2>
<button id={"close-support"} className={"small"} type={"button"}>{"Quay lại nhập đơn"}</button>
</div>
<p className={"footnote"}>{"Đóng cuộc gọi vẫn giữ lại thông tin đơn đã nhập."}</p>
<iframe id={"support-frame"} title={"Gọi lễ tân IFC"} allow={"camera; microphone; display-capture; autoplay"}></iframe>
</dialog>
{"\n"}<noscript>{"Hãy bật JavaScript và mở QR bằng Chrome hoặc Safari để đăng ký."}</noscript>
{"\n"}{"\n\n"}
</>;
}
