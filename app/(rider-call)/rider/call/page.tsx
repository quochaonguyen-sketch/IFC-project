import Brand from '@/components/Brand';
export default function Page(){
 return <>
{"\n"}<main className="ifc-driver-call"><Brand subtitle="Hỗ trợ trực tuyến" />{"\n  "}<h1>{"Cuộc gọi với lễ tân"}</h1>
{"\n  "}<div id={"browser-help"}></div>
{"\n  "}<section id={"call-content"} hidden={true}>{"\n    "}<p id={"state"} role={"status"}>{"Đang gọi lễ tân của station…"}</p>
    <section id={"assisted-receipt"} className={"ifc-assisted-receipt"} role={"status"} hidden={true}>
      <span>Số lấy hàng lễ tân vừa cấp</span>
      <strong id={"assisted-receipt-number"}></strong>
      <small>Mã phiếu <span id={"assisted-receipt-ticket"}></span></small>
    </section>
{"\n    "}<section id={"join"} hidden={true}></section>
{"\n    "}<details className="ifc-call-instructions"><summary>Hướng dẫn camera / micro</summary>
<p>{"Cho phép camera và micro để thấy và nghe lễ tân. Nếu chưa thấy hộp thoại, bấm Bật camera / micro."}</p>
<p>{"Sau khi được hỗ trợ, bấm Quay lại nhập đơn ở phía trên. Thông tin đang nhập vẫn được giữ lại."}</p>
</details>
{"\n    "}<button id={"end"}>{"Hủy / kết thúc yêu cầu IFC"}</button>
{"\n  "}</section>
{"\n  "}<noscript>{"Hãy bật JavaScript hoặc mở link bằng trình duyệt mặc định để gọi lễ tân."}</noscript>
{"\n"}</main>
{"\n"}{"\n\n\n"}
</>;
}
