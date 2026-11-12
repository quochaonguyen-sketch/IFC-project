# Xác minh bản Next.js — 04/11/2026

Môi trường: Windows, Node.js 24.22.1, pnpm 11.25.0, Next.js 16.4.5, React 19.3.1.

## Cập nhật: rider đăng ký không nhập tên

- Bắt đầu chuyển thẳng sang nhập mã đơn; giao diện chỉ còn 2 bước nhập mã và xác nhận.
- API guest chấp nhận thiếu tên hoặc tên trống, dùng nhãn `Rider` cho phiếu. Giới hạn độ dài tên nếu client cũ gửi lên, chống trùng, khóa đơn và kiểm tra QR vẫn còn nguyên.
- Thử lại phiếu không tên trả cùng số; bản nháp cũ ở bước nhập tên tự chuyển sang nhập mã; bản nháp đã gửi giữ nguyên tên, token và request ID để không làm mất khả năng thử lại.
- Lời thoại WAV xác nhận danh sách không nhắc nhập/kiểm tra tên.
- Đã chạy lại `pnpm test`, build, typecheck, đối chiếu export và smoke thành công.
- Đã mở localhost bằng trình duyệt và xác nhận Bắt đầu đi thẳng tới `BƯỚC 1 / 2`, chỉ có ô mã đơn; không có lỗi console trong phần kiểm tra này.

## Đã qua

- `pnpm install --frozen-lockfile`: cài theo lockfile; cho phép build esbuild/workerd, không chạy postinstall Tesseract không cần thiết.
- `pnpm test`: kiểm tra migration, các ID giao diện, script sau hydration, quay lại URL công cụ Location sau login và chặn URL chuyển hướng ngoài; toàn bộ kiểm thử nghiệp vụ gốc, Firebase-format token, rider, guest video signaling và 37 WAV.
- `pnpm build`: build App Router và static export thành công, đủ 9 trang.
- `pnpm typecheck`: TypeScript frontend và Cloudflare Worker đều qua.
- `pnpm test:export`: đối chiếu DOM, văn bản, thuộc tính điều khiển và CSS của 9 trang xuất ra với bản gốc. Chỉ chuẩn hóa phần kỹ thuật React: boundary streaming ẩn, class body rỗng và thuộc tính src rỗng được React bỏ đi. Sáu khai báo `display:none!important` được giữ bằng stylesheet vì React style object không hỗ trợ `!important`.
- `pnpm test:smoke`: HTTP thực qua Wrangler local, các trang Next.js, script, link HTML cũ, health, từ chối API khi chưa đăng nhập, từ chối WebSocket thiếu Upgrade và 404 cho đường dẫn lạ.
- `wrangler deploy --dry-run`: đóng gói Worker, D1/Durable Object bindings và assets Next.js thành công; không deploy.

## Kiểm tra trình duyệt thật

- Trang nhân viên khởi tạo và chuyển về Firebase login khi chưa đăng nhập; không có lỗi console trong phần đã kiểm tra.
- Rider hiển thị trạng thái thiếu QR đúng yêu cầu.
- Dùng QR và một đơn thử **chỉ trong D1 cục bộ**: nhập tên → nhập mã viết thường `8a2` → xác nhận khớp `8A2` → kiểm tra danh sách → tạo phiếu → hiển thị số `001`.
- Ở viewport 375×812, các bước rider vẫn thao tác được, không thấy tràn ngang.
- Mở hỗ trợ từ phiếu: trang Next.js gọi hỗ trợ trong iframe nhận station và số chờ. Đóng khung giữ nguyên phiếu, tên và mã đơn.
- Các đường dẫn không có dấu `/` cuối cho kiosk/login/support/admin/mobile/rider chuyển về đường dẫn có `/`, giữ đúng nhận diện phiên và quyền của source gốc.

## Chưa xác minh

