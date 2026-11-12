// Restored from the user-supplied VNWL frontend archive.
export default function Page(){return <>
{"\n"}<div className={"wrap"}>{"\n  "}<div className={"card"}>{"\n    "}<h1>{"📍 VNWL - Công cụ Upload / Download Location"}</h1>
{"\n    "}<div className={"session"}><b>{"Phiên làm việc:"}</b>
{" "}<span id={"authStatus"}>{"Đang kiểm tra đăng nhập từ app VNWL..."}</span>
</div>
{"\n    "}<p className={"muted"}>{"Dữ liệu chỉ phục vụ quy trình trong ngày hiện tại. Qua ngày mới app không dùng lại dữ liệu cũ."}</p>
{"\n  "}</div>
{"\n  "}<div className={"card"}>{"\n    "}<h2>{"1) Tải template location"}</h2>
{"\n    "}<div className={"grid"}><div><label htmlFor={"warehouse"}>{"Kho"}</label>
<select id={"warehouse"} disabled />
</div>
</div>
{"\n    "}<button id={"downloadBlank"} className={"green"} type={"button"}>{"Tải template rỗng 4 cột"}</button>
{"\n    "}<button id={"downloadFull"} className={"gray"} type={"button"} disabled>{"Tải dữ liệu hiện tại"}</button>
{"\n    "}<p className={"muted"}>{"Template đúng gồm 4 cột theo thứ tự: "}<b>{"Mã vận đơn | Mã đơn hàng Shopee | Location | Sub"}</b>
{". "}<b>{"Cả 4 cột bắt buộc có dữ liệu"}</b>
{"; Sub là số từ "}<b>{"1 đến 40"}</b>
{". Đơn đã bàn giao sẽ trả lại Sub cho đơn mới."}</p>
{"\n  "}</div>
{"\n  "}<div className={"card"}>{"\n    "}<h2>{"2) Upload file cập nhật location"}</h2>
{"\n    "}<input id={"fileInput"} type={"file"} accept={".xlsx,.xls,.csv"} />{"\n    "}<div className={"toolbar"}>{"\n      "}<button id={"preview"} className={"blue"} type={"button"}>{"Preview file"}</button>
{"\n      "}<button id={"confirm"} className={"red"} type={"button"} disabled>{"Xác nhận update location"}</button>
{"\n      "}<span id={"toolbarStatus"} className={"muted"}>{"Chọn file template đã nhập dữ liệu."}</span>
{"\n    "}</div>
{"\n    "}<div id={"uploadWarning"} className={"upload-warning"} role={"alert"}>{"⚠️ "}<strong>{"Hệ thống đang upload dữ liệu lên Server."}</strong>
{" Vui lòng không đóng popup, không refresh trình duyệt, không out màn hình và hạn chế chuyển tab cho đến khi Upload đạt 100%."}<span className={"small"} id={"uploadWarningDetail"}>{"Nếu cần chuyển tab, hệ thống sẽ tạm dừng trước batch kế tiếp và tự chạy tiếp khi quay lại."}</span>
</div>
{"\n    "}<div id={"uploadProgressWrap"} className={"progress-wrap"} aria-live={"polite"}>{"\n      "}<div className={"progress-meta"}><span id={"uploadProgressText"}>{"Upload: 0%"}</span>
<span id={"uploadProgressCount"}>{"0/0 dòng"}</span>
</div>
{"\n      "}<div className={"progress-bar"}><div id={"uploadProgressBar"}></div>
</div>
{"\n      "}<div id={"uploadProgressDetail"} className={"progress-detail"}>{"Chưa bắt đầu upload."}</div>
{"\n    "}</div>
{"\n    "}<p className={"muted"}>{"Rule: mã vận đơn mới sẽ được tạo trên hệ thống; mã đã có đang chuẩn bị sẽ cập nhật Mã đơn hàng/Location/Sub; mã đang HOLD/Đã pick không được chuyển Location/Sub; một Location + Sub chỉ giữ một đơn active; đơn đã bàn giao trả Sub trống ngay."}</p>
{"\n    "}<div id={"previewBox"}></div>
{"\n    "}<div id={"message"}>{"Sẵn sàng."}</div>
{"\n  "}</div>
{"\n  "}<div className={"card"}><h2>{"Nhật ký thao tác"}</h2>
<div id={"log"} className={"muted"}>{"Công cụ đã mở."}</div>
</div>
{"\n"}</div>
{"\n"}<div className={"busy"} id={"busy"}><span className={"spinner"}></span>
<span id={"busyText"}>{"Đang xử lý..."}</span>
</div>
{"\n"}{"\n"}{"\n\n"}
</>;}
