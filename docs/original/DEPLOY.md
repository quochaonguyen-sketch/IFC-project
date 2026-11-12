# Rider QR mới

Xem **RIDER_SETUP.md** cho luồng tự đăng ký bằng từ 3 ký tự cuối, giọng đọc và gọi hỗ trợ. QR station cũ mở trang rider mới. Source đầy đủ tiếp tục dùng backend và nghiệp vụ VNWL/IFC hiện hành.

# IFC_01 Handover v0.7.0 — Rider QR, voice guidance and support

Đưa IFC_01 Handover vào vận hành trên Cloudflare SDD. Để giữ nguyên URL Firebase đã cho phép và dữ liệu D1 đang gắn, cấu hình tiếp tục dùng Worker hiện hữu (tên hạ tầng còn hậu tố `-pilot`); mã ứng dụng và quyền truy cập không còn ở chế độ pilot. Đổi tên Worker/hostname sẽ cần một đợt chuyển miền và cập nhật Firebase Authorized domains riêng. Firebase project có ID `sdd-local-app` xác minh người dùng; giữ nguyên project ID trong cấu hình. Worker, D1, Durable Object, kiosk và giao diện chạy tại Cloudflare.

## Cài đặt / cập nhật

Upload ZIP vào thư mục home trên Cloud Shell, sau đó chạy:

    cd ~
    unzip -o IFC_01_Handover_Cloudflare_v0.7.0_FULL.zip -d ~
    cd ~/IFC_01_Handover
    bash upgrade-firebase.sh

Nhập email Firebase của Admin Pro khi được hỏi. Script kiểm tra đúng Worker và D1 IFC_01 Handover, chạy các kiểm tra hiện có, tạo lại âm thanh hướng dẫn tiếng Việt, cập nhật schema D1 bằng `CREATE TABLE IF NOT EXISTS` và deploy. Schema thêm quyền Customer Service theo station và lịch sử cuộc gọi hỗ trợ. File config giữ nguyên D1 ID hiện đang gắn. Dùng phiên Wrangler đã xác thực vào tài khoản Cloudflare SDD.

Trong Cloud Shell cũng có thể truyền email bằng `IFC_ADMIN_EMAIL='email-admin-cua-ban' bash upgrade-firebase.sh`. Khi dùng Cloudflare API Token, nhập bằng `read -rsp "Cloudflare API Token: " CLOUDFLARE_API_TOKEN`, nhấn Enter và chạy `export CLOUDFLARE_API_TOKEN` trước script. Sau triển khai chạy `unset CLOUDFLARE_API_TOKEN`.

## Firebase đăng nhập

Trong Firebase Console của project `sdd-local-app`, bật Google hoặc Email/Password trong Authentication → Sign-in method. Thêm `ifc-01-handover-pilot.duynguyenspx.workers.dev` tại Authentication → Settings → Authorized domains (không thêm `https://` hoặc đường dẫn). Nếu Firebase API key giới hạn HTTP referrer, cho phép hostname này. Nếu có Cloudflare Access policy cũ chặn Worker, gỡ policy đó cho hostname IFC; app xác thực bằng Firebase.

## Vai trò và station

- `/admin/`: Admin Pro tạo mã kho, gán quản trị viên kho, nhân viên, Customer Service và kiosk. Tài khoản phải có trong Firebase Authentication và email đã xác minh.
- Admin Pro là người duy nhất tạo mã kho và gán quyền quản trị viên kho. Quản trị viên kho chỉ thao tác trong kho được giao, chỉ cấp/thu hồi quyền Nhân viên tại station được giao; quyền quản lý tài khoản thiết bị nằm trong mục Kiosk riêng.
- Customer Service là quyền độc lập theo station. Một tài khoản có thể làm nhân viên kho A và nhận cuộc gọi hỗ trợ tại kho B khi đang online; mở `/support/` hoặc bấm Customer Service trên app và giữ trang mở.
- Kiosk là tài khoản riêng cho thiết bị tại quầy. Admin gán kiosk vào một station; rider mở `/kiosk/`, nhập từng bước và bấm **Gọi nhân viên hỗ trợ** nếu cần. Kiosk yêu cầu camera/micro, phát cuộc gọi cho Customer Service đang online tại station được gán. Một nhân viên nhận cuộc gọi sẽ kết nối video trực tiếp với rider.
- Người nhận cuộc gọi phải cho phép camera và micro. Voice kiosk/rider ưu tiên giọng tiếng Việt trên thiết bị; WAV dự phòng được tạo bằng `npm run voice` (text2wav, không cần sudo). Chất giọng có thể khác nhau theo thiết bị.

## Video và mạng

Cuộc gọi dùng WebRTC ngang hàng với STUN mặc định. Một số mạng công ty, mạng di động hoặc NAT nghiêm ngặt cần TURN relay để hình/tiếng kết nối ổn định. Khi đã có TURN service, cấu hình ba biến bảo mật trên Cloudflare Worker:

    npx wrangler secret put TURN_URL
    npx wrangler secret put TURN_USERNAME
    npx wrangler secret put TURN_CREDENTIAL

Dùng URL TURN và thông tin xác thực do dịch vụ TURN của tổ chức cấp. Không đặt credential vào file frontend hoặc `wrangler.jsonc`. Khi chưa cấu hình TURN, các cuộc gọi vẫn thử kết nối bằng STUN; một số mạng có thể không thiết lập được video.