- Đăng nhập Google hoặc Email/Password bằng tài khoản Firebase thật.
- Thao tác thực tế của nhân viên/Admin/Kiosk đã đăng nhập và phần cứng máy quét/máy in/camera OCR.
- Tạo/reset tài khoản kiosk qua Firebase Admin service account.
- Nghe chất lượng âm thanh trên điện thoại thật, các webview Zalo và cuộc gọi media hai chiều giữa Wi-Fi/4G; TURN cần credential thực.
- Vận hành production và cron tại thời điểm 06:00. Quy tắc reset và backend được giữ nguyên, các ca nghiệp vụ được kiểm tra bằng SQLite và mock transport như source gốc.

Không thay đổi Worker/D1/Firebase production. ZIP bàn giao không chứa `.wrangler/`, dữ liệu thử, `node_modules/`, `.next/`, `out/` hoặc secret. Các HTML tham chiếu chỉ có trong source, không nằm trong assets triển khai.

## Video call production fix — 2026-11-04 / v0.7.1

- Production read-only D1 inspection confirmed one expired QR call still marked accepted, matching the invisible acceptance lock.
- All project tests passed, including the new support acceptance and inbox regressions.
- Next.js production build, frontend/Worker TypeScript checks, exported-route checks and Wrangler dry-run passed.
- Deployed the Next.js project with production variables preserved. Active Worker version: db865a11-f6d3-4293-b95f-3df3ffa9261f.
- Live production smoke checks passed across all routes and operational scripts, old URLs, API authentication, WebSocket boundary and 404 behavior.
- /health reports IFC_01_HANDOVER_0_7_1; deployed support.js matches the reviewed local file and the support page loads v0.7.1 with the existing Next.js UI.
- No laptop UI automation or real two-device media test. TURN remains unconfigured.
## Driver video layout — v0.7.3 / 2026-11-05

- The driver's call dialog fills the mobile viewport. The receptionist occupies the main video stage; the driver's camera is a small corner preview.
- Compact header, collapsible instructions, safe-area spacing and an always-visible end-call button keep room for the video. Landscape uses a contained image to avoid aggressive cropping.
- Styles stay scoped to the rider/call pages. Existing staff-desk layout and media/signaling behavior are preserved.
- Full tests, CSS parsing, Next.js build, TypeScript, export checks and deployment dry-run passed.
- Production deployed with preserved variables: Worker version 4486efb9-8d51-4e02-b211-1156092164c0. Live route smoke checks, exact stylesheet checks and TURN credential health passed.
- No browser control or real-phone visual/audio/video QA was performed for this change.
## Rider wording and guidance audio — v0.7.4 / 2026-11-05

- Entry title is exactly "Nhập 3 mã cuối đơn hàng". The step-two hint and always-visible full-code instructions were removed. Minimum-length/ambiguity guidance still appears when validation fails.
- Rider guidance now prefers 20 bundled Vietnamese MP3 clips, including receipt digits, at 80% playback volume. Device speech is used only if the recording cannot play, with neutral pitch. Opening support still cancels guidance.
- Recordings were generated with Google Translate speech via gTTS using scripts/rider-voice.py. Generation is offline from the app's perspective: browsers fetch the bundled files from the Worker and never call a TTS provider. Existing WAVs remain for legacy callers.
- Full tests, Next.js build, TypeScript, static-export checks and Wrangler dry-run passed. Playback queue, cancellation, native fallback, concise entry/error behavior and MP3 headers were checked.
- Deployed production version f56e0dbf-5226-40c0-9be9-cbbeae1a408a with preserved variables. All 20 deployed MP3 hashes/MIME types, rider entry code and TURN health were verified. Live route smoke checks passed.
- No browser control or real-phone speaker/listening QA was performed.
## Customer Service order-entry restoration — 2026-11-06

