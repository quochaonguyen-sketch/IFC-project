import {auth,session,logout,deviceContext} from "/auth-client.js";
import {GoogleAuthProvider,signInWithPopup,signInWithEmailAndPassword,sendEmailVerification} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
const $=id=>document.getElementById(id);
const deviceLogin=deviceContext;
if(deviceLogin){
  $("google").hidden=true;
  document.querySelector("h1").textContent="Mở quầy tại station";
  $("msg").textContent="Người phụ trách đăng nhập bằng email và mật khẩu của máy. Sau đó rider tự nhập thông tin.";
}
async function check(){
  if(!auth.currentUser)return;
  $("switch").hidden=$("retry").hidden=false;
  await auth.currentUser.reload();
  $("verify").hidden=auth.currentUser.emailVerified;
  if(!auth.currentUser.emailVerified)throw Error("Hãy xác minh địa chỉ email, rồi chọn Kiểm tra lại quyền.");
  await auth.currentUser.getIdToken(true);
  const {role}=await session(),next=new URLSearchParams(location.search).get("next");
  if(deviceLogin&&role!=="kiosk")throw Error("Hãy nhập email của máy kiosk do quản trị viên station cấp.");
  if(!deviceLogin&&role==="kiosk")throw Error("Trang này dùng tài khoản nhân sự. Chọn Đổi tài khoản để đăng nhập lại.");
  if(next==="/admin/"&&!["admin","warehouse_admin"].includes(role))throw Error("Vui lòng đăng nhập tài khoản Admin Pro hoặc Admin station.");
  const routes=["/","/mobile/","/location_tools.html","/location-tools/"];
  const target=role==="kiosk"?"/kiosk/":(role==="admin"||role==="warehouse_admin")&&(!next||next==="/admin/")?"/admin/":routes.includes(next)?next:"/";
  location.replace(target);
}
async function run(fn){try{$("msg").textContent="Đang kiểm tra…";await fn();}catch(e){
  const messages={
    "auth/popup-blocked":"Trình duyệt chặn cửa sổ Google. Cho phép cửa sổ bật lên cho trang IFC rồi bấm lại.",
    "auth/popup-closed-by-user":"Cửa sổ Google đã đóng trước khi hoàn tất đăng nhập. Hãy thử lại.",
    "auth/unauthorized-domain":"Domain hiện tại chưa được cho phép trong Firebase project sdd-local-app.",
    "auth/operation-not-allowed":"Google provider chưa được bật trong Firebase project sdd-local-app.",
    "auth/network-request-failed":"Không kết nối được Firebase. Kiểm tra mạng hoặc tiện ích chặn nội dung."
  };
  $("msg").textContent=(messages[e.code]||e.message)+(e.code?" ["+e.code+"]":"");
}}
$("google").onclick=()=>{
  if($("google").disabled)return;
  $("google").disabled=true;
  const provider=new GoogleAuthProvider();
  provider.setCustomParameters({prompt:"select_account"});
  run(async()=>{await signInWithPopup(auth,provider);await check();})
    .finally(()=>{$("google").disabled=false;});
};
$("form").onsubmit=e=>{e.preventDefault();run(async()=>{await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value);await check();});};
$("retry").onclick=()=>run(check);
$("switch").onclick=logout;
$("verify").onclick=()=>run(async()=>{await sendEmailVerification(auth.currentUser);$("msg").textContent="Đã gửi thư xác minh. Kiểm tra hộp thư.";});
await auth.authStateReady();if(auth.currentUser&&!deviceLogin)run(check);
