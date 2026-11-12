import {gate,authenticatedFetch,logout} from "/auth-client.js";
const $=id=>document.getElementById(id);
let me,availableWarehouses=[],knownWarehouses=[];
const roleLabels={warehouse_admin:"Quản trị viên kho",staff:"Nhân viên",customer_service:"Customer Service"};
async function call(path,options){const r=await authenticatedFetch(path,options);const v=await r.json();if(!r.ok)throw Error(v.message||v.error||"Không thể cập nhật.");return v;}
function payload(email,role,warehouses){return {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,role,warehouses:Array.isArray(warehouses)?warehouses:[warehouses]})};}
async function submit(form,messageId,action){
  if(form.dataset.busy==="1")return;
  form.dataset.busy="1";form.setAttribute("aria-busy","true");
  const controls=[...form.querySelectorAll("input,button,select")].map(node=>[node,node.disabled]);
  controls.forEach(([node])=>node.disabled=true);
  try{await action();}catch(error){$(messageId).textContent=error.message;}
  finally{controls.forEach(([node,disabled])=>node.disabled=disabled);form.dataset.busy="0";form.setAttribute("aria-busy","false");}
}
function syncGrantWarehouse(){
  for(const input of $("grantWarehouses").querySelectorAll("input"))input.checked=input.value===$("warehouse").value;
}
async function loadUsers(){
  const wh=$("warehouse").value;if(!wh){$("users").replaceChildren();return;}
  const result=await call("/api/admin/permissions?warehouse="+encodeURIComponent(wh));
  if($("warehouse").value!==wh)return;
  $("users").replaceChildren();
  const items=result.items.filter(user=>user.role!=="kiosk");
  if(!items.length){const empty=document.createElement("li");empty.textContent="Kho này chưa có tài khoản được cấp quyền.";$("users").append(empty);}
  for(const user of items){
    const row=document.createElement("li"),label=document.createElement("span"),badge=document.createElement("span");
    label.textContent=user.email+" · "+(roleLabels[user.role]||user.role);badge.className="pill";badge.textContent=user.warehouse||wh;label.append(" ",badge);row.append(label);
    if(me.role==="admin"||user.role==="staff"){
      const revoke=document.createElement("button");revoke.type="button";revoke.className="danger";revoke.textContent="Thu hồi";
      revoke.onclick=async()=>{
        if(revoke.disabled||!confirm(`Thu hồi quyền ${roleLabels[user.role]||user.role} của ${user.email} tại ${wh}?`))return;
        revoke.disabled=true;
        try{await call("/api/admin/permissions?warehouse="+encodeURIComponent(wh),{...payload(user.email,"revoke",[wh]),body:JSON.stringify({email:user.email,role:"revoke",target_role:user.role,warehouses:[wh]})});await loadUsers();$("grantMsg").textContent="Đã thu hồi quyền tại "+wh+".";}
        catch(error){$("grantMsg").textContent=error.message;revoke.disabled=false;}
      };row.append(revoke);
    }
    $("users").append(row);
  }
}
async function loadWarehouses(preferred){
  knownWarehouses=me.role==="admin"?((await call("/api/admin/warehouses")).items||[]):(me.managedStations||[]).map(code=>({code,name:code,active:1}));
  availableWarehouses=knownWarehouses.filter(warehouse=>Number(warehouse.active)!==0);
  const select=$("warehouse"),keep=preferred||select.value;select.replaceChildren();
  for(const warehouse of availableWarehouses){const option=document.createElement("option");option.value=warehouse.code;option.textContent=warehouse.name&&warehouse.name!==warehouse.code?`${warehouse.code} · ${warehouse.name}`:warehouse.code;select.append(option);}
  if([...select.options].some(option=>option.value===keep))select.value=keep;
  $("warehouseCard").hidden=me.role!=="admin";$("adminGlobalCard").hidden=me.role!=="admin";
  $("adminScope").textContent=me.role==="admin"?"Admin Pro: quản lý toàn hệ thống và Customer Service của mọi kho đang hoạt động.":"Bạn chỉ cấp/thu hồi quyền Nhân viên trong các kho được giao.";
  $("warehouses").replaceChildren();
  if(me.role==="admin")for(const warehouse of availableWarehouses){
    const row=document.createElement("li"),label=document.createElement("span"),remove=document.createElement("button");
    label.textContent=`${warehouse.code} · ${warehouse.name||warehouse.code}`;remove.type="button";remove.className="danger";remove.textContent="Xóa kho";
    remove.onclick=async()=>{
      if(remove.disabled||!confirm(`Xóa kho ${warehouse.code}? Thu hồi quyền truy cập tại kho này và gỡ khỏi danh sách hoạt động. Lịch sử bàn giao được giữ lại.`))return;
      remove.disabled=true;$("warehouseMsg").textContent="Đang xóa kho…";
      try{await call("/api/admin/warehouses?warehouse="+encodeURIComponent(warehouse.code),{method:"DELETE"});await loadWarehouses();$("warehouseMsg").textContent="Đã xóa kho "+warehouse.code+" khỏi danh sách hoạt động.";}
      catch(error){$("warehouseMsg").textContent=error.message;remove.disabled=false;}
    };row.append(label,remove);$("warehouses").append(row);
  }
  $("grantWarehouses").replaceChildren();
  for(const warehouse of availableWarehouses){
    const label=document.createElement("label"),input=document.createElement("input");label.className="wh-check";input.type="checkbox";input.value=warehouse.code;input.checked=warehouse.code===select.value;
    label.append(input,document.createTextNode(`${warehouse.code} · ${warehouse.name||warehouse.code}`));$("grantWarehouses").append(label);
  }
  if(me.role!=="admin")for(const input of $("role").querySelectorAll("input")){input.disabled=input.value!=="staff";input.checked=input.value==="staff";input.parentElement.hidden=input.disabled;}
  await loadUsers();
}
async function loadAdmins(){
  if(me.role!=="admin")return;
  const result=await call("/api/admin/admins");$("admins").replaceChildren();
  for(const user of result.items){
    const row=document.createElement("li"),label=document.createElement("span"),revoke=document.createElement("button");
    label.textContent=user.email+(user.email===me.email?" · Bạn":"");revoke.type="button";revoke.className="danger";revoke.textContent="Thu hồi Admin Pro";revoke.disabled=result.items.length<=1;
    revoke.onclick=async()=>{
      if(revoke.disabled||!confirm(`Thu hồi Admin Pro của ${user.email}?`))return;
      revoke.disabled=true;
      try{const result=await call("/api/admin/admins",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:user.email,action:"revoke"})});if(result.self_revoked){location.replace("/login/?next=/admin/");return;}await loadAdmins();$("adminMsg").textContent="Đã thu hồi Admin Pro của "+user.email+".";}
      catch(error){$("adminMsg").textContent=error.message;revoke.disabled=false;}
    };row.append(label,revoke);$("admins").append(row);
  }
}
$("adminForm").onsubmit=async event=>{
  event.preventDefault();if(me?.role!=="admin")return;
  const email=$("adminEmail").value.trim().toLowerCase(),action=event.submitter?.value||"grant";
  if(!confirm(action==="transfer"?`Chuyển Admin Pro cho ${email} và thu hồi quyền Admin Pro của bạn?`:`Cấp Admin Pro toàn hệ thống cho ${email}?`))return;
  await submit($("adminForm"),"adminMsg",async()=>{
    $("adminMsg").textContent="Đang cập nhật Admin Pro…";
    const result=await call("/api/admin/admins",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,action})});
    if(result.self_revoked){location.replace("/login/?next=/admin/");return;}
    $("adminEmail").value="";await loadAdmins();$("adminMsg").textContent="Đã cấp Admin Pro cho "+email+".";
  });
};
$("warehouseForm").onsubmit=async event=>{
  event.preventDefault();if(me?.role!=="admin")return;
  await submit($("warehouseForm"),"warehouseMsg",async()=>{
    const code=$("newCode").value.trim().toUpperCase(),name=$("newName").value.trim();
    if(!/^[A-Z0-9_-]{2,24}$/.test(code))throw Error("Mã kho gồm 2–24 ký tự chữ, số, dấu _ hoặc -.");
    if(knownWarehouses.some(warehouse=>warehouse.code===code))throw Error("Mã kho "+code+" đã tồn tại. Chọn mã khác.");
    $("warehouseMsg").textContent="Đang tạo kho…";
    await call("/api/admin/warehouses",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code,name})});
    await loadWarehouses(code);$("warehouse").dispatchEvent(new Event("change"));
    $("newCode").value=$("newName").value="";$("warehouseMsg").textContent="Đã tạo kho "+code+". Kho đã được chọn bên dưới để cấp quyền tài khoản.";
  });
};
$("grant").onsubmit=async event=>{
  event.preventDefault();if(!me)return;
  await submit($("grant"),"grantMsg",async()=>{
    const email=$("email").value.trim().toLowerCase(),warehouses=[...$("grantWarehouses").querySelectorAll("input:checked")].map(input=>input.value),roles=[...$("role").querySelectorAll("input:checked")].map(input=>input.value);
    if(!warehouses.length)throw Error("Chọn ít nhất một kho.");if(!roles.length)throw Error("Chọn ít nhất một quyền.");
    $("grantMsg").textContent="Đang cấp quyền…";
    await call("/api/admin/permissions?warehouse="+encodeURIComponent(warehouses[0]),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,roles,warehouses})});
    $("email").value="";
    $("grantMsg").textContent="Đã cấp quyền cho "+email+" tại "+warehouses.join(", ")+".";
    if(!warehouses.includes($("warehouse").value))$("warehouse").value=warehouses[0];
    await loadUsers().catch(error=>{$("grantMsg").textContent+=" Không tải được danh sách: "+error.message;});
  });
};
$("warehouse").onchange=()=>{syncGrantWarehouse();loadUsers().catch(error=>$("grantMsg").textContent=error.message);};
$("logout").onclick=logout;
try{me=await gate();if(me){$("account").textContent=`Đăng nhập: ${me.email} · ${me.role==="admin"?"Admin Pro":"Quản trị viên kho"}`;if(!me.warehouses?.length&&me.role!=="admin")throw Error("Tài khoản chưa được gán mã kho.");await loadWarehouses();await loadAdmins();}}catch(error){$("msg").textContent=error.message;}


