# IFC_01 Handover 0.7.0 — Rider tự đăng ký bằng mã cuối

Bản source đầy đủ dựa trên IFC 0.5.8, bổ sung trang rider `/rider/`. Giữ Worker, D1, quyền kho, màn hình kho, Customer Service, số thứ tự chung, BOX và nghiệp vụ VNWL hiện có. Không dùng Cloudflare Tunnel. Không cần thiết bị ở tầng dưới và không yêu cầu rider đăng nhập hay cài ứng dụng.

## Luồng sử dụng

1. Admin mở `/admin/`, chọn đúng station và bấm **In mã QR đăng ký lấy hàng / gọi hỗ trợ**. QR đã in từ bản trước vẫn dùng được, trỏ đến trang đăng ký mới.
2. Rider quét QR → **Bắt đầu đăng ký** → nhập tên trên app tài xế.
3. Nhập **từ 3 ký tự cuối trở lên** của mã vận đơn hoặc mã đơn Shopee → **Thêm đơn**. Chấp nhận mã dài hơn, mã đầy đủ và chữ/số. Mỗi phiếu tối đa 20 đơn.
4. **Xong · Kiểm tra** → **Lấy số thứ tự**. Số phiếu dùng chung bộ đếm với nghiệp vụ kho.
5. Phiếu đi vào danh sách HOLD hiện có tại đúng kho. Nhân viên tiếp tục nhận phiếu → soạn/BOX → PICKED → scan bàn giao như hiện tại. Đăng ký của rider không tự đánh dấu HANDED_OVER.
6. Rider giữ trang để xem số chờ và trạng thái. Khi phiếu PICKED, trang thông báo nhận hàng. Không có bộ đếm tự xóa phiếu sau 20 giây.
7. Nút **Gọi hỗ trợ** giữ nguyên thông tin đang nhập, mở cuộc gọi trong khung riêng. Customer Service mở `/support/`, bật **Đang trực**, cho phép mic/camera và nhận cuộc gọi. Đóng khung sẽ dừng media và gửi hủy cuộc gọi.

## Logic đối chiếu VNWL

- Tìm mã khớp chính xác hoặc đúng phần cuối trong các trường `order_code`, `tracking_no`, `order_sn`, `shopee_order_sn`, `order_sn_display`.
- Mã chữ không phân biệt hoa/thường. Không dùng tìm gần đúng/OCR khi rider tự gõ mã.
- Tìm trong dữ liệu ngày hiện hành và station lấy từ QR. Trình duyệt không được đổi kho bằng tham số `warehouse`.
- Không tìm thấy: báo kiểm tra mã/nhập thêm ký tự. Nhiều kết quả: yêu cầu nhập 6 ký tự cuối nếu mã hiện tại dài tối đa 5, hoặc thêm ký tự nếu đã dài hơn. Không tự lấy dòng đầu.
- Một kết quả: kiểm tra trạng thái NO_RIDER và khóa phiếu. Đơn đã nằm ở phiếu khác không được đăng ký lại.
- Nếu hai chuỗi nhập khác nhau cùng khớp một đơn, từ chối thêm trùng.
- Khi gửi phiếu, Worker kiểm tra lại dữ liệu và tạo khóa/phiếu/mirror trong batch nguyên tử của nghiệp vụ sẵn có. Chưa thành công thì không giữ nửa danh sách.
- Cùng một lần gửi được thử lại bằng cùng khóa; trả lại số cũ khi mất phản hồi, không tạo số mới. Khóa được ràng buộc với phiên rider và kho. Trong lúc chưa rõ kết quả gửi, trang giữ nguyên nội dung, không cho sửa và gửi bằng khóa cũ.
- Mã cuối chỉ hỗ trợ tra cứu. Nhân viên vẫn đối chiếu/scan đúng mã đầy đủ khi bàn giao hàng.

## Giọng hướng dẫn