- The redesigned inbox omits the accepted-call form button, while the auto-open handler still tried to click it. The handler now mounts the existing form directly in the active workspace. Kiosk acceptance and restored accepted calls also show the form.
- Reopening and inbox polling preserve the form node and unsaved driver/order values.
- Added regression coverage that reproduces the missing mobile form, accepted-call reload, kiosk acceptance and draft preservation. Full tests, Next.js production build, TypeScript, static-export checks and Wrangler dry-run passed.
- Deployed version c15c5ca2-ea8a-4afa-acc9-ba82bfe969d1 with production variables preserved. Live route smoke tests, exact support-script comparison, cache-busting script reference and TURN health passed.
- No browser control or real staff/rider call was used for verification.

## Rider stage and signaling latency — 2026-11-06

- The agent call has a dedicated large rider stage (360–720px desktop height) and a smaller staff preview. Assisted entry sits at the top of the right sidebar and stacks after the video on narrow screens. Removed the nested video/form split. Ending another call preserves held drafts.
- Accepted mobile calls mount video before the multi-station inbox refresh. Signaling sends up to 20 messages per HTTP request, preserving IDs on retry and validating batches before atomic deduplicated inserts. Single-message clients remain supported. Connecting peers poll at 250ms; connected peers at 1500ms. Existing peers skip TURN credential issuance. Rider waiting-status polling is 750ms.
- Tests cover a 12-candidate ICE burst in one request, lost-response replay, batch authorization/validation, held draft preservation, independent permission prompts, recovery and startup before a delayed inbox response.
- Full tests, frontend/Worker TypeScript, Next.js build, CSS parsing, export checks and deployment dry-run passed. Deployed 764b5f80-1484-4b7e-9be5-e933c5c7121b with production variables preserved. Live route smoke tests, exact assets/source-map matches and TURN health passed.
- No browser control, rendered layout inspection or real two-device call timing was performed. Connection latency still depends on permissions and both networks.


## HOLD status and rider confirmation — 2026-11-06

- A read-only production query confirmed ticket VNHCM1_20261106_0001 was HANDED_OVER. The desktop search freeze prevented its visible PICKED card from reconciling with the updated cache. Pinned search now refreshes only when the selected ticket changes; older snapshots cannot restore a completed ticket. Opening scan verifies current server state. The previous handover's 1200ms reset ignores a new session instead of closing it. Applied and regression-tested on desktop and mobile.
- Rider entry places Add beside the input and Finish underneath. Finish opens a native confirmation dialog with the entered codes; Confirm registers and goes directly to the queue number. Back/cancel preserves entry. Unadded text is flagged. Network errors retain the exact pending request and prevent edits until retry; definite validation errors allow corrections. Duplicate confirmation clicks send one request.
- Updated three bundled voice clips to say Finish/Confirm. Full tests, Next.js build, frontend/Worker TypeScript, CSS parse, export checks and Wrangler dry-run passed. New tests cover status reconciliation, old snapshots, server state, delayed reset, popup review/back/cancel, server rejection and request replay.
- Deployed b86d26d2-4823-49fa-81ec-58427c96283e with production variables preserved. Live assets/audio hashes and MIME, confirmation markup/script references, and route/API smoke checks passed.
- No browser control, rendered layout QA or real driver registration/handover was performed. The reported disappearing UI was treated as the scan window based on the screenshot; the optional clarification was unanswered.


## Restore handover palette from supplied ZIP — 2026-11-06

- Read the supplied Downloads/IFC_01_Handover_Cloudflare_v0.7.0_FULL.zip as a visual reference. Restored its blue/green/red/orange/dark/gray/purple/cyan action colors, rounded ticket cards, colored BOX badges and handover modal panels with a scoped stylesheet.
- Added /ui/handover-colors.css?v=0.7.8 only to desktop/mobile layouts. Visual rules target the handover section and associated modals. Customer Service and rider registration do not load it. No operational JavaScript, shared theme, backend or data was replaced from the archive.
- CSS parse, production Next.js build/TypeScript, export checks, selector scope checks and Wrangler dry-run passed. Hashes confirm Customer Service files, existing rider flow and handover scripts are unchanged.
- Deployed 14069b14-2a1d-402d-877f-ce6898d15157 with production variables preserved. Live palette/routes, Customer Service exclusion, preserved asset hashes and route/API smoke tests passed.
- No browser control or rendered visual inspection was performed. Existing layout and recent functional fixes are retained.