if (me) {
  const openQr = $("stationQrOpen");
  const dialog = $("stationQrDialog");
  const status = $("stationQrStatus");
  const poster = $("stationQrPoster");
  const image = $("stationQrImage");
  const print = $("stationQrPrint");
  let currentRequest;

  openQr.hidden = false;
  $("stationQrClose").onclick = () => dialog.close();
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    currentRequest?.abort();
    currentRequest = null;
  });
  print.onclick = () => {
    if (dialog.open && !print.disabled) window.print();
  };
  openQr.onclick = async () => {
    if (dialog.open) return;
    currentRequest?.abort();
    const station = $("warehouse").value;
    print.disabled = true;
    poster.hidden = true;
    status.textContent = station ? "Đang tải mã QR…" : "Hãy chọn kho để xem mã QR.";
    dialog.showModal();
    if (!station) return;

    const request = new AbortController();
    currentRequest = request;
    const timeout = setTimeout(() => {
      if (currentRequest !== request || !dialog.open) return;
      request.abort();
      status.textContent = "Tải mã QR quá lâu. Hãy đóng và thử lại.";
    }, 12000);
    try {
      const data = await call("/api/admin/station-qr?station=" + encodeURIComponent(station), {
        method: "POST",
        signal: request.signal
      });
      if (currentRequest !== request || request.signal.aborted || !dialog.open) return;
      if (!data.code) throw Error("Kho này chưa có mã QR.");
      const origin = ["localhost", "127.0.0.1"].includes(location.hostname)
        ? "https://ifc-01-handover-pilot.duynguyenspx.workers.dev"
        : location.origin;
      const src = await window.QRCode.toDataURL(origin + "/rider/#" + encodeURIComponent(data.code), {width: 400, margin: 4});
      if (currentRequest !== request || request.signal.aborted || !dialog.open) return;
      image.src = src;
      await image.decode();
      if (currentRequest !== request || request.signal.aborted || !dialog.open) return;
      $("stationQrWarehouse").textContent = "Kho " + station;
      poster.hidden = false;
      print.disabled = false;
      status.textContent = "";
    } catch (error) {
      if (currentRequest === request && !request.signal.aborted && dialog.open) {
        status.textContent = error.message || "Không tải được mã QR.";
      }
    } finally {
      clearTimeout(timeout);
      if (currentRequest === request) currentRequest = null;
    }
  };
}