- Rider bấm **Bắt đầu** hoặc **Nghe hướng dẫn** để phát âm thanh, phù hợp yêu cầu trình duyệt về tương tác người dùng.
- Ưu tiên giọng tiếng Việt có trên điện thoại; có 37 WAV dự phòng đóng kèm, bao gồm hướng dẫn, lỗi trùng mã và đọc từng chữ số của số thứ tự.
- Chạy `npm run voice` để tạo lại WAV bằng bộ tổng hợp đóng gói trong npm. Không cần cài espeak hệ thống hay quyền sudo. WAV tổng hợp có chất giọng máy; giọng sẵn có tùy điện thoại.
- Bật âm lượng media trên điện thoại. Luôn có chữ hướng dẫn tương ứng.

## Cài bản đầy đủ trên Cloud Shell

Upload ZIP mới lên Cloud Shell, chạy:

```bash
cd ~
unzip -o IFC_01_Handover_Cloudflare_v0.7.0_FULL.zip -d ~
cd ~/IFC_01_Handover
bash upgrade-firebase.sh
```

Nhập email Firebase của Admin Pro khi script hỏi. Script cài dependencies, chạy test, tạo âm thanh, chuẩn bị vendor, cập nhật schema bằng CREATE IF NOT EXISTS rồi deploy. Giữ nguyên Worker `ifc-01-handover-pilot` và D1 ID trong cấu hình. Giữ các secrets hiện tại; không chép secret vào source.

QR giới hạn theo station. Đơn phải tồn tại trong dữ liệu D1 của IFC tại station/ngày hiện hành, được nhập/đồng bộ bằng luồng kho hiện có. Trang rider không đọc app SPX hoặc tự lấy đơn từ điện thoại.

Để chỉ kiểm tra gói Worker trước khi triển khai:

```bash
npm ci
npx tsc --noEmit
npm test
npx wrangler deploy --dry-run
```

## Cuộc gọi hỗ trợ

Kế thừa WebRTC/STUN/TURN của IFC 0.5.8; không thay đổi dịch vụ media trong bản này. Đọc DEPLOY.md để cấu hình TURN cho các máy ở hai mạng khác nhau. Nút gọi không yêu cầu đăng nhập tài khoản Google của rider. Cần cấp quyền mic/camera; cuộc gọi xuyên mạng thật cần kiểm tra tại kho. Đăng ký lấy hàng hoạt động độc lập với cuộc gọi.

## Kiểm tra sau deploy

- WH1 và WH2 in QR riêng. QR WH1 chỉ tìm được đơn WH1.
- Tạo hai mã có cùng đuôi 3 ký tự: app phải yêu cầu thêm ký tự; sau khi nhập đủ đuôi phân biệt thì cho thêm.
- Nhập mã Shopee và mã vận đơn cùng thuộc một đơn: app phải chặn thêm trùng.
- Hai rider gửi cùng đơn: chỉ một phiếu thành công.
- Ngắt mạng khi gửi rồi gửi lại: phải trả đúng một số phiếu.
- Reload trang: tên/danh sách/phiếu giữ lại trong phiên trình duyệt.
- Kiểm tra nút gọi, nhận cuộc gọi tại `/support/`, đóng/quay lại form và kiểm tra mic/camera đã dừng.
- Trên Android và iPhone: thử âm thanh hướng dẫn, nhập mã, số phiếu và thông báo khi nhân viên chuyển PICKED.

## Giới hạn xác minh tại môi trường phát triển

Các bài test SQL chạy trên SQLite thật với wrapper D1, xác thực Firebase-format, signaling media và giao diện rider qua DOM giả lập. TypeScript và gói Wrangler dry-run được kiểm tra. Preview trình duyệt bằng Wrangler không khởi động được do môi trường mạng của máy kiểm thử (`uv_interface_addresses`); chưa xác minh giao diện bằng trình duyệt thật hoặc hai điện thoại thật. Chưa triển khai lên tài khoản Cloudflare của bạn.