Bản v0.7.0_FULL tự gửi đề nghị ICE mới tối đa ba lần nếu kết nối media thất bại; rider xử lý lại SDP và bỏ ICE cũ. Kiểm tra `curl https://ifc-01-handover-pilot.duynguyenspx.workers.dev/health`: `turn_configured:false` nghĩa là Worker chưa nhận đủ ba secret trên. Giá trị `true` chỉ xác nhận có cấu hình, không chứng minh TURN còn hạn hay thông được qua firewall. Trong cuộc gọi, mở `chrome://webrtc-internals` ở máy lễ tân để xem selected candidate pair: `relay` chứng minh kết nối dùng TURN. Thử thực tế điện thoại 4G với máy tính trên Wi-Fi station, quan sát hình và tiếng hai chiều.

Nếu dùng **Cloudflare Realtime TURN**, không đưa TURN key hoặc API token dài hạn vào `TURN_USERNAME`/`TURN_CREDENTIAL`: Cloudflare yêu cầu gọi API tạo *credential ngắn hạn* rồi mới chuyển URL, username, credential đó cho trình duyệt. Ba secret TURN hiện tại chỉ phù hợp với nhà cung cấp cấp credential tĩnh còn hiệu lực trong suốt cuộc gọi. Khi chọn Cloudflare Realtime TURN cần tích hợp đầu cuối tạo credential ngắn hạn vào Worker trước khi cấu hình. Cloudflare Realtime TURN cũng có phí sử dụng độc lập với SFU; xem bảng giá hiện hành trên Cloudflare.

## Giao diện vận hành

- `/` và `/mobile/` dành cho nhân viên, giữ các chức năng VNWL được chuyển sang D1/Worker.
- `/kiosk/` dành cho rider tại quầy, dùng tài khoản kiosk riêng; không dùng chung hồ sơ trình duyệt nhân viên.
- `/rider/#<mã-QR>` dành cho điện thoại cá nhân rider, không cần đăng nhập. Nhập từ 3 ký tự cuối trở lên và lấy số.
- `/support/` là màn Customer Service, hiển thị các cuộc gọi thuộc station đã cấp quyền.
- Các quyền lưu trong D1 và không bị xóa khi reset ca. Manual reset dữ liệu vận hành chỉ dành cho Admin Pro.

## Tài khoản máy kiosk
Trong Firebase Authentication bật Email/Password. Dùng service account của sdd-local-app có quyền firebaseauth.users.create, firebaseauth.users.get và firebaseauth.users.update. Từ thư mục dự án trong Cloud Shell, nạp file JSON service account vào secret của Worker: `npx wrangler secret put FIREBASE_ADMIN_JSON < ~/ifc-firebase-admin.json`. Giữ file khóa ngoài thư mục public.
Trong /admin/ chọn mã kho rồi mục Kiosk của station. Tạo thiết bị với mật khẩu từ 12 ký tự, hoặc chọn email đã tạo để đặt lại mật khẩu. Tại quầy mở /kiosk/, đăng nhập một lần cho máy và để rider tự nhập tên, mã đơn.

Kể từ v0.5.4, trang /kiosk/ dùng phiên đăng nhập riêng. Đăng nhập lại thiết bị một lần sau nâng cấp. Tài khoản nhân sự và thiết bị có thể mở ở hai tab cùng trình duyệt.

## QR đăng ký tại station

Admin mở `/admin/`, chọn station, nhấn **In mã QR đăng ký lấy hàng / gọi hỗ trợ**. Rider quét QR để mở `/rider/`, nhập tên và từ 3 ký tự cuối của mã đơn trở lên. Khớp nhiều đơn thì nhập thêm ký tự; không tự chọn đơn đầu tiên. Phiếu đăng ký vào luồng HOLD của kho, dùng chung bộ đếm số thứ tự của nghiệp vụ hiện tại. Chi tiết và hướng dẫn kiểm tra ở RIDER_SETUP.md.

QR cũ vẫn mở được trang đăng ký mới. Chỉ bấm **Gọi hỗ trợ** mới tạo lượt chờ lễ tân riêng. Số chờ cuộc gọi là số chờ hỗ trợ, khác số phiếu lấy hàng. Đóng khung hỗ trợ sẽ giữ nguyên thông tin đang nhập và dừng cuộc gọi trên điện thoại. Trang hỗ trợ rider mới không hiển thị yêu cầu chia sẻ toàn màn hình.

## Mở bằng trình duyệt điện thoại

QR là link HTTPS. Nếu mở trong Zalo hoặc webview và gặp giới hạn mic/camera, dùng menu Mở bằng trình duyệt / Mở ngoài, hoặc nút Sao chép link. IFC không yêu cầu cài app. Quyền mic/camera được xin khi gọi hỗ trợ, không dùng để đăng ký đơn. Cần bấm Bắt đầu hoặc Nghe hướng dẫn để cho phép phát âm thanh.

## Kiểm thử trên hai mạng

1. Máy lễ tân đăng nhập `/support/`, bật **Đang trực**.
2. Rider quét QR, nhập thông tin, bấm **Gọi hỗ trợ**. Lễ tân nhận đúng số chờ hỗ trợ.
3. Cấp quyền mic/camera. Kiểm tra nghe và thấy nhau.
4. Đóng khung, kiểm tra mic/camera dừng và thông tin nhập đơn vẫn còn.
5. Thử điện thoại 4G với máy lễ tân dùng Wi-Fi. Nếu media không nối được, kiểm tra TURN theo mục Video và mạng. Việc tạo phiếu lấy hàng độc lập với media.
