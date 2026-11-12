import {SignJWT, importPKCS8} from "jose";

interface DeviceEnv { DB:D1Database; FIREBASE_PROJECT_ID:string; FIREBASE_ADMIN_JSON?:string }
export async function manageDevices(request:Request, env:DeviceEnv, manager:boolean, station:string) {
  const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
  if(!manager)return reply({error:"Bạn không quản lý station này."},403);
  if(!await env.DB.prepare("SELECT code FROM ifc_warehouses WHERE code=? AND active=1").bind(station).first())return reply({error:"Station chưa hoạt động."},400);
  if(request.method==="GET"){
    const rows=await env.DB.prepare("SELECT email,ready FROM ifc_devices WHERE station=? ORDER BY email").bind(station).all();
    return reply({items:rows.results});
  }
  if(request.method!=="POST")return reply({error:"POST required"},405);
  const {action,email,password}=await request.json() as Record<string,string>;
  if(typeof password!=="string"||password.length<12||password.length>128)return reply({error:"Mật khẩu cần từ 12 đến 128 ký tự."},400);
  if(action!=="create"&&action!=="reset")return reply({error:"Thao tác không hợp lệ."},400);
  if(!env.FIREBASE_ADMIN_JSON)return reply({error:"Worker chưa có secret FIREBASE_ADMIN_JSON."},503);
  const key=JSON.parse(env.FIREBASE_ADMIN_JSON);
  if(key.project_id!==env.FIREBASE_PROJECT_ID)return reply({error:"Sai project của service account."},503);
  const assertion=await new SignJWT({scope:"https://www.googleapis.com/auth/identitytoolkit"})
    .setProtectedHeader({alg:"RS256"}).setIssuer(key.client_email).setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt().setExpirationTime("5m").sign(await importPKCS8(key.private_key,"RS256"));
  const auth=await fetch("https://oauth2.googleapis.com/token",{method:"POST",body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
  if(!auth.ok)return reply({error:"Không xác thực được service account."},502);
  const {access_token}=await auth.json() as {access_token:string};
  const api=(method:string,data:unknown)=>fetch("https://identitytoolkit.googleapis.com/v1/"+method,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+access_token},body:JSON.stringify(data)});
  let deviceEmail=email;
  if(action==="create"){
    deviceEmail=station.toLowerCase()+"-"+crypto.randomUUID().slice(0,8)+"@kiosk.ifc.invalid";
    await env.DB.prepare("INSERT INTO ifc_devices(email,station,uid) VALUES(?,?,?)").bind(deviceEmail,station,crypto.randomUUID()).run();
  }
  const device=await env.DB.prepare("SELECT uid,ready FROM ifc_devices WHERE email=? AND station=?").bind(deviceEmail,station).first<{uid:string;ready:number}>();
  if(!device)return reply({error:"Không tìm thấy thiết bị tại station này."},404);
  const project="projects/"+env.FIREBASE_PROJECT_ID;
  if(!device.ready){
    const created=await api("accounts:signUp",{targetProjectId:env.FIREBASE_PROJECT_ID,localId:device.uid,email:deviceEmail,password,emailVerified:true});
    if(!created.ok){
      const lookup=await api(project+"/accounts:lookup",{localId:[device.uid]});
      const existing=await lookup.json() as {users?:{email:string}[]};
      if(!lookup.ok||existing.users?.[0]?.email!==deviceEmail)return reply({error:"Firebase chưa tạo được kiosk. Kiểm tra quyền service account và chính sách mật khẩu, rồi thử lại trên thiết bị này."},502);
    }
  }
  const changed=await api(project+"/accounts:update",{localId:device.uid,password,emailVerified:true});
  if(!changed.ok)return reply({error:"Firebase từ chối cập nhật mật khẩu."},502);
  await env.DB.batch([
    env.DB.prepare("UPDATE ifc_devices SET ready=1 WHERE uid=?").bind(device.uid),
    env.DB.prepare("INSERT OR IGNORE INTO ifc_memberships(email,warehouse,role,created_at_ms,updated_at_ms) VALUES(?,?,'kiosk',?,?)").bind(deviceEmail,station,Date.now(),Date.now())
  ]);
  return reply({email:deviceEmail,station});
}