## VNWL warehouse operations restoration — 2026-11-06

- User supplied vnwl-cloud-d0-worker-main.zip and VNWL_frontend_24533c2c5e494aad.zip, and explicitly limited restoration to warehouse operations while preserving Customer Service and rider flows.
- Converted the original desktop, mobile and Location HTML/CSS into the existing Next.js routes. References were updated from the supplied frontend archive. These three layouts opt out of the shared visual system using legacyVisual; other routes keep their existing theme. Navigation remains keyboard-accessible. Current local vendor scripts and authenticated adapter remain in use.
- Compared 475 desktop functions, 458 mobile functions and 66 Worker functions from the archives. Operational functions/routes are present in the current system; the archive's Firebase project, Worker hostname, database ID, email allow-list and authentication were not imported. Current server permissions, Admin Pro secret, Firebase, D1 and TURN bindings are retained.
- Restored the BOX workflow: receive then open BOX prompt; explicit scan/skip before Mark picked; wait for server confirmation instead of optimistic success. Direct acceptance now atomically receives the selected ticket instead of ignoring its ID. Sorting atomically receives up to three FIFO tickets, with rollback on failure and conflict handling. Existing scan-status reconciliation and previous-session timer protections remain.
- Full tests passed, including added selected-card acceptance/idempotency/owner-conflict, sorting FIFO/count/transaction rollback and BOX-stage checks. Retained-handler tests cover desktop/mobile receive success/failure, BOX prompts and pick confirmation. Next.js build, frontend/Worker TypeScript, original IDs, export, CSS parses and Wrangler dry-run passed.
- Deployed eec551d6-8793-47ca-8ae5-3b13c6b0928a with --keep-vars. Live assets/source maps, restored theme scopes, unchanged CS/rider/auth asset hashes, TURN health, Admin Pro binding and route/API smoke checks passed. No production fixture orders or calls were created.
- Backup of changed files and comparison scripts are in the session workspace legacy-vnwl/backup. No browser control, rendered visual QA or real PC/PDA operational transaction was performed.


## Shopee-only creation, early QR routing and modal flow — 2026-11-06

- PC/Mobile Create Order now shows one Shopee code field followed by Location and Sub. Removed the second desktop input dependency, updated keyboard/scanner transitions and instructions, and adjusted the wide desktop grid. The existing canonical input ID is retained; migration checks explicitly retire newOrderSn.
- Creation accepts Shopee-only identifiers. Existing active orders are matched by their exact Shopee alias within the current warehouse/day, preserving their original ID/AWB and suffix keys instead of creating a duplicate. Ambiguous aliases are rejected. Mobile retains its optional Sub behavior. Existing AWB data and import templates are not removed.
- Root cause of the reported blank rider video: QR notifications used the issue text "Rider đang gọi từ QR" while the fast answer fallback recognized only "Yêu cầu QR gọi từ điện thoại". Clicking the banner before the inbox loaded could invoke kiosk-only WebSocket signaling for an anonymous QR participant. The server now supplies video_mode in notifications/inbox/acceptance and compatible issue text; the desk routes by this type and corrects a misclassified acceptance using the authoritative response. Read-only production inspection confirmed the recent VNHCM1 calls were QR calls.
- The handover modal's flex children no longer shrink into overlapping content. The whole modal scrolls within the viewport while preserving the original warehouse theme.
- Full tests, Next.js build, Worker/frontend TypeScript, static export, CSS parse and Wrangler dry-run passed. New checks cover Shopee-only creation/retry, existing AWB/ID preservation, ambiguity, keyboard flow, failed submission retention, early QR fallback and notification compatibility. No production test orders or calls were created.
- Deployed 13a8a9f3-1b4b-472a-ab7c-34fe5a89cc43 with production configuration preserved. Live input markup, script/CSS equality, Worker source maps, TURN health and route/API smoke checks passed.
- No browser control, rendered popup inspection or actual two-device media call was performed. Reload both the desk and caller pages before retesting.


