# IFC_01 Handover — Next.js

Bản chuyển đổi từ `IFC_01_Handover_Cloudflare_v0.7.0_FULL.zip`, giữ giao diện, nội dung tiếng Việt, đường dẫn cũ và nghiệp vụ hiện có.

Cập nhật theo yêu cầu: rider tự đăng ký không cần nhập tên. Sau Bắt đầu, nhập mã đơn → kiểm tra → lấy số. API guest dùng nhãn chung `Rider` trên phiếu khi không có tên; kiosk vẫn giữ luồng riêng. Bản nháp cũ đang gửi được giữ nguyên để thử lại đúng phiếu.

## Công nghệ và phạm vi chuyển đổi

- **Next.js 16.4.5, React 19.3.1, TypeScript, App Router**: 9 trang là component React trong `app/`, được prerender và hydrate bởi Next.js. Không nhúng cả ứng dụng gốc vào iframe.
- **Static export**: `pnpm build` tạo `out/`; Cloudflare Worker phục vụ các file do Next.js build.
- **Backend giữ nguyên**: `src/index.ts`, `src/devices.ts`, D1, Durable Object, WebSocket, Firebase ID token, phân quyền, cron reset ca 06:00 Việt Nam và WebRTC.
- **Module nghiệp vụ trình duyệt giữ lại**: adapter, scan/OCR, Excel, in phiếu, các bước rider/kiosk, giọng đọc và video vẫn là JavaScript đã có. Đây là bước chuyển framework giao diện; chưa viết lại toàn bộ module này thành React hooks hoặc thay backend bằng Next.js Route Handlers.
- CSS gốc nằm trong `public/next-styles/` và các file CSS có sẵn. WAV, QR, OCR/WASM và Excel vendor được đóng gói đầy đủ.

Tài liệu Next.js về cách xuất tĩnh: https://nextjs.org/docs/app/guides/static-exports

## Chạy đầy đủ trên máy

Cần **Node.js 24+** và **pnpm 11.25+**. Giải nén ZIP, mở terminal trong thư mục có `package.json`:

```powershell
pnpm install --frozen-lockfile
Copy-Item .dev.vars.example .dev.vars
# Sửa ADMIN_EMAIL trong .dev.vars thành email Firebase admin của bạn.
pnpm dev
```

Trên macOS/Linux, thay `Copy-Item` bằng `cp`.

Mở **http://127.0.0.1:8787/**. Lệnh `dev` build Next.js, tạo schema D1 cục bộ nếu chưa có, rồi chạy toàn bộ app bằng Wrangler. Thư mục `.wrangler/` chỉ chứa dữ liệu phát triển trên máy.

Sau khi sửa trang/CSS/module, dừng server rồi chạy lại `pnpm dev` để build mới. Nếu đã build và khởi tạo D1, `pnpm start` mở bản build hiện tại nhanh hơn.

`pnpm dev:ui` chạy Next.js dev server với Fast Refresh ở port 3000, dành cho sửa giao diện. Server này **không có API Cloudflare/D1/WebSocket**; dùng `pnpm dev` cho kiểm tra chức năng đầy đủ.

Không có tài khoản mặc định hoặc cách bỏ qua đăng nhập. Trang nhân viên yêu cầu tài khoản Firebase đã xác minh email và đúng phân quyền. Rider không cần đăng nhập nhưng cần QR station hợp lệ được tạo trong `/admin/`. Firebase project mặc định vẫn là `sdd-local-app` như source gốc; nếu cần môi trường mới hoàn toàn, thay `public/firebase-config.js`, `FIREBASE_PROJECT_ID` và Firebase admin service account cùng lúc.

## Các màn hình

- `/`: nhân viên, quản lý đơn, HOLD/BOX, bàn giao, Rider Overview.
- `/mobile/`: giao diện nhân viên trên điện thoại.
- `/admin/`: Admin Pro, station, phân quyền và tài khoản kiosk.
- `/login/`: đăng nhập Firebase, tách phiên kiosk.
- `/kiosk/`: thiết bị tại quầy, đăng ký rider và gọi hỗ trợ.
- `/rider/#<qr-code>`: rider tự đăng ký, nhập từ 3 ký tự cuối và lấy số.
- `/support/`: Customer Service theo station.
- `/rider/call/`: hỗ trợ rider; URL cũ `/rider/call.html#<qr-code>` vẫn dùng được.
- `/location-tools/`: công cụ upload/download Location; `/location_tools.html` vẫn dùng được.