## Session restoration without legacy login flash — 2026-11-06

- The user confirmed that reload briefly showed login and then entered automatically; the saved session was still present. Root cause was the original warehouse HTML's visible inline login overlay while retained operational scripts waited for the authenticated session.
- Desktop/mobile now render a neutral status message ("Đang khôi phục phiên đăng nhập…") immediately, with the obsolete inline login box hidden in server-rendered markup and CSS. Existing waitForAccessLogin/hideAuthLoginScreen removes the overlay after successful session restoration. The actual /login route still handles unauthenticated users.
- No persistence, token, gate, server authorization, account, Customer Service or rider code was changed. Those files' SHA-256 hashes were verified. Firebase persistence documentation was consulted during investigation; the clarification established a UI flash rather than lost persistence.
- Next.js production build/TypeScript and static-export checks passed, including initial status/hidden-login assertions. Deployed bfbac4bc-ec83-4494-8290-65ff13e9f182 with production configuration preserved. Live initial HTML/CSS, unchanged auth/login/support/rider scripts and route/API smoke tests passed.
- No browser control or observed end-to-end browser reload was performed.


## Warehouse creation and scoped account administration — 2026-11-06

- Added a visible warehouse/account admin entry in the desktop/mobile operational navigation. The admin page has separate warehouse creation and account grant forms, local status feedback, and the existing permission list/revoke controls. Admin Pro creates warehouses and grants Staff, Warehouse Admin and Customer Service across active warehouses; warehouse managers remain limited to Staff in their managed warehouses. Existing backend authorization is unchanged.
- New warehouse codes are normalized/validated; known duplicates are rejected in the UI. A created warehouse becomes the current selection and preselected grant target. Pending forms block repeat submissions, preserve drafts on errors and restore restricted controls. Late permission-list responses cannot overwrite a newly selected warehouse. Kiosk account management and station QR printing are unchanged.
- Full automated suite passed, including new admin UI checks for create-to-grant, duplicate clicks, duplicate codes, retained drafts/errors, stale lists and manager scope. Final Next.js build/frontend TypeScript, Worker TypeScript, static export, CSS parse and Wrangler dry-run passed. Adapter comparison confirms only the admin navigation changed. No real warehouse, user permission or order was created during testing.
- DEPLOYMENT BLOCKED: repeated Wrangler deploy attempts with --keep-vars returned Cloudflare API 503, "no healthy upstream", on GET /accounts/.../workers/services/ifc-01-handover-pilot, from Singapore. Attempts on 2026-11-06 09:22–09:27 UTC did not upload the new version. Cloudflare's official status summary simultaneously reported "Network Performance Issues in Singapore" (investigating). The prior live deployment remains bfbac4bc-ec83-4494-8290-65ff13e9f182; live route/API smoke checks passed during the outage.
- Source and out/ are ready for deploy when the API recovers. Backups, preserved-code check, and pending live verification are in the session workspace warehouse-admin/. No browser control or rendered/real-account end-to-end admin test was performed. Run warehouse-admin/verify-live.mjs and the production source-map check after a successful deploy.

## Warehouse/account admin deployment completed — 2026-11-06

- Retried the pending production deploy after the Cloudflare API outage. Deployment succeeded using --keep-vars. Current version: 479a6b0d-8b5e-4305-92db-4da2a089741e, worker ifc-01-handover-pilot.
- Live verification passed: new admin form IDs and v0.8.3 asset references, exact production JS/CSS equality, operational navigation assets, unauthenticated admin API rejection, all route/script/legacy URL/API smoke checks, production Worker source-map equality, and retained ADMIN_EMAIL/TURN/Firebase bindings.
- No real warehouse or account permission was created during verification. No browser control or authenticated manual UI test was performed.

## Global Admin Pro, Customer Service access and warehouse removal — 2026-11-07

- Replaced the single ADMIN_EMAIL comparison with active records in ifc_admins. Admin Pro is a global account role independent of warehouse memberships. Added Admin Pro list/grant/revoke/transfer on the admin page. Revoke uses a conditional SQL update so simultaneous requests cannot remove the last admin; transfer grants the target and removes the current admin in one D1 batch. Server authorization, membership lookups, realtime notifications and media signaling now use current database grants.
- Root cause of Admin Pro being unable to open Customer Service: session.supportStations only loaded explicit station grants. Global admins now receive every active warehouse in both warehouses and supportStations. Realtime support notifications and both directions of accepted-call signaling recognize global admins; revoked sockets stop receiving/forwarding as global admins. Customer Service and rider layouts remain unchanged.
- Added confirmed warehouse removal. It atomically marks the warehouse inactive and removes station memberships/CS grants (and WH1 legacy grants), preserving historical records. Active slot/BOX/hold locks and recent waiting/accepted/held support calls block removal with a visible error; the guard rolls back the batch on conflicts. Inactive warehouses disappear from active management and operational/API access is denied. No real warehouse was removed during implementation.
- Removed the Kiosk management section and kiosk entries from the admin UI. Existing rider/call compatibility and stored device records remain intact. Scoped warehouse managers still only grant Staff in their own warehouses. Hidden role/card elements now consistently remain hidden under the shared CSS.
- Full automated suite, final workflow/media authorization checks, frontend/Worker TypeScript, Next.js production build, export/control preservation, admin CSS parse and Wrangler dry-run passed. Added coverage for global grants/transfer/revocation, last-admin races, notification/signaling access and revocation, busy warehouse rollback, historical data preservation, UI confirmations, errors and manager boundaries.
- The user explicitly selected quochao.nguyen@spxexpress.com for the temporary Admin Pro grant. Production migration created ifc_admins, preserved duy.nguyenhuu01@spxexpress.com and activated the selected email. Both active records were verified via read-only D1 queries; no expiry date was supplied. The SQL used and code backups are in the session workspace global-admin/.
- Deployed version 028aff0a-c5d2-426a-950a-8e000d3dda3d with --keep-vars. Exact live admin JS/CSS, new form IDs/version references, no Kiosk admin section, unauthenticated API boundaries, route/API smoke tests, and production Worker source-map equality passed. No browser control, authenticated manual Google sign-in, actual warehouse removal/transfer, or real two-device call was performed.

## Rider entry and pickup-ready voice recovery — 2026-11-07