## Thư mục để chỉnh sửa

`app/(desktop)/page.tsx` là giao diện nhân viên. Các route group còn lại chứa từng màn hình và `layout.tsx` riêng để giữ CSS và class trên `body` đúng bản gốc.

`components/OperationalDocument.tsx` dùng chung cấu trúc tài liệu; `OperationalRuntime.tsx` khởi chạy tuần tự các script sau hydration, chỉ một lần cho mỗi document. Điều hướng giữa các màn dùng thẻ `a` và tải trang đầy đủ, giúp các module camera, auth và WebSocket có vòng đời giống source cũ.

`public/next-runtime/desktop-2.js` và `mobile-1.js` là phần nghiệp vụ được tách từ script inline của hai trang lớn. Các script trang khác giữ tên gốc trong `public/`. Chỉnh sửa trực tiếp các file này nếu cần thay đổi nghiệp vụ.

`migration/reference/` giữ 9 HTML tham chiếu, chỉ dùng đối chiếu và không được public lên web. `scripts/migrate-reference.mjs` là công cụ chuyển đổi một lần; chạy lại sẽ ghi đè các trang, layout, CSS và script đã sinh. Build bình thường không gọi công cụ này.

## Kiểm tra

```powershell
pnpm test
pnpm build
pnpm typecheck
pnpm test:export
pnpm exec wrangler deploy --dry-run
```

Khi server port 8787 đang chạy, có thể chạy `pnpm test:smoke` ở terminal thứ hai. Bài smoke chỉ dùng QR không tồn tại để kiểm tra từ chối, không tạo phiếu.

`test:export` so sánh DOM, nội dung, các trường và CSS của cả 9 trang build với HTML gốc. Khi chủ động sửa giao diện, cập nhật kiểm tra tương ứng; không cần giữ bản tham chiếu như một yêu cầu thiết kế mãi mãi.

## Triển khai thành ứng dụng mới trên Cloudflare

Cấu hình hiện tại dùng tên mới `ifc-01-handover-nextjs`. `database_id` là UUID toàn số 0 để làm việc cục bộ, **phải thay bằng ID D1 mới trước khi deploy**. Không gắn database production cũ nếu muốn một ứng dụng độc lập.

```powershell
pnpm exec wrangler login
pnpm exec wrangler d1 create ifc-01-handover-nextjs-db
# Chép database_id vừa trả về vào wrangler.jsonc, binding vẫn là DB.
pnpm exec wrangler d1 execute DB --remote --file schema.sql
pnpm exec wrangler secret put ADMIN_EMAIL
pnpm build
pnpm exec wrangler deploy
```

Thêm hostname mới vào Firebase Authentication → Settings → Authorized domains. Bật Google/Email-Password theo nhu cầu. Mở `/admin/` bằng tài khoản `ADMIN_EMAIL` đã xác minh để cấp quyền nhân viên/Customer Service, tạo kiosk và in QR station.

Quản lý tài khoản kiosk qua Firebase Admin cần secret `FIREBASE_ADMIN_JSON` từ service account của đúng Firebase project. TURN dùng ba secret `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` khi cần kết nối video giữa các mạng. Chi tiết nghiệp vụ, quyền và thiết lập media nằm trong `docs/original/RIDER_SETUP.md` và `docs/original/DEPLOY.md`.

`docs/original/` là tài liệu từ ZIP đầu vào, có thể chứa tên Worker/database và lệnh triển khai môi trường cũ. Đây là tài liệu tham khảo lịch sử; dùng hướng dẫn Next.js ở trên cho bản mới.

## Giới hạn xác minh

Xem `VALIDATION.md`. Đăng nhập tài khoản Firebase thật, quản lý kiosk bằng service account và video hai chiều giữa hai mạng cần kiểm tra với tài khoản/thiết bị của bạn. Source chưa được deploy hoặc kết nối vào D1 production trong quá trình chuyển đổi.