- Root causes: successful station connection rendered without speech; receipt polling only spoke on a HOLD-to-PICKED edge and saved PICKED before successful playback, so reloads/blocked playback could lose the prompt. A new Audio element for each clip also discarded per-element playback activation. Receipt redraws reset Repeat to queue speech even after readiness.
- Valid station entry now attempts the current-step greeting/instruction. One reusable MP3 player handles guidance, receipt digits and later readiness announcements. NotAllowedError presents a visible Bật loa hướng dẫn control near the top; its tap or a later trusted interaction retries the pending prompt. Existing natural Vietnamese MP3s are preserved, with Vietnamese synthesis only as the existing media-failure fallback.
- PICKED status sets a visible invitation to collect goods and speaks the readiness clip. A per-registration acknowledgement is saved only when playback/synthesis finishes; repeated polls do not interrupt it, and undelivered/interrupted prompts recover after reload or returning to the page. Repeat retains the ready instruction. Speech defers while the support dialog is open and resumes afterward. Visible receipt polling is now 5 seconds; background pages do not force playback. Stale responses from a different registration are ignored.
- Full suite passed, including new tests for entry greeting, blocked autoplay and tap/key recovery, one reused player, PICKED polling/reload recovery, completion acknowledgement, stale completion after interruption, correct Repeat, background return and support-dialog deferral. Existing pickup registration/confirmation/retry/draft tests, MP3 checks, Next.js build/frontend TypeScript, export/control preservation, CSS parse and Wrangler dry-run passed.
- Deployed 22a47f89-0b4e-40e8-b122-f726433a50e4 with --keep-vars. Live v0.8.5 rider JS/CSS, activation UI, exact welcome/ready/receipt/digit/wait MP3 bytes, Worker source-map equality, existing Admin Pro UI and all route/API smoke checks passed. No production orders or support calls were created.
- Browser autoplay restrictions were checked against MDN/Chrome primary documentation. No browser/laptop control or real-phone speaker test was performed. A browser may require one tap to enable audio and may suspend an inactive/locked page; automatic playback before any interaction cannot be guaranteed. Keep the receipt page open to receive timely guidance.

## Shared Customer Service queue and ownership coordination — 2026-11-07

- Confirmed existing D1 acceptance uses a conditional waiting-to-accepted update, so distinct agents cannot claim the same call. Improved conflict feedback to identify the current owner. Added real SQLite concurrent-request coverage: two agents race for one call (one winner and one conflict), while the loser may claim another call in the same station. One active call per account is preserved.
- Fixed ownership gaps: only the assigned agent can resolve/cancel a CS call or resume a held call; a kiosk may still cancel its own request. Hold/resume require current station access. Resume is now an atomic guarded batch that activates the requested held call and holds the account's other active calls; simultaneous resumes cannot leave two active calls. Lost-response resume/accept retries remain idempotent.
- Added a separate read-only coworker section showing the assigned email/status. Only the current agent's held calls receive Resume/End controls, and ended/stale held entries are pruned. Busy agents' accept controls are disabled; receiving another call requires an explicit hold/end rather than silently holding their current call. Incoming ringtones do not interrupt an active call. Queue ringing selects a waiting call and stops immediately on its realtime acceptance/ending; event invalidation discards stale in-flight inbox snapshots and coalesces a fresh read.
- Unified QR/kiosk acceptance under one in-flight guard. Server claim precedes opening media, so losing an acceptance race does not start another rider session. If camera/microphone setup fails after a successful claim, ownership/order entry remain visible with a retry action. End now waits for server success before discarding media/forms; failed endings preserve entered drafts. Ending a held call does not signal hangup to a different current call. Queue refreshes no longer reset the current call's duration timer.
- Full suite passed, plus targeted final UI coverage for coworker read-only controls, immediate ring stop, stale-response invalidation, busy-call protection, retained draft on failed end and claimed-call recovery after camera denial. Backend checks cover simultaneous claims/resumes, separate concurrent calls, owner-only ending/resume and idempotent retries. Next.js build/frontend TypeScript, Worker TypeScript, export/control preservation, support CSS parse and Wrangler dry-run passed. Shared-module version references were updated in both CS and kiosk layouts and migration metadata.
- Deployed 792a5d3b-d358-4e07-9d9d-6760632e4989 using --keep-vars. Live v0.8.6 support assets/caller references, exact JS/CSS, API authentication, route/API smoke checks, Worker source-map equality and unchanged rider voice assets passed. No real production calls or warehouse orders were created for testing.
- No browser control or physical multi-device call test was performed. Ownership is account/email based: staff sharing one email are the same agent to the system; use individual emails. Realtime UI updates require the WebSocket connection, with the existing 10-second inbox poll as fallback.
