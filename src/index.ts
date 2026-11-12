import {manageDevices} from "./devices";
import {createRemoteJWKSet, jwtVerify} from "jose";
interface Env {
  ROOMS: DurableObjectNamespace;
  DB: D1Database;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_ADMIN_JSON?:string;
  ADMIN_EMAIL?: string;
  KIOSK_WAREHOUSE: string;
  ALLOWED_ORIGINS?: string;
  ALLOWED_EMAILS?: string;
  ALLOW_ANY_AUTHENTICATED_USER?: string;
  TURN_URL?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}
type Role = "admin" | "warehouse_admin" | "staff" | "kiosk" | "customer_service";
interface VerifiedUser { uid: string; email: string; role: Role; warehouses: string[]; supportStations:string[]; kioskWarehouse?:string; expiresAt: number; }
interface DocumentRow { doc_id: string; data_json: string; updated_at_ms: number; }
interface CommitOp { type: "set" | "update" | "delete"; collection: string; id: string; data?: Record<string, unknown>; merge?: boolean; }
interface Constraint { type?: string; field?: string; op?: string; value?: unknown; direction?: string; n?: number; }
interface SocketTicket { support?:boolean; uid: string; email: string; warehouses?:string[]; supportStations?:string[]; kioskWarehouse?:string; expiresAt: number; sessionExpiry:number; origin: string; }
interface SocketAttachment { email?: string; warehouses?:string[]; supportStations?:string[]; kioskWarehouse?:string; sessionExpiry?:number; }

class VnwlHttpError extends Error {
  status: number;
  code: string;
  extra?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

let lastResetOperationDay = "";
let activeSlotsSchemaReady = false;
let activeSlotsSchemaPromise: Promise<void> | null = null;
let activeBoxesSchemaReady = false;
let activeBoxesSchemaPromise: Promise<void> | null = null;
let operationalPerfSchemaReady = false;
let operationalPerfSchemaPromise: Promise<void> | null = null;
let activeHoldOrdersSchemaReady = false;
let activeHoldOrdersSchemaPromise: Promise<void> | null = null;

const DAILY_FULL_RESET_HOUR_VN = 6;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ORDER_TRACKING_KEY = "UPPER(COALESCE(NULLIF(TRIM(json_extract(data_json,'$.tracking_no')),''),TRIM(json_extract(data_json,'$.order_code'))))";
function calendarDayVn(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}
// Dữ liệu vận hành có ngày làm việc bắt đầu lúc 06:00 Việt Nam.
// Trước 06:00 vẫn là ca/ngày vận hành trước; từ 06:00 bắt đầu data rỗng của ngày mới.
function todayVn(): string {
  return calendarDayVn(new Date(Date.now() - DAILY_FULL_RESET_HOUR_VN * HOUR_MS));
}
function nextDailyFullResetAtMs(): number {
  const now = Date.now();
  const vnClock = new Date(now + 7 * HOUR_MS); // Việt Nam UTC+7, không DST.
  let resetAt = Date.UTC(vnClock.getUTCFullYear(), vnClock.getUTCMonth(), vnClock.getUTCDate(), DAILY_FULL_RESET_HOUR_VN - 7, 0, 0, 0);
  if (resetAt <= now) resetAt += DAY_MS;
  return resetAt;
}
function dailyFullResetInfo(): Record<string, unknown> {
  const resetAt = nextDailyFullResetAtMs();
  return {
    operation_day_vn: todayVn(),
    daily_full_reset: true,
    daily_full_reset_time_vn: "06:00",
    next_daily_full_reset_at_ms: resetAt,
    seconds_until_daily_full_reset: Math.max(0, Math.floor((resetAt - Date.now()) / 1000))
  };
}
function nowMs(): number { return Date.now(); }
function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}
function cleanText(v: unknown): string { return String(v ?? "").trim(); }
function warehouse(v: unknown): string { const s = cleanText(v || "WH1").toUpperCase(); return /^[A-Z0-9_-]{2,24}$/.test(s) ? s : "WH1"; }
function collectionName(v: unknown): string {
  const s = cleanText(v).replace(/[^A-Za-z0-9_\/-]/g, "").slice(0, 180);
  if (!s) throw new Error("missing_collection");
  return s;
}
function safeId(v: unknown): string {
  const s = cleanText(v).replace(/[\u0000-\u001f]/g, "").slice(0, 240);
  if (!s) throw new Error("missing_document_id");
  return s;
}
function safeOrderId(code: string): string {
  const bytes = new TextEncoder().encode(code);
  return "order_" + Array.from(bytes).map(v => v.toString(16).padStart(2, "0")).join("");
}
function asObject(v: unknown): Record<string, unknown> { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}; }
function readBearer(request: Request): string { const h = request.headers.get("Authorization") || ""; return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : ""; }
function listSet(value?: string): Set<string> { return new Set(cleanText(value).split(",").map(s => s.trim().toLowerCase()).filter(Boolean)); }
function originAllowed(request:Request, _env:Env):boolean {
  const origin=request.headers.get("Origin");
  return !origin || origin===new URL(request.url).origin;
}
function cors(_request:Request,_env:Env):HeadersInit { return {"Cache-Control":"no-store"}; }
const firebaseKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
async function identity(request: Request, env: Env) {
  const token = readBearer(request);
  if (!token) throw new Error("Vui lòng đăng nhập Firebase.");
  const {payload} = await jwtVerify(token, firebaseKeys, {
    algorithms:["RS256"], issuer:"https://securetoken.google.com/"+env.FIREBASE_PROJECT_ID,
    audience:env.FIREBASE_PROJECT_ID, requiredClaims:["sub","exp","iat","auth_time","email"]
  });
  const now = Math.floor(Date.now()/1000);
  if(typeof payload.sub!=="string" || !payload.sub.length || payload.sub.length>128 ||
     typeof payload.iat!=="number" || payload.iat>now+30 || typeof payload.auth_time!=="number" || payload.auth_time>now+30 ||
     payload.email_verified!==true || typeof payload.email!=="string" || !payload.email.trim())
    throw new Error("Email Firebase cần được xác minh trước khi dùng app.");
  return {uid:payload.sub, email:payload.email.trim().toLowerCase(), expiresAt:Number(payload.exp)*1000};
}
async function isAdmin(env:Env,email:string):Promise<boolean>{
  const row=await env.DB.prepare("SELECT active FROM ifc_admins WHERE email=?").bind(email).first<{active:number}>();
  return Number(row?.active)===1;
}
async function roleFor(env:Env,email:string):Promise<Role|null>{
  if(await isAdmin(env,email))return "admin";
  const rows=await env.DB.prepare("SELECT role FROM ifc_memberships WHERE email=? AND warehouse IN (SELECT code FROM ifc_warehouses WHERE active=1) ORDER BY CASE role WHEN 'warehouse_admin' THEN 0 WHEN 'staff' THEN 1 ELSE 2 END LIMIT 1").bind(email).all<{role:string}>();
  const role=rows.results[0]?.role;
  if(role==="warehouse_admin"||role==="staff"||role==="kiosk")return role;
  const legacy=await env.DB.prepare("SELECT role FROM ifc_permissions WHERE email=?").bind(email).first<{role:string}>();
  if(legacy?.role==="staff"||legacy?.role==="kiosk")return legacy.role;
  const cs=await env.DB.prepare("SELECT email FROM ifc_customer_service WHERE email=? LIMIT 1").bind(email).first();
  return cs?"customer_service":null;
}
async function supportStationsFor(env:Env,email:string):Promise<string[]>{
  const rows=await env.DB.prepare("SELECT cs.station FROM ifc_customer_service cs JOIN ifc_warehouses w ON w.code=cs.station WHERE cs.email=? AND w.active=1 ORDER BY cs.station").bind(email).all<{station:string}>();
  return rows.results.map(r=>r.station);
}
async function warehousesFor(env:Env,email:string):Promise<string[]>{
  const rows=await env.DB.prepare("SELECT warehouse FROM ifc_memberships WHERE email=? AND warehouse IN (SELECT code FROM ifc_warehouses WHERE active=1) ORDER BY warehouse").bind(email).all<{warehouse:string}>();
  if(rows.results.length)return rows.results.map(r=>r.warehouse);
  const legacy=await env.DB.prepare("SELECT role FROM ifc_permissions WHERE email=?").bind(email).first<{role:string}>();
  return legacy&&await env.DB.prepare("SELECT code FROM ifc_warehouses WHERE code='WH1' AND active=1").first()?["WH1"]:[];
}
async function membershipRole(env:Env,email:string,wh:string):Promise<Role|null>{
  if(!await env.DB.prepare("SELECT code FROM ifc_warehouses WHERE code=? AND active=1").bind(wh).first())return null;
  if(await isAdmin(env,email))return "admin";
  const row=await env.DB.prepare("SELECT m.role FROM ifc_memberships m JOIN ifc_warehouses w ON w.code=m.warehouse WHERE m.email=? AND m.warehouse=? AND w.active=1").bind(email,wh).first<{role:string}>();
  if(row?.role==="warehouse_admin"||row?.role==="staff"||row?.role==="kiosk")return row.role;
  if(wh==="WH1"){
    const legacy=await env.DB.prepare("SELECT role FROM ifc_permissions WHERE email=?").bind(email).first<{role:string}>();
    if(legacy?.role==="staff"||legacy?.role==="kiosk")return legacy.role;
  }
  return null;
}
async function managePermissions(request:Request,env:Env,user:VerifiedUser):Promise<Response>{
  const url=new URL(request.url),requestedWarehouse=cleanText(url.searchParams.get("warehouse")).toUpperCase();
  const isRoot=user.role==="admin";
  const canManage=requestedWarehouse?(isRoot||(user.warehouses.includes(requestedWarehouse)&&await membershipRole(env,user.email,requestedWarehouse)==="warehouse_admin")):isRoot;
  if(!canManage)return json({ok:false,error:"Bạn không có quyền quản trị kho này."},403);
  if(request.method==="GET"){
    const warehouseRows=isRoot?await env.DB.prepare("SELECT code,name,active FROM ifc_warehouses ORDER BY code").all():{results:[]};
    const rows=requestedWarehouse?await env.DB.prepare("SELECT email,role,warehouse FROM ifc_memberships WHERE warehouse=? UNION ALL SELECT email,'customer_service' AS role,station AS warehouse FROM ifc_customer_service WHERE station=? ORDER BY email").bind(requestedWarehouse,requestedWarehouse).all():await env.DB.prepare("SELECT email,role,warehouse FROM ifc_memberships UNION ALL SELECT email,'customer_service' AS role,station AS warehouse FROM ifc_customer_service ORDER BY warehouse,email").all();
    return json({ok:true,admin:user.email,items:rows.results,warehouses:warehouseRows.results,can_manage_warehouses:isRoot,warehouse:requestedWarehouse||null});
  }
  if(request.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
  const data=asObject(await request.json()),email=cleanText(data.email).toLowerCase();
  const warehouses=Array.from(new Set((Array.isArray(data.warehouses)?data.warehouses:[data.warehouse||requestedWarehouse]).map(x=>cleanText(x).toUpperCase()).filter(Boolean)));
  if(email.endsWith("@kiosk.ifc.invalid"))return json({error:"Hãy quản lý tài khoản thiết bị trong mục Kiosk của station."},400);
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||await isAdmin(env,email))return json({ok:false,error:"Email không hợp lệ hoặc là Admin Pro. Quản lý Admin Pro ở mục quyền toàn hệ thống."},400);
  if(!warehouses.length||warehouses.length>50||warehouses.some(wh=>!/^[-A-Z0-9_]{2,24}$/.test(wh)))return json({ok:false,error:"Chọn từ 1 đến 50 mã kho hợp lệ."},400);
  if(!isRoot){
    const staffGrant=Array.isArray(data.roles)
      ? data.roles.length===1 && data.roles[0]==="staff"
      : data.role==="staff";
    const staffRevoke=!Array.isArray(data.roles)&&data.role==="revoke"&&(!data.target_role||data.target_role==="staff");
    if(!staffGrant&&!staffRevoke)return json({error:"Admin station chỉ được quản lý quyền Nhân viên."},403);
    if(staffGrant)data.roles=["staff"];
  }
  const access = !isRoot || data.role!=="revoke" || Array.isArray(data.roles)
    ? (await env.DB.prepare(`SELECT w.code,w.active,manager.role AS manager_role,
        COALESCE(target.role,CASE WHEN w.code='WH1' THEN (SELECT role FROM ifc_permissions WHERE email=?) END) AS target_role
        FROM ifc_warehouses w
        LEFT JOIN ifc_memberships manager ON manager.warehouse=w.code AND manager.email=?
        LEFT JOIN ifc_memberships target ON target.warehouse=w.code AND target.email=?
        WHERE w.code IN (SELECT value FROM json_each(?))`)
      .bind(email,user.email,email,JSON.stringify(warehouses)).all<{code:string;active:number;manager_role:string|null;target_role:string|null}>()).results
    : [];
  const byCode = new Map(access.map(row=>[row.code,row]));
  if(!isRoot){
    for(const wh of warehouses){
      const entry=byCode.get(wh);
      if(!entry?.active||entry.manager_role!=="warehouse_admin")return json({error:"Bạn không quản lý station "+wh},403);
      if(entry.target_role&&entry.target_role!=="staff")return json({error:"Tài khoản tại station này không phải nhân viên."},403);
    }
  }
  if(Array.isArray(data.roles)){
    const roles=new Set(data.roles);
    if(!roles.size||[...roles].some(role=>!["staff","warehouse_admin","customer_service"].includes(String(role))))return json({error:"Chức năng không hợp lệ."},400);
    const grants:D1PreparedStatement[]=[];
    const now=nowMs();
    for(const wh of warehouses){
      const entry=byCode.get(wh);
      if(!entry?.active)return json({error:"Kho chưa hoạt động: "+wh},400);
      if(entry.target_role==="kiosk")return json({error:"Tài khoản thiết bị không dùng làm tài khoản nhân viên."},400);
      if(roles.has("warehouse_admin")||roles.has("staff")){
        const role=roles.has("warehouse_admin")?"warehouse_admin":"staff";
        grants.push(env.DB.prepare("INSERT INTO ifc_memberships(email,warehouse,role,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?) ON CONFLICT(email,warehouse) DO UPDATE SET role=CASE WHEN ifc_memberships.role='warehouse_admin' THEN 'warehouse_admin' ELSE excluded.role END,updated_at_ms=excluded.updated_at_ms").bind(email,wh,role,now,now));
      }
      if(roles.has("customer_service"))grants.push(env.DB.prepare("INSERT OR IGNORE INTO ifc_customer_service(email,station,created_at_ms) VALUES(?,?,?)").bind(email,wh,now));
    }
    await env.DB.batch(grants);
    return json({ok:true,warehouses});
  }
  const statements:D1PreparedStatement[]=[];
  const targetRole=cleanText(data.target_role);
  if(data.role==="revoke"){
    for(const wh of warehouses){if(targetRole==="customer_service")statements.push(env.DB.prepare("DELETE FROM ifc_customer_service WHERE email=? AND station=?").bind(email,wh));else {statements.push(env.DB.prepare("DELETE FROM ifc_memberships WHERE email=? AND warehouse=?"+(isRoot?"":" AND role='staff'")).bind(email,wh));if(wh==="WH1")statements.push(env.DB.prepare("DELETE FROM ifc_permissions WHERE email=?"+(isRoot?"":" AND role='staff'")).bind(email));}}
  }else if(data.role==="customer_service"){
    for(const wh of warehouses)if(!byCode.get(wh)?.active)return json({ok:false,error:`Mã kho ${wh} chưa tồn tại hoặc đang tạm khóa.`},400);
    const now=nowMs();for(const wh of warehouses)statements.push(env.DB.prepare("INSERT INTO ifc_customer_service(email,station,created_at_ms) VALUES(?,?,?) ON CONFLICT(email,station) DO NOTHING").bind(email,wh,now));
  }else if(data.role==="warehouse_admin"||data.role==="staff"||data.role==="kiosk"){
    for(const wh of warehouses)if(!byCode.get(wh)?.active)return json({ok:false,error:`Mã kho ${wh} chưa tồn tại hoặc đang tạm khóa.`},400);
    const now=nowMs();
    for(const wh of warehouses)statements.push(env.DB.prepare("INSERT INTO ifc_memberships(email,warehouse,role,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?) ON CONFLICT(email,warehouse) DO UPDATE SET role=excluded.role,updated_at_ms=excluded.updated_at_ms").bind(email,wh,data.role,now,now));
    statements.push(env.DB.prepare("DELETE FROM ifc_permissions WHERE email=?").bind(email));
  }else return json({ok:false,error:"Vai trò không hợp lệ."},400);
  if(statements.length)await env.DB.batch(statements);
  return json({ok:true,warehouses});
}
async function manageAdmins(request:Request,env:Env,user:VerifiedUser):Promise<Response>{
  if(user.role!=="admin")return json({error:"Chỉ Admin Pro được quản lý quyền toàn hệ thống."},403);
  if(request.method==="GET")return json({items:(await env.DB.prepare("SELECT email,created_at_ms FROM ifc_admins WHERE active=1 ORDER BY email").all()).results});
  if(request.method!=="POST")return json({error:"Method not allowed"},405);
  const data=asObject(await request.json()),email=cleanText(data.email).toLowerCase(),action=cleanText(data.action);
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.endsWith("@kiosk.ifc.invalid"))return json({error:"Email tài khoản không hợp lệ."},400);
  if(!["grant","revoke","transfer"].includes(action))return json({error:"Thao tác không hợp lệ."},400);
  if(action==="revoke"){
    const result=await env.DB.prepare("UPDATE ifc_admins SET active=0 WHERE email=? AND active=1 AND EXISTS(SELECT 1 FROM ifc_admins WHERE active=1 AND email<>?)").bind(email,email).run();
    if(!Number(result.meta.changes))return json({error:"Không thể thu hồi Admin Pro cuối cùng hoặc tài khoản không còn quyền."},409);
    return json({ok:true,self_revoked:email===user.email});
  }
  if(action==="transfer"&&email===user.email)return json({error:"Chọn email khác để chuyển quyền."},400);
  const grants=[env.DB.prepare("INSERT INTO ifc_admins(email,active,created_at_ms,created_by) VALUES(?,1,?,?) ON CONFLICT(email) DO UPDATE SET active=1,created_at_ms=excluded.created_at_ms,created_by=excluded.created_by").bind(email,nowMs(),user.email)];
  if(action==="transfer")grants.push(env.DB.prepare("UPDATE ifc_admins SET active=0 WHERE email=?").bind(user.email));
  await env.DB.batch(grants);
  return json({ok:true,self_revoked:action==="transfer"});
}
async function manageWarehouses(request:Request,env:Env,user:VerifiedUser):Promise<Response>{
  if(user.role!=="admin")return json({ok:false,error:"Chỉ Admin Pro được quản lý mã kho."},403);
  if(request.method==="GET")return json({ok:true,items:(await env.DB.prepare("SELECT code,name,active FROM ifc_warehouses ORDER BY code").all()).results});
  if(request.method==="DELETE"){
    const code=cleanText(new URL(request.url).searchParams.get("warehouse")).toUpperCase();
    if(!/^[A-Z0-9_-]{2,24}$/.test(code))return json({error:"Mã kho không hợp lệ."},400);
    const existing=await env.DB.prepare("SELECT active FROM ifc_warehouses WHERE code=?").bind(code).first<{active:number}>();
    if(!existing)return json({error:"Kho không tồn tại."},404);
    if(!Number(existing.active))return json({ok:true});
    try{
      await env.DB.batch([
        env.DB.prepare("UPDATE ifc_warehouses SET active=0 WHERE code=? AND active=1 AND NOT EXISTS(SELECT 1 FROM active_slots_d0 WHERE warehouse=?) AND NOT EXISTS(SELECT 1 FROM active_boxes_d0 WHERE warehouse=?) AND NOT EXISTS(SELECT 1 FROM active_hold_orders_d0 WHERE warehouse=?) AND NOT EXISTS(SELECT 1 FROM ifc_support_calls WHERE station=? AND status IN ('waiting','accepted','held') AND created_at_ms>?)").bind(code,code,code,code,code,nowMs()-3600000),
        env.DB.prepare("INSERT OR REPLACE INTO pilot_guard VALUES(1,changes())"),
        env.DB.prepare("DELETE FROM ifc_memberships WHERE warehouse=?").bind(code),
        env.DB.prepare("DELETE FROM ifc_customer_service WHERE station=?").bind(code),
        env.DB.prepare("DELETE FROM ifc_permissions WHERE ?='WH1'").bind(code)
      ]);
    }catch(error){
      if(/CHECK constraint|pilot_guard/i.test(String(error)))return json({error:"Kho còn đơn hàng hoặc cuộc gọi đang xử lý. Hoàn tất trước khi xóa kho."},409);
      throw error;
    }
    return json({ok:true,history_preserved:true});
  }
  if(request.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
  const data=asObject(await request.json()),code=cleanText(data.code).toUpperCase(),name=cleanText(data.name)||code;
  if(!/^[A-Z0-9_-]{2,24}$/.test(code)||name.length>80)return json({ok:false,error:"Mã kho 2–24 ký tự A-Z, số, _ hoặc -; tên tối đa 80 ký tự."},400);
  if(data.active===false){
    const assigned=await env.DB.prepare("SELECT (SELECT COUNT(*) FROM ifc_memberships WHERE warehouse=?)+(SELECT COUNT(*) FROM ifc_customer_service WHERE station=?) AS n").bind(code,code).first<{n:number}>();
    if(Number(assigned?.n||0)>0)return json({ok:false,error:"Hãy thu hồi tài khoản đang gán cho kho trước khi tạm khóa."},409);
    await env.DB.prepare("UPDATE ifc_warehouses SET active=0 WHERE code=?").bind(code).run();
    return json({ok:true});
  }
  await env.DB.prepare("INSERT INTO ifc_warehouses(code,name,active,created_at_ms) VALUES(?,?,1,?) ON CONFLICT(code) DO UPDATE SET name=excluded.name,active=1").bind(code,name,nowMs()).run();
  return json({ok:true});
}
async function supportEvent(env:Env,event:Record<string,unknown>):Promise<Record<string,unknown>>{
  const r=await room(env).fetch("https://room.internal/support-event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(event)});
  return asObject(await r.json().catch(()=>({})));
}
function turnConfigured(env:Env){
  return Boolean((env.TURN_KEY_ID&&env.TURN_KEY_API_TOKEN)||(env.TURN_URL&&env.TURN_USERNAME&&env.TURN_CREDENTIAL));
}
const turnIceCache=new Map<string,{expiresAt:number;servers:Promise<Record<string,unknown>[]>}>();
async function guestIce(env:Env,scope:string){
  const servers:Record<string,unknown>[]=[{urls:"stun:stun.l.google.com:19302"}];
  if(env.TURN_KEY_ID&&env.TURN_KEY_API_TOKEN){
    const cacheKey=env.TURN_KEY_ID+":"+scope,cached=turnIceCache.get(cacheKey);
    if(cached&&cached.expiresAt>Date.now())return cached.servers;
    const pending=(async()=>{
      const response=await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID!)}/credentials/generate-ice-servers`,{
        method:"POST",headers:{Authorization:"Bearer "+env.TURN_KEY_API_TOKEN,"Content-Type":"application/json"},
        body:JSON.stringify({ttl:7200}),signal:AbortSignal.timeout(7000)
      });
      if(!response.ok)throw Error("TURN credential request failed");
      const data=asObject(await response.json()),ice=data.iceServers;
      if(!Array.isArray(ice)||!ice.length||ice.length>16)throw Error("Invalid TURN response");
      let hasTurn=false;
      const validated:Record<string,unknown>[]=[];
      for(const server of ice){
        const item=asObject(server),urls=typeof item.urls==="string"?[item.urls]:item.urls;
        if(!Array.isArray(urls)||!urls.length||urls.length>16||!urls.every(u=>typeof u==="string"&&u.length<512&&/^(stun|stuns|turn|turns):[^\s]+$/.test(u)))throw Error("Invalid ICE URLs");
        const relay=urls.some(u=>/^turns?:/.test(u));
        if(relay){
          if(typeof item.username!=="string"||!item.username||typeof item.credential!=="string"||!item.credential)throw Error("Missing TURN credentials");
          hasTurn=true;
        }
        validated.push({urls:item.urls,...(relay?{username:item.username,credential:item.credential}:{})});
      }
      if(!hasTurn)throw Error("Missing TURN relay");
      return validated;
    })().catch(()=>{
      if(turnIceCache.get(cacheKey)?.servers===pending)turnIceCache.delete(cacheKey);
      throw new VnwlHttpError(503,"TURN_UNAVAILABLE","Chưa lấy được kết nối TURN. Vui lòng thử lại cuộc gọi sau ít phút.");
    });
    // Signal polling reuses credentials briefly; each call participant has its own cache entry.
    if(turnIceCache.size>=256)turnIceCache.delete(turnIceCache.keys().next().value!);
    turnIceCache.set(cacheKey,{expiresAt:Date.now()+300000,servers:pending});
    return pending;
  }
  if(env.TURN_URL&&env.TURN_USERNAME&&env.TURN_CREDENTIAL)servers.push({urls:env.TURN_URL,username:env.TURN_USERNAME,credential:env.TURN_CREDENTIAL});
  return servers;
}
async function guestSignals(env:Env,id:string,sender:"rider"|"agent",data:Record<string,unknown>){
  const messages=data.messages===undefined?(Object.keys(asObject(data.message)).length?[data]:[]):data.messages;
  if(!Array.isArray(messages)||messages.length>20||JSON.stringify(messages).length>100000)
    return json({error:"Tín hiệu cuộc gọi không hợp lệ."},400);
  const inserts=[];
  for(const entry of messages){
    const item=asObject(entry),message=asObject(item.message);
    const kind=cleanText(message.kind),messageId=cleanText(item.message_id);
    const kinds = sender === "agent" ? ["offer", "ice", "screen-request", "screen-seen"] : ["answer", "ice", "screen", "screen-capable"];
    const shareId = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
    const invalidControl = (["screen","screen-capable"].includes(kind) && typeof message.value !== "boolean")
      || (kind === "screen-request" && message.value !== true)
      || (kind === "screen-seen" && !shareId.test(String(message.value)))
      || (message.share_id !== undefined && !shareId.test(String(message.share_id)));
    if(!kinds.includes(kind)||invalidControl||!messageId||messageId.length>80||JSON.stringify(message).length>100000)
      return json({error:"Tín hiệu cuộc gọi không hợp lệ."},400);
    inserts.push(env.DB.prepare("INSERT OR IGNORE INTO ifc_guest_signals(call_id,sender,message_id,payload) VALUES(?,?,?,?)").bind(id,sender,messageId,JSON.stringify(message)));
  }
  if(inserts.length){
    const count=await env.DB.prepare("SELECT count(*) AS n FROM ifc_guest_signals WHERE call_id=?").bind(id).first<{n:number}>();
    if(Number(count?.n)+inserts.length>1000)return json({error:"Vượt giới hạn tín hiệu. Hãy kết thúc và gọi lại."},429);
    await env.DB.batch(inserts);
  }
  const since=Math.max(0,Number(data.since)||0);
  const rows=await env.DB.prepare("SELECT seq,payload FROM ifc_guest_signals WHERE call_id=? AND sender<>? AND seq>? ORDER BY seq LIMIT 100").bind(id,sender,since).all<{seq:number;payload:string}>();
  try{
    return json({items:rows.results.map(r=>({seq:r.seq,message:JSON.parse(r.payload)})),...(data.need_ice===false?{}:{iceServers:await guestIce(env,id+":"+sender)})});
  }catch(e){
    if(e instanceof VnwlHttpError)return json({error:e.message,code:e.code},e.status);
    throw e;
  }
}
async function supportApi(request:Request,env:Env,user:VerifiedUser,ctx:ExecutionContext):Promise<Response>{
  const url=new URL(request.url),path=url.pathname;
  const allowedAt=async(station:string)=>user.supportStations.includes(station);
  if(path==="/api/support/duty"){
    if(!user.supportStations.length)return json({error:"Chưa có quyền Customer Service."},403);
    if(request.method==="POST"){
      const {active}=asObject(await request.json());
      if(typeof active!=="boolean")return json({error:"Trạng thái không hợp lệ."},400);
      await env.DB.prepare("INSERT INTO ifc_desk_duty VALUES(?,?) ON CONFLICT(email) DO UPDATE SET active=excluded.active").bind(user.email,active?1:0).run();
      return json({active});
    }
    if(request.method!=="GET")return json({error:"Method not allowed"},405);
    const duty=await env.DB.prepare("SELECT active FROM ifc_desk_duty WHERE email=?").bind(user.email).first<{active:number}>();
    return json({active:duty?.active===1});
  }
  if(path==="/api/support/guest-signals"&&request.method==="POST"){
    const body=asObject(await request.json()),id=cleanText(body.call_id);
    const row=await env.DB.prepare("SELECT station,kiosk_email,accepted_by,status,created_at_ms FROM ifc_support_calls WHERE id=?").bind(id).first<{station:string;kiosk_email:string;accepted_by:string;status:string;created_at_ms:number}>();
    if(!row||!row.kiosk_email.startsWith("qr:")||row.accepted_by!==user.email||!user.supportStations.includes(row.station))return json({error:"Bạn không phụ trách cuộc gọi này."},403);
    if(!["accepted","held"].includes(row.status)||row.created_at_ms<Date.now()-3600000)return json({error:"Cuộc gọi đã kết thúc hoặc hết hạn."},410);
    return guestSignals(env,id,"agent",body);
  }
  if(["/api/support/meeting","/api/support/register"].includes(path)&&request.method==="POST"){
    const body=asObject(await request.json()),id=cleanText(body.call_id);
    const row=await env.DB.prepare("SELECT station,accepted_by,status FROM ifc_support_calls WHERE id=?").bind(id).first<{station:string;accepted_by:string;status:string}>();
    if(!row||!["accepted","held"].includes(row.status)||row.accepted_by!==user.email||!user.supportStations.includes(row.station))
      return json({error:"Chỉ lễ tân đang nhận cuộc gọi tại station này được thao tác."},403);
    if(path.endsWith("/meeting")){
      const link=cleanText(body.url);
      if(!/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(link))return json({error:"Nhập link Google Meet riêng vừa tạo cho cuộc gọi này."},400);
      const saved=await env.DB.prepare("INSERT OR IGNORE INTO ifc_mobile_meetings VALUES(?,?)").bind(id,link).run();
      if(!saved.meta.changes)return json({error:"Phòng đã được gắn. Mỗi lượt cần một phòng riêng."},409);
      return json({ok:true});
    }
    await ensureActiveHoldOrdersSchema(env);
    return pilotApi("/api/kiosk/register",{driver_name:body.driver_name,codes:body.codes,request_id:id},env,ctx,user,row.station);
  }
  if(path==="/api/support/ice"&&request.method==="GET"){
    const station=cleanText(url.searchParams.get("station")).toUpperCase();
    if(user.role==="kiosk"?station!==user.kioskWarehouse:!await allowedAt(station))return json({ok:false,error:"Bạn chưa được cấp Customer Service cho station này."},403);
    const iceServers=await guestIce(env,"kiosk:"+station+":"+user.uid);
    return json({ok:true,iceServers,turn_enabled:iceServers.some(s=>[s.urls].flat().some(u=>typeof u==="string"&&/^turns?:/.test(u)))});
  }
  if(path==="/api/support/call"&&request.method==="POST"){
    if(user.role!=="kiosk"||!user.kioskWarehouse)return json({ok:false,error:"Chỉ tài khoản kiosk được gọi hỗ trợ từ quầy."},403);
    const body=asObject(await request.json().catch(()=>({}))),station=user.kioskWarehouse;
    const warehouseRow=await env.DB.prepare("SELECT code FROM ifc_warehouses WHERE code=? AND active=1").bind(station).first();
    if(!warehouseRow)return json({ok:false,error:"Station này đang tạm khóa."},403);
    const pending=await env.DB.prepare("SELECT id,status FROM ifc_support_calls WHERE kiosk_email=? AND status IN ('waiting','accepted') ORDER BY created_at_ms DESC LIMIT 1").bind(user.email).first<{id:string;status:string}>();
    if(pending)return json({ok:true,call_id:pending.id,status:pending.status,already_open:true});
    const id=crypto.randomUUID(),time=nowMs();
    await env.DB.prepare("INSERT INTO ifc_support_calls(id,station,kiosk_email,rider_name,issue,status,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,'waiting',?,?)").bind(id,station,user.email,cleanText(body.rider_name).slice(0,80),cleanText(body.issue).slice(0,400),time,time).run();
    const delivery=await supportEvent(env,{type:"support_call",call_id:id,station,rider_name:cleanText(body.rider_name).slice(0,80),issue:cleanText(body.issue).slice(0,400),video_mode:"kiosk",created_at_ms:time});
    return json({ok:true,call_id:id,status:"waiting",online_recipients:Number(delivery.recipients||0)});
  }
  if(path==="/api/support/inbox"&&request.method==="GET"){
    const station=cleanText(url.searchParams.get("station")).toUpperCase();
    if(!station||!await allowedAt(station))return json({ok:false,error:"Bạn chưa được cấp Customer Service cho station này."},403);
    const rows=await env.DB.prepare("SELECT id AS call_id,(SELECT number FROM ifc_help_queue WHERE call_id=ifc_support_calls.id) AS queue_no,station,rider_name,issue,CASE WHEN kiosk_email LIKE 'qr:%' THEN 'ifc_guest' ELSE 'kiosk' END AS video_mode,status,accepted_by,created_at_ms,accepted_at_ms FROM ifc_support_calls WHERE station=? AND status IN ('waiting','accepted','held') AND (kiosk_email NOT LIKE 'qr:%' OR created_at_ms>?) ORDER BY (accepted_by=? AND status='accepted') DESC,(accepted_by=? AND status='held') DESC,created_at_ms ASC LIMIT 30").bind(station,Date.now()-HOUR_MS,user.email,user.email).all();
    return json({ok:true,items:rows.results});
  }
  if(path==="/api/support/status"&&request.method==="GET"){
    const id=cleanText(url.searchParams.get("call_id"));
    const row=await env.DB.prepare("SELECT id AS call_id,station,kiosk_email,rider_name,issue,status,accepted_by,created_at_ms,accepted_at_ms,resolved_at_ms FROM ifc_support_calls WHERE id=?").bind(id).first<Record<string,unknown>>();
    if(!row)return json({ok:false,error:"Cuộc gọi không tồn tại."},404);
    if(user.role==="kiosk"?row.kiosk_email!==user.email:!await allowedAt(cleanText(row.station)))return json({ok:false,error:"Bạn không có quyền xem cuộc gọi này."},403);
    const {kiosk_email,...safe}=row;const meeting=["accepted","held"].includes(cleanText(row.status))?await env.DB.prepare("SELECT meeting_url FROM ifc_mobile_meetings WHERE call_id=?").bind(id).first<{meeting_url:string}>():null;
    return json({ok:true,...safe,meeting_url:meeting?.meeting_url});
  }
  if(path==="/api/support/accept"&&request.method==="POST"){
    const body=asObject(await request.json().catch(()=>({}))),id=cleanText(body.call_id);
    const row=await env.DB.prepare("SELECT id,station,kiosk_email,status FROM ifc_support_calls WHERE id=?").bind(id).first<{id:string;station:string;kiosk_email:string;status:string}>();
    if(!row)return json({ok:false,error:"Cuộc gọi không tồn tại."},404);
    if(!await allowedAt(row.station))return json({ok:false,error:"Bạn chưa được cấp Customer Service cho station này."},403);
    const time=nowMs();
    // QR signaling expires after an hour; release the same calls' acceptance locks atomically.
    const [,result]=await env.DB.batch([
      env.DB.prepare("UPDATE ifc_support_calls SET status='cancelled',resolved_at_ms=?,updated_at_ms=? WHERE kiosk_email LIKE 'qr:%' AND created_at_ms<=? AND status IN ('waiting','accepted','held') AND (accepted_by=? OR id=?)").bind(time,time,time-HOUR_MS,user.email,id),
      env.DB.prepare("UPDATE ifc_support_calls SET status='accepted',accepted_by=?,accepted_at_ms=?,updated_at_ms=? WHERE id=? AND status='waiting' AND EXISTS(SELECT 1 FROM ifc_desk_duty WHERE email=? AND active=1) AND NOT EXISTS(SELECT 1 FROM ifc_support_calls WHERE accepted_by=? AND status='accepted')").bind(user.email,time,time,id,user.email,user.email)
    ]);
    if(!Number(result.meta?.changes||0)){
      const current=await env.DB.prepare("SELECT status,accepted_by FROM ifc_support_calls WHERE id=?").bind(id).first<{status:string;accepted_by:string}>();
      if(current?.status!=="accepted"||current.accepted_by!==user.email){
        if(["accepted","held"].includes(cleanText(current?.status)))return json({ok:false,code:"SUPPORT_CALL_TAKEN",accepted_by:current?.accepted_by,call_status:current?.status,error:`${current?.accepted_by||"Đồng nghiệp"} đã nhận lượt này. Bạn có thể nhận lượt khác đang chờ.`},409);
        if(current?.status!=="waiting")return json({ok:false,code:"SUPPORT_CALL_UNAVAILABLE",error:"Lượt đã được nhận, kết thúc hoặc hết hạn. Danh sách đã được cập nhật."},["accepted","held"].includes(cleanText(current?.status))?409:410);
        const duty=await env.DB.prepare("SELECT active FROM ifc_desk_duty WHERE email=?").bind(user.email).first<{active:number}>();
        if(duty?.active!==1)return json({ok:false,code:"SUPPORT_OFF_DUTY",error:"Bạn đang tạm ngưng. Bật Đang trực để nhận cuộc gọi."},409);
        const active=await env.DB.prepare("SELECT id,station FROM ifc_support_calls WHERE accepted_by=? AND status='accepted' LIMIT 1").bind(user.email).first<{id:string;station:string}>();
        return json({ok:false,code:"ACTIVE_SUPPORT_CALL",active_call_id:active?.id,error:`Bạn đang xử lý một cuộc gọi tại ${active?.station||"station khác"}. Hãy tạm giữ cuộc gọi hiện tại hoặc kết thúc trước khi nhận lượt mới.`},409);
      }
    }else{
      await supportEvent(env,{type:"support_accepted",call_id:id,station:row.station,kiosk_email:row.kiosk_email,accepted_by:user.email,accepted_at_ms:time});
    }
    return json({ok:true,call_id:id,station:row.station,kiosk_email:row.kiosk_email,status:"accepted",video_mode:row.kiosk_email.startsWith("qr:")?"ifc_guest":"kiosk"});
  }
  if(path==="/api/support/hold"&&request.method==="POST"){
    const body=asObject(await request.json().catch(()=>({}))),id=cleanText(body.call_id);
    const row=await env.DB.prepare("SELECT id,station,kiosk_email,status,accepted_by FROM ifc_support_calls WHERE id=?").bind(id).first<{id:string;station:string;kiosk_email:string;status:string;accepted_by:string}>();
    if(!row)return json({ok:false,error:"Cuộc gọi không tồn tại."},404);
    if(!await allowedAt(row.station))return json({error:"Bạn không phụ trách kho này."},403);
    if(row.status==="held"&&row.accepted_by===user.email)return json({ok:true,status:"held",call_id:id});
    if(row.accepted_by!==user.email||row.status!=="accepted")return json({ok:false,error:"Chỉ cuộc gọi đang xử lý mới có thể tạm giữ."},400);
    const time=nowMs();
    await env.DB.prepare("UPDATE ifc_support_calls SET status='held',updated_at_ms=? WHERE id=? AND accepted_by=? AND status='accepted'").bind(time,id,user.email).run();
    await supportEvent(env,{type:"support_held",call_id:id,station:row.station,kiosk_email:row.kiosk_email,accepted_by:user.email});
    return json({ok:true,status:"held",call_id:id});
  }
  if(path==="/api/support/resume"&&request.method==="POST"){
    const body=asObject(await request.json().catch(()=>({}))),id=cleanText(body.call_id);
    const row=await env.DB.prepare("SELECT id,station,kiosk_email,status,accepted_by FROM ifc_support_calls WHERE id=?").bind(id).first<{id:string;station:string;kiosk_email:string;status:string;accepted_by:string}>();
    if(!row)return json({ok:false,error:"Cuộc gọi không tồn tại."},404);
    if(!await allowedAt(row.station)||row.accepted_by!==user.email)return json({error:"Chỉ người đang phụ trách mới được tiếp tục cuộc gọi."},403);
    if(row.status==="accepted")return json({ok:true,status:"accepted",call_id:id});
    if(row.status!=="held")return json({error:"Cuộc gọi không còn được tạm giữ."},409);
    const time=nowMs();
    try{
      await env.DB.batch([
        env.DB.prepare("UPDATE ifc_support_calls SET status='accepted',updated_at_ms=? WHERE id=? AND accepted_by=? AND status='held'").bind(time,id,user.email),
        env.DB.prepare("INSERT OR REPLACE INTO pilot_guard VALUES(1,changes())"),
        env.DB.prepare("UPDATE ifc_support_calls SET status='held',updated_at_ms=? WHERE accepted_by=? AND status='accepted' AND id<>?").bind(time,user.email,id)
      ]);
    }catch(error){
      if(/CHECK constraint|pilot_guard/i.test(String(error)))return json({error:"Trạng thái cuộc gọi vừa thay đổi. Hãy tải lại danh sách."},409);
      throw error;
    }
    await supportEvent(env,{type:"support_accepted",call_id:id,station:row.station,kiosk_email:row.kiosk_email,accepted_by:user.email,accepted_at_ms:time});
    return json({ok:true,status:"accepted",call_id:id});
  }
  if(["/api/support/resolve","/api/support/cancel"].includes(path)&&request.method==="POST"){
    const body=asObject(await request.json().catch(()=>({}))),id=cleanText(body.call_id),row=await env.DB.prepare("SELECT id,station,kiosk_email,status,accepted_by FROM ifc_support_calls WHERE id=?").bind(id).first<{id:string;station:string;kiosk_email:string;status:string;accepted_by:string}>();
    if(!row)return json({ok:false,error:"Cuộc gọi không tồn tại."},404);
    const kiosk=path.endsWith("/cancel")&&user.role==="kiosk"&&row.kiosk_email===user.email;
    if(!kiosk&&!await allowedAt(row.station))return json({ok:false,error:"Bạn không có quyền kết thúc cuộc gọi này."},403);
    if(!kiosk&&row.accepted_by!==user.email)return json({ok:false,code:"SUPPORT_CALL_NOT_OWNER",error:"Chỉ người đang phụ trách được kết thúc cuộc gọi này."},403);
    if(!["waiting","accepted","held"].includes(row.status))return json({ok:true,status:row.status});
    const status=path.endsWith("/cancel")?"cancelled":"resolved",time=nowMs();
    await env.DB.prepare("UPDATE ifc_support_calls SET status=?,resolved_at_ms=?,updated_at_ms=? WHERE id=? AND status IN ('waiting','accepted','held')").bind(status,time,time,id).run();
    await supportEvent(env,{type:"support_ended",call_id:id,station:row.station,kiosk_email:row.kiosk_email,accepted_by:row.accepted_by,status,resolved_at_ms:time});
    return json({ok:true,status});
  }
  return json({ok:false,error:"support_endpoint_not_found"},404);
}
function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    const data = value as Record<string, unknown>;
    if (data.__serverTimestamp === true) return new Date().toISOString();
    const out: Record<string, unknown> = {};
    Object.entries(data).forEach(([k,v]) => { out[k] = normalizeValue(v); });
    return out;
  }
  return value;
}
function dataFromRow(row?: DocumentRow | null): Record<string,unknown> | null {
  if (!row) return null;
  try { return { ...asObject(JSON.parse(row.data_json)), id: row.doc_id }; } catch { return { id: row.doc_id }; }
}
async function ensureActiveSlotsSchema(env: Env): Promise<void> {
  if (activeSlotsSchemaReady) return;
  if (!activeSlotsSchemaPromise) {
    activeSlotsSchemaPromise = (async () => {
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS active_slots_d0 (
          work_day TEXT NOT NULL,
          warehouse TEXT NOT NULL,
          location TEXT NOT NULL,
          sub_no INTEGER NOT NULL CHECK(sub_no >= 1 AND sub_no <= 40),
          order_id TEXT NOT NULL,
          updated_at_ms INTEGER NOT NULL,
          PRIMARY KEY(work_day, warehouse, location, sub_no)
        )`),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_active_slots_d0_order ON active_slots_d0(work_day, warehouse, order_id)")
      ]);

      // Backfill đúng một lần/ngày để các đơn active đã có trước khi nâng cấp vẫn giữ slot.
      // Marker nằm trong D1, do đó các isolate Worker khác không quét lặp lại sau lần đầu.
      const day = todayVn();
      const markerKey = "schema:active_slots:v151:backfill";
      const marker = await env.DB.prepare("SELECT value FROM daily_counters_d0 WHERE work_day=? AND counter_key=? LIMIT 1")
        .bind(day, markerKey).first<{ value: number }>();
      if (!marker) {
        await env.DB.prepare(`INSERT OR IGNORE INTO active_slots_d0(work_day, warehouse, location, sub_no, order_id, updated_at_ms)
          SELECT
            work_day,
            UPPER(COALESCE(json_extract(data_json, '$.warehouse_code'), REPLACE(collection_path, 'orders_v280_', ''), 'WH1')),
            UPPER(COALESCE(json_extract(data_json, '$.location_base'), json_extract(data_json, '$.location'), json_extract(data_json, '$.location_code'))),
            CAST(COALESCE(json_extract(data_json, '$.sub_code'), json_extract(data_json, '$.sub')) AS INTEGER),
            doc_id,
            updated_at_ms
          FROM docs_d0
          WHERE work_day=?
            AND collection_path LIKE 'orders_v280_%'
            AND UPPER(COALESCE(json_extract(data_json, '$.status'), json_extract(data_json, '$.queue_status'), json_extract(data_json, '$.order_status'), 'NO_RIDER'))
              IN ('NO_RIDER','HOLD','PICKED','PROCESSING')
            AND CAST(COALESCE(json_extract(data_json, '$.sub_code'), json_extract(data_json, '$.sub')) AS INTEGER) BETWEEN 1 AND 40
            AND LENGTH(TRIM(COALESCE(json_extract(data_json, '$.location_base'), json_extract(data_json, '$.location'), json_extract(data_json, '$.location_code'), ''))) > 0
          ORDER BY updated_at_ms DESC`).bind(day).run();
        await env.DB.prepare("INSERT OR REPLACE INTO daily_counters_d0(work_day,counter_key,value,updated_at_ms) VALUES(?,?,1,?)")
          .bind(day, markerKey, nowMs()).run();
      }
      activeSlotsSchemaReady = true;
    })().catch((error) => {
      activeSlotsSchemaPromise = null;
      throw error;
    });
  }
  await activeSlotsSchemaPromise;
}

async function ensureActiveBoxesSchema(env: Env): Promise<void> {
  if (activeBoxesSchemaReady) return;
  if (!activeBoxesSchemaPromise) {
    activeBoxesSchemaPromise = (async () => {
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS active_boxes_d0 (
          work_day TEXT NOT NULL,
          warehouse TEXT NOT NULL,
          box_code TEXT NOT NULL,
          ticket_id TEXT NOT NULL,
          ticket_no TEXT NOT NULL,
          assigned_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL,
          PRIMARY KEY(work_day, warehouse, box_code)
        )`),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_active_boxes_d0_ticket ON active_boxes_d0(work_day, warehouse, ticket_id)")
      ]);
      activeBoxesSchemaReady = true;
    })().catch(error => {
      activeBoxesSchemaPromise = null;
      throw error;
    });
  }
  await activeBoxesSchemaPromise;
}


async function ensureActiveHoldOrdersSchema(env: Env): Promise<void> {
  if (activeHoldOrdersSchemaReady) return;
  if (!activeHoldOrdersSchemaPromise) {
    activeHoldOrdersSchemaPromise = (async () => {
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS active_hold_orders_d0 (
          work_day TEXT NOT NULL,
          warehouse TEXT NOT NULL,
          order_key TEXT NOT NULL,
          ticket_id TEXT NOT NULL,
          ticket_no TEXT NOT NULL,
          updated_at_ms INTEGER NOT NULL,
          PRIMARY KEY(work_day, warehouse, order_key)
        )`),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_active_hold_orders_ticket ON active_hold_orders_d0(work_day, warehouse, ticket_id)")
      ]);
      activeHoldOrdersSchemaReady = true;
    })().catch(error => {
      activeHoldOrdersSchemaPromise = null;
      throw error;
    });
  }
  await activeHoldOrdersSchemaPromise;
}

async function ensureOperationalPerformanceIndexes(env: Env): Promise<void> {
  if (operationalPerfSchemaReady) return;
  if (!operationalPerfSchemaPromise) {
    operationalPerfSchemaPromise = (async () => {
      // V1.9: các màn hình chỉ đọc dữ liệu của work_day + collection hiện tại theo thời gian mới nhất.
      // Index này giảm scan khi 20 thiết bị cùng mở/reconnect trong ngày vận hành.
      await env.DB.batch([
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_docs_d0_day_collection_updated ON docs_d0(work_day, collection_path, updated_at_ms DESC)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_docs_d0_order_code_lookup ON docs_d0(work_day, collection_path, json_extract(data_json, '$.order_code'))"),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_docs_d0_tracking_key ON docs_d0(work_day,collection_path,${ORDER_TRACKING_KEY})`),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_docs_d0_order_sn_lookup ON docs_d0(work_day, collection_path, json_extract(data_json, '$.order_sn'))"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_docs_d0_shopee_sn_lookup ON docs_d0(work_day, collection_path, json_extract(data_json, '$.shopee_order_sn'))"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_docs_d0_visible_until ON docs_d0(work_day, collection_path, CAST(COALESCE(json_extract(data_json, '$.visible_until_ms'), 0) AS INTEGER), updated_at_ms DESC)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_events_d0_day ON events_d0(work_day)")
      ]);
      operationalPerfSchemaReady = true;
    })().catch(error => {
      operationalPerfSchemaPromise = null;
      throw error;
    });
  }
  await operationalPerfSchemaPromise;
}

interface DailyFullResetResult { operation_day_vn: string; executed: boolean; cleared_docs: number; }
async function purgePriorDays(env: Env, ctx?: ExecutionContext): Promise<DailyFullResetResult> {
  // V1.9: 06:00 VN reset toàn bộ dữ liệu vận hành; marker D1 ngăn nhiều isolate cùng quét/xóa lặp lại.
  await ensureActiveSlotsSchema(env);
  await ensureActiveBoxesSchema(env);
  await ensureActiveHoldOrdersSchema(env);
  await ensureOperationalPerformanceIndexes(env);
  const day = todayVn();
  if (lastResetOperationDay === day) return { operation_day_vn: day, executed: false, cleared_docs: 0 };
  const resetMarkerKey = "reset:0600:full_operational_data:v19";
  const marker = await env.DB.prepare("SELECT value FROM daily_counters_d0 WHERE work_day=? AND counter_key=? LIMIT 1")
    .bind(day, resetMarkerKey).first<{ value: number }>();
  if (marker) {
    lastResetOperationDay = day;
    return { operation_day_vn: day, executed: false, cleared_docs: 0 };
  }
  const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM docs_d0 WHERE work_day <> ?").bind(day).first<{ n: number }>();
  const clearedDocs = Number(before?.n || 0);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM docs_d0 WHERE work_day <> ?").bind(day),
    env.DB.prepare("DELETE FROM events_d0 WHERE work_day <> ?").bind(day),
    env.DB.prepare("DELETE FROM daily_counters_d0 WHERE work_day <> ?").bind(day),
    env.DB.prepare("DELETE FROM active_slots_d0 WHERE work_day <> ?").bind(day),
    env.DB.prepare("DELETE FROM active_boxes_d0 WHERE work_day <> ?").bind(day),
    env.DB.prepare("DELETE FROM active_hold_orders_d0 WHERE work_day <> ?").bind(day),
    env.DB.prepare("INSERT OR REPLACE INTO daily_counters_d0(work_day,counter_key,value,updated_at_ms) VALUES(?,?,1,?)").bind(day, resetMarkerKey, nowMs())
  ]);
  lastResetOperationDay = day;
  if (ctx && clearedDocs > 0) {
    notify(env, ctx, "*", "reset_all_data", {
      action: "DAILY_FULL_RESET_0600",
      reason: "DAILY_FULL_RESET_0600_VN",
      cleared_docs: clearedDocs,
      operation_day_vn: day,
      daily_full_reset_time_vn: "06:00"
    });
  }
  return { operation_day_vn: day, executed: true, cleared_docs: clearedDocs };
}
async function readDoc(env: Env, collection: string, id: string): Promise<Record<string,unknown> | null> {
  const row = await env.DB.prepare("SELECT doc_id, data_json, updated_at_ms FROM docs_d0 WHERE work_day=? AND collection_path=? AND doc_id=? LIMIT 1").bind(todayVn(), collection, id).first<DocumentRow>();
  return dataFromRow(row);
}
async function writeDoc(env: Env, collection: string, id: string, data: Record<string,unknown>, merge = false): Promise<Record<string,unknown>> {
  const existing = merge ? await readDoc(env, collection, id) : null;
  const finalData = { ...(existing || {}), ...asObject(normalizeValue(data)), id, updated_at_ms: Number(data.updated_at_ms || nowMs()) };
  await env.DB.prepare("INSERT INTO docs_d0(work_day,collection_path,doc_id,data_json,updated_at_ms) VALUES(?,?,?,?,?) ON CONFLICT(work_day,collection_path,doc_id) DO UPDATE SET data_json=excluded.data_json, updated_at_ms=excluded.updated_at_ms")
    .bind(todayVn(), collection, id, JSON.stringify(finalData), Number(finalData.updated_at_ms)).run();
  return finalData;
}
async function deleteDoc(env: Env, collection: string, id: string): Promise<void> {
  await env.DB.prepare("DELETE FROM docs_d0 WHERE work_day=? AND collection_path=? AND doc_id=?").bind(todayVn(), collection, id).run();
}
async function readCollection(env: Env, collection: string, cap = 5000): Promise<Record<string,unknown>[]> {
  const rows = await env.DB.prepare("SELECT doc_id,data_json,updated_at_ms FROM docs_d0 WHERE work_day=? AND collection_path=? ORDER BY updated_at_ms DESC LIMIT ?")
    .bind(todayVn(), collection, Math.min(Math.max(1, cap), 5000)).all<DocumentRow>();
  return (rows.results || []).map(r => dataFromRow(r) || {}).filter(d => Object.keys(d).length > 0);
}
function compareValue(a: unknown, b: unknown): number {
  const aa = typeof a === "string" && !Number.isNaN(Date.parse(a)) ? Date.parse(a) : a;
  const bb = typeof b === "string" && !Number.isNaN(Date.parse(b)) ? Date.parse(b) : b;
  if (aa === bb) return 0; return (aa as any) > (bb as any) ? 1 : -1;
}
function applyConstraints(items: Record<string,unknown>[], constraints: Constraint[]): Record<string,unknown>[] {
  let output = items.slice(); let limitN = 5000;
  for (const c of constraints || []) {
    if (c.type === "where") {
      const f = String(c.field || ""); const op = String(c.op || "=="); const expected = c.value;
      output = output.filter(item => {
        const actual = item[f]; const cmp = compareValue(actual, expected);
        if (op === "==") return actual === expected;
        if (op === ">") return cmp > 0;
        if (op === ">=") return cmp >= 0;
        if (op === "<") return cmp < 0;
        if (op === "<=") return cmp <= 0;
        if (op === "array-contains") return Array.isArray(actual) && actual.some(v => v === expected);
        return true;
      });
    }
    if (c.type === "orderBy") {
      const f = String(c.field || "updated_at_ms"); const mult = String(c.direction || "asc").toLowerCase() === "desc" ? -1 : 1;
      output.sort((a,b) => compareValue(a[f], b[f]) * mult);
    }
    if (c.type === "limit") limitN = Math.min(5000, Math.max(1, Number(c.n || 100)));
  }
  return output.slice(0, limitN);
}
async function nextSeq(env: Env): Promise<number> {
  const day = todayVn(); const key = "events"; const time = nowMs();
  await env.DB.prepare("INSERT OR IGNORE INTO daily_counters_d0(work_day,counter_key,value,updated_at_ms) VALUES(?,?,0,?)").bind(day,key,time).run();
  await env.DB.prepare("UPDATE daily_counters_d0 SET value=value+1, updated_at_ms=? WHERE work_day=? AND counter_key=?").bind(time,day,key).run();
  const row = await env.DB.prepare("SELECT value FROM daily_counters_d0 WHERE work_day=? AND counter_key=?").bind(day,key).first<{value:number}>();
  return Number(row?.value || 1);
}
function room(env: Env): DurableObjectStub { return env.ROOMS.get(env.ROOMS.idFromName("VNWL_D0_ROOM")); }
function deltaDoc(collection: string, id: string, data: Record<string, unknown> | null, deleted = false): Record<string, unknown> {
  return { collection_path: collection, collection, id, doc_id: id, ...(deleted ? { deleted: true, op: "delete" } : { data, op: "upsert" }) };
}
function notify(env: Env, ctx: ExecutionContext, collection: string, type: string, extra: Record<string,unknown> = {}): void {
  // V1.4 QUOTA-SAFE: WebSocket event is ephemeral. Do not write a second event row to D1.
  // Source-of-truth state is already stored in docs_d0; reconnect uses one fresh D0 snapshot.
  const event = { type, seq: nowMs(), direct_delta: true, collection, collection_path: collection, day_vn: todayVn(), updated_at_ms: nowMs(), ...extra };
  ctx.waitUntil(room(env).fetch("https://room.internal/broadcast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) }).catch(() => undefined));
}
function orderCollection(wh: string): string { return `orders_v280_${wh}`; }
function riderCollection(wh: string): string { return `rider_overview_vnwl_${wh}`; }
function holdCollection(wh: string): string { return `hold_tickets_v285_${wh}`; }
function holdCollectionWarehouse(collection: string): string | null {
  const match = /^hold_tickets_v285_(WH\d+)$/i.exec(collection);
  return match ? warehouse(match[1]) : null;
}
function normalizedBoxCode(v: unknown): string {
  return cleanText(v).replace(/^BOX\s*[:#]\s*/i, "").trim().toUpperCase();
}
function holdIsTerminal(data: Record<string, unknown> | null | undefined): boolean {
  const status = cleanText(data?.status || data?.workflow_status).toUpperCase();
  return ["HANDED_OVER", "CANCELLED", "CANCELED", "DELETED", "REMOVED", "DONE", "COMPLETED"].includes(status);
}
async function releaseActiveBoxForTicket(env: Env, wh: string, ticketIdValue: unknown): Promise<void> {
  const ticketId = cleanText(ticketIdValue);
  if (!ticketId) return;
  await env.DB.prepare("DELETE FROM active_boxes_d0 WHERE work_day=? AND warehouse=? AND ticket_id=?")
    .bind(todayVn(), wh, ticketId).run();
}
function statusActive(data: Record<string,unknown>): boolean { const s = cleanText(data.status || data.queue_status || data.order_status || "NO_RIDER").toUpperCase(); return s === "NO_RIDER" || s === "HOLD" || s === "PICKED" || s === "PROCESSING"; }
const MAX_SUB_PER_LOCATION = 40;
function orderCollectionWarehouse(collection: string): string | null {
  const match = /^orders_v280_(WH\d+)$/i.exec(collection);
  return match ? warehouse(match[1]) : null;
}
function normalizedLocation(v: unknown): string {
  return cleanText(v).toUpperCase();
}
function subNumber(v: unknown): number | null {
  const raw = cleanText(v);
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= MAX_SUB_PER_LOCATION ? n : null;
}
function locationFromOrder(data: Record<string, unknown> | null | undefined): string {
  if (!data) return "";
  return normalizedLocation(data.location_base || data.location || data.location_code || "");
}
function subFromOrder(data: Record<string, unknown> | null | undefined): number | null {
  if (!data) return null;
  return subNumber(data.sub_code || data.sub);
}
async function releaseActiveSlot(env: Env, wh: string, data: Record<string, unknown> | null | undefined): Promise<void> {
  if (!data) return;
  const location = locationFromOrder(data);
  const sub = subFromOrder(data);
  const id = cleanText(data.id || data.order_id || data.doc_id);
  if (!location || !sub || !id) return;
  await env.DB.prepare("DELETE FROM active_slots_d0 WHERE work_day=? AND warehouse=? AND location=? AND sub_no=? AND order_id=?")
    .bind(todayVn(), wh, location, sub, id).run();
}
async function suggestedSub(env: Env, wh: string, locationInput: string): Promise<number | null> {
  const location = normalizedLocation(locationInput);
  if (!location) return null;
  const rows = await env.DB.prepare("SELECT sub_no FROM active_slots_d0 WHERE work_day=? AND warehouse=? AND location=? ORDER BY sub_no ASC LIMIT ?")
    .bind(todayVn(), wh, location, MAX_SUB_PER_LOCATION).all<{ sub_no: number }>();
  const used = new Set((rows.results || []).map(row => Number(row.sub_no)));
  for (let n = 1; n <= MAX_SUB_PER_LOCATION; n++) if (!used.has(n)) return n;
  return null;
}
function stripTerminalMarkers(data: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(data || {}) };
  [
    "handed_over_at", "handed_over_at_ms", "delivered_at", "delivered_at_ms",
    "deleted_at", "deleted_at_ms", "delete_at", "delete_at_ms",
    "cancelled_at", "cancelled_at_ms", "canceled_at", "canceled_at_ms",
    "deleted", "is_deleted", "cancelled", "canceled", "is_cancelled", "is_canceled",
    "handed_over", "is_handed_over", "driver_name", "rider_name", "handover_by", "handover_note"
  ].forEach(key => delete out[key]);
  return out;
}
function orderCodes(trackingNo: string, orderSn: string): Record<string, unknown> {
  return {
    order_code: trackingNo,
    tracking_no: trackingNo,
    order_sn: orderSn,
    shopee_order_sn: orderSn,
    cloud_d0_aux2_order_sn: orderSn,
    order_sn_display: orderSn,
    shopee_order_sn_display: orderSn
  };
}
async function saveOrderWithClaimedSlot(
  env: Env,
  wh: string,
  newId: string,
  incoming: Record<string, unknown>,
  userEmail: string,
  source: "CREATE_FORM" | "LOCATION_UPLOAD",
  requireSlot = true
): Promise<{ ok: boolean; item?: Record<string, unknown>; action?: string; error?: string; suggested_sub?: number | null }> {
  const day = todayVn();
  const collection = orderCollection(wh);
  const isUpload = source === "LOCATION_UPLOAD";
  const location = normalizedLocation(incoming.location_base || incoming.location || incoming.location_code);
  const sub = subFromOrder(incoming);
  if (!location) return { ok: false, error: "MISSING_LOCATION" };
  if (cleanText(incoming.sub_code || incoming.sub) && !sub) return { ok: false, error: "SUB_OUT_OF_RANGE_1_40" };
  if (requireSlot && !sub) return { ok: false, error: "MISSING_SUB" };

  const trackingNo = cleanText(incoming.tracking_no);
  const tracking = trackingNo.toUpperCase();
  let matches = (await env.DB.prepare(`SELECT doc_id,data_json,updated_at_ms FROM docs_d0
    WHERE (work_day=? AND collection_path=? AND doc_id=?)
       OR (work_day=? AND collection_path=? AND ${ORDER_TRACKING_KEY}=?) LIMIT 2`)
    .bind(day,collection,newId,day,collection,tracking || null).all<DocumentRow>()).results;
  if (isUpload && !matches.length) {
    const orderSn = cleanText(incoming.order_sn).toUpperCase();
    // An order may have been entered with its Shopee code before receiving a tracking number.
    matches = (await env.DB.prepare(`SELECT doc_id,data_json,updated_at_ms FROM docs_d0
      WHERE work_day=? AND collection_path=?
        AND COALESCE(TRIM(json_extract(data_json,'$.tracking_no')),'')=''
        AND UPPER(COALESCE(NULLIF(json_extract(data_json,'$.order_sn'),''),NULLIF(json_extract(data_json,'$.shopee_order_sn'),''),json_extract(data_json,'$.cloud_d0_aux2_order_sn')))=? LIMIT 2`)
      .bind(day,collection,orderSn).all<DocumentRow>()).results;
  }
  if (matches.length > 1) return { ok: false, error: "AMBIGUOUS_TRACKING_NO" };
  const row = matches[0];
  const current = dataFromRow(row);
  const id = row?.doc_id || newId;

  const currentActive = !!current && statusActive(current);
  const slotChanged = locationFromOrder(current) !== location || subFromOrder(current) !== sub;
  const currentStatus = cleanText(current?.status || current?.queue_status || current?.order_status).toUpperCase();
  if (isUpload && current && !currentActive) return { ok: false, error: "TERMINAL_ORDER" };
  if (currentActive && ["HOLD", "PICKED", "PROCESSING"].includes(currentStatus) && slotChanged) {
    return { ok: false, error: "LOCKED_ACTIVE_ORDER_LOCATION_SUB" };
  }
  const unchanged = isUpload && currentActive && !slotChanged &&
    cleanText(current.tracking_no).toUpperCase() === tracking &&
    cleanText(current.order_sn || current.shopee_order_sn || current.cloud_d0_aux2_order_sn) === incoming.order_sn;

  const time = nowMs();
  const action = unchanged ? "NO_CHANGE" : currentActive ? "UPDATE" : "CREATE";
  const nextStatus = currentActive ? (isUpload ? currentStatus : cleanText(current.status || "NO_RIDER")) || "NO_RIDER" : "NO_RIDER";
  const baseCurrent = current && !currentActive ? stripTerminalMarkers(current) : (current || {});
  const suffixKeys = [tracking];
  for(let length=5; isUpload && length<=20 && length<tracking.length; length++)suffixKeys.push(tracking.slice(-length));
  const uploadFields = isUpload ? {
    prepared_at: current?.prepared_at || current?.created_at || new Date(time).toISOString(),
    updated_at: new Date(time).toISOString(),
    suffix_keys: suffixKeys
  } : {};
  const finalData: Record<string, unknown> = {
    ...baseCurrent,
    ...asObject(normalizeValue(incoming)),
    ...uploadFields,
    id,
    warehouse_code: wh,
    location_base: location,
    location,
    location_code: location,
    sub_code: sub ? String(sub) : "",
    sub: sub ? String(sub) : "",
    note: sub ? String(sub) : "",
    status: nextStatus,
    queue_status: current && currentActive ? cleanText(current.queue_status || current.status || "NO_RIDER") : "NO_RIDER",
    order_status: current && currentActive ? cleanText(current.order_status || current.status || "NO_RIDER") : "NO_RIDER",
    created_at_ms: Number(current?.created_at_ms || current?.prepared_at_ms || time),
    prepared_at_ms: Number(current?.prepared_at_ms || current?.created_at_ms || time),
    updated_at_ms: time,
    created_by: cleanText(current?.created_by || userEmail),
    updated_by: userEmail,
    last_operator: userEmail,
    last_operation: source,
    last_operation_at_ms: time,
    ...(current && !currentActive ? { recreated_from_terminal: true, recreated_at_ms: time, recreated_by: userEmail } : {})
  };

  // Verify the order snapshot and reserve its slot in the same transaction.
  const guard = () => env.DB.prepare("INSERT OR REPLACE INTO pilot_guard VALUES(1,changes())");
  const write = unchanged && row
    ? [env.DB.prepare(`INSERT OR REPLACE INTO pilot_guard VALUES(1,EXISTS(
        SELECT 1 FROM docs_d0 WHERE work_day=? AND collection_path=? AND doc_id=? AND data_json=?))`)
      .bind(day, collection, id, row.data_json)]
    : [row
      ? env.DB.prepare("UPDATE docs_d0 SET data_json=?,updated_at_ms=? WHERE work_day=? AND collection_path=? AND doc_id=? AND data_json=?")
        .bind(JSON.stringify(finalData), time, day, collection, id, row.data_json)
      : env.DB.prepare(`INSERT INTO docs_d0(work_day,collection_path,doc_id,data_json,updated_at_ms)
          SELECT ?,?,?,?,? WHERE NOT EXISTS (
            SELECT 1 FROM docs_d0 WHERE work_day=? AND collection_path=? AND ${ORDER_TRACKING_KEY}=?
          ) ON CONFLICT DO NOTHING`)
        .bind(day, collection, id, JSON.stringify(finalData), time, day, collection, tracking || null), guard()];
  try {
    await env.DB.batch([
      ...write,
      ...(sub ? [env.DB.prepare(`INSERT INTO active_slots_d0(work_day,warehouse,location,sub_no,order_id,updated_at_ms) VALUES(?,?,?,?,?,?)
        ON CONFLICT(work_day,warehouse,location,sub_no) DO UPDATE SET updated_at_ms=excluded.updated_at_ms
        WHERE active_slots_d0.order_id=excluded.order_id`).bind(day, wh, location, sub, id, time),
      guard()] : []),
      env.DB.prepare("DELETE FROM active_slots_d0 WHERE work_day=? AND warehouse=? AND order_id=? AND (? IS NULL OR NOT (location=? AND sub_no=?))")
        .bind(day, wh, id, sub, location, sub)
    ]);
    return { ok: true, item: unchanged ? current! : finalData, action };
  } catch (error) {
    if (!(error instanceof Error) || !/CHECK constraint failed: valid\s*=\s*1/i.test(error.message)) throw error;
    const owner = sub && await env.DB.prepare("SELECT order_id FROM active_slots_d0 WHERE work_day=? AND warehouse=? AND location=? AND sub_no=?")
      .bind(day, wh, location, sub).first<{order_id:string}>();
    if (owner && owner.order_id !== id) {
      return { ok: false, error: "LOCATION_SUB_OCCUPIED", suggested_sub: isUpload ? null : await suggestedSub(env, wh, location) };
    }
    return { ok: false, error: "ORDER_CHANGED_RETRY" };
  }
}
function orderMatches(data: Record<string,unknown>, key: string): boolean {
  const target = key.trim().toUpperCase(); if (!target) return false;
  const values = [data.order_code, data.tracking_no, data.order_sn, data.shopee_order_sn, data.order_sn_display].map(v => cleanText(v).toUpperCase());
  return values.some(v => v === target || v.endsWith(target));
}
async function findActiveOrdersByScanKey(env: Env, wh: string, keyInput: string, cap = 50): Promise<Record<string,unknown>[]> {
  const key = cleanText(keyInput).toUpperCase();
  if (!key) return [];
  const collection = orderCollection(wh);
  const found = new Map<string, Record<string,unknown>>();
  const direct = await readDoc(env, collection, safeOrderId(key));
  if (direct && statusActive(direct) && orderMatches(direct, key)) found.set(cleanText(direct.id), direct);
  const rows = await env.DB.prepare(`
    SELECT doc_id, data_json, updated_at_ms FROM docs_d0
    WHERE work_day=? AND collection_path=?
      AND UPPER(COALESCE(json_extract(data_json, '$.status'), json_extract(data_json, '$.queue_status'), json_extract(data_json, '$.order_status'), 'NO_RIDER'))
        IN ('NO_RIDER','HOLD','PICKED','PROCESSING')
      AND (
        UPPER(COALESCE(json_extract(data_json, '$.order_code'), '')) = ?
        OR UPPER(COALESCE(json_extract(data_json, '$.tracking_no'), '')) = ?
        OR UPPER(COALESCE(json_extract(data_json, '$.order_sn'), '')) = ?
        OR UPPER(COALESCE(json_extract(data_json, '$.shopee_order_sn'), '')) = ?
        OR UPPER(COALESCE(json_extract(data_json, '$.order_sn_display'), '')) = ?
        OR substr(UPPER(COALESCE(json_extract(data_json, '$.order_code'), '')), -length(?)) = ?
        OR substr(UPPER(COALESCE(json_extract(data_json, '$.tracking_no'), '')), -length(?)) = ?
        OR substr(UPPER(COALESCE(json_extract(data_json, '$.order_sn'), '')), -length(?)) = ?
        OR substr(UPPER(COALESCE(json_extract(data_json, '$.shopee_order_sn'), '')), -length(?)) = ?
        OR substr(UPPER(COALESCE(json_extract(data_json, '$.order_sn_display'), '')), -length(?)) = ?
      )
    ORDER BY updated_at_ms DESC LIMIT ?
  `).bind(todayVn(), collection, key, key, key, key, key, key, key, key, key, key, key, key, key, key, key, Math.min(50, Math.max(1, cap))).all<DocumentRow>();
  for (const row of rows.results || []) {
    const data = dataFromRow(row);
    if (data && statusActive(data) && orderMatches(data, key)) found.set(cleanText(data.id), data);
  }
  return Array.from(found.values()).slice(0, Math.min(50, Math.max(1, cap)));
}
async function readVisibleRiderOverview(env: Env, wh: string, cap = 300): Promise<Record<string,unknown>[]> {
  const rows = await env.DB.prepare(`
    SELECT doc_id, data_json, updated_at_ms FROM docs_d0
    WHERE work_day=? AND collection_path=?
      AND UPPER(COALESCE(json_extract(data_json, '$.status'), json_extract(data_json, '$.workflow_status'), 'HOLD'))
        NOT IN ('CANCELLED','CANCELED','DELETED','REMOVED')
      AND (CAST(COALESCE(json_extract(data_json, '$.visible_until_ms'), 0) AS INTEGER)=0
        OR CAST(COALESCE(json_extract(data_json, '$.visible_until_ms'), 0) AS INTEGER)>?)
    ORDER BY updated_at_ms DESC LIMIT ?
  `).bind(todayVn(), riderCollection(wh), nowMs(), Math.min(500, Math.max(1, cap))).all<DocumentRow>();
  return (rows.results || []).map(r => dataFromRow(r) || {}).filter(d => Object.keys(d).length > 0);
}
async function readHoldRiderRecovery(env: Env, wh: string, cap = 300): Promise<Record<string,unknown>[]> {
  // V1.9.9: hold_tickets là nguồn nghiệp vụ gốc.
  // Nếu một lần mirror sang rider_overview bị hụt, Rider vẫn tự thấy phiếu.
  // Hàm này chỉ SELECT và trả dữ liệu; không tạo write/broadcast bổ sung.
  const time = nowMs();
  const rows = await env.DB.prepare(`
    SELECT doc_id, data_json, updated_at_ms FROM docs_d0
    WHERE work_day=? AND collection_path=?
      AND UPPER(COALESCE(json_extract(data_json, '$.workflow_status'), json_extract(data_json, '$.status'), 'HOLD'))
        NOT IN ('CANCELLED','CANCELED','DELETED','REMOVED')
      AND (
        UPPER(COALESCE(json_extract(data_json, '$.workflow_status'), json_extract(data_json, '$.status'), 'HOLD'))
          NOT IN ('HANDED_OVER','NOT_DONE','DELIVERED','WAITING_PICKUP_DONE','DONE','COMPLETED','PICKUP_DONE')
        OR (
          CAST(COALESCE(json_extract(data_json, '$.handed_over_at_ms'), json_extract(data_json, '$.updated_at_ms'), 0) AS INTEGER) > 0
          AND CAST(COALESCE(json_extract(data_json, '$.handed_over_at_ms'), json_extract(data_json, '$.updated_at_ms'), 0) AS INTEGER) + 600000 > ?
        )
      )
    ORDER BY updated_at_ms DESC LIMIT ?
  `).bind(todayVn(), holdCollection(wh), time, Math.min(500, Math.max(1, cap))).all<DocumentRow>();
  return (rows.results || []).map(row => {
    const data = dataFromRow(row) || {};
    return Object.keys(data).length
      ? buildRiderMirrorFromHold(data, wh, cleanText(data.id || row.doc_id), cleanText(data.operator || data.operator_email))
      : null;
  }).filter((data): data is Record<string,unknown> => !!data);
}
function holdOrderLockKeysFromTicket(data: Record<string, unknown>): string[] {
  const keys = new Set<string>();
  const add = (prefix: string, value: unknown) => {
    const s = cleanText(value);
    if (s) keys.add(`${prefix}:${s.toUpperCase()}`);
  };
  const items = Array.isArray(data.items) ? data.items as Record<string, unknown>[] : [];
  for (const item of items) {
    add("ID", item.id || item.order_id);
    add("CODE", item.order_code || item.tracking_no);
    add("CODE", item.order_sn || item.shopee_order_sn);
  }
  if (Array.isArray(data.order_ids)) for (const id of data.order_ids) add("ID", id);
  if (Array.isArray(data.order_codes)) for (const code of data.order_codes) add("CODE", code);
  return Array.from(keys);
}

async function releaseHoldOrderLocks(env: Env, wh: string, ticketId: string): Promise<void> {
  await ensureActiveHoldOrdersSchema(env);
  await env.DB.prepare("DELETE FROM active_hold_orders_d0 WHERE work_day=? AND warehouse=? AND ticket_id=?")
    .bind(todayVn(), wh, ticketId).run();
}

async function claimHoldOrderLocks(env: Env, wh: string, ticketId: string, ticketNo: string, data: Record<string, unknown>): Promise<void> {
  await ensureActiveHoldOrdersSchema(env);
  const stage = cleanText(data.workflow_status || data.status || "HOLD").toUpperCase();
  if (["CANCELLED", "CANCELED", "DELETED", "REMOVED", "HANDED_OVER", "DONE", "COMPLETED", "PICKUP_DONE"].includes(stage)) {
    await releaseHoldOrderLocks(env, wh, ticketId);
    return;
  }
  const keys = holdOrderLockKeysFromTicket(data);
  if (!keys.length) {
    await releaseHoldOrderLocks(env, wh, ticketId);
    return;
  }
  const day = todayVn();
  const time = nowMs();
  for (const key of keys) {
    const owner = await env.DB.prepare("SELECT ticket_id,ticket_no FROM active_hold_orders_d0 WHERE work_day=? AND warehouse=? AND order_key=? LIMIT 1")
      .bind(day, wh, key).first<{ticket_id:string;ticket_no:string}>();
    const ownerTicket = cleanText(owner?.ticket_id);
    if (ownerTicket && ownerTicket !== ticketId) {
      throw new VnwlHttpError(409, "HOLD_ORDER_ALREADY_IN_TICKET", `Đơn đã nằm trong phiếu ${cleanText(owner?.ticket_no || ownerTicket)}. Không thể tạo/nhận trùng phiếu.`, { ticket_no: cleanText(owner?.ticket_no), order_key: key });
    }
  }
  const batch:D1PreparedStatement[]=[];
  for(const key of keys){
    batch.push(env.DB.prepare("INSERT INTO active_hold_orders_d0 VALUES(?,?,?,?,?,?) ON CONFLICT(work_day,warehouse,order_key) DO UPDATE SET updated_at_ms=excluded.updated_at_ms WHERE ticket_id=excluded.ticket_id").bind(day,wh,key,ticketId,ticketNo||ticketId,time),
      env.DB.prepare("INSERT OR REPLACE INTO pilot_guard VALUES(1,changes())"));
  }
  batch.push(env.DB.prepare("DELETE FROM active_hold_orders_d0 WHERE work_day=? AND warehouse=? AND ticket_id=? AND order_key NOT IN (SELECT value FROM json_each(?))").bind(day,wh,ticketId,JSON.stringify(keys)));
  try{await env.DB.batch(batch);}catch(e){if(String(e).includes("constraint"))throw new VnwlHttpError(409,"ORDER_BUSY","Đơn vừa thuộc phiếu khác.");throw e;}

}

function holdRiderMirrorId(data: Record<string,unknown>, fallbackId: string): string {
  return safeId(cleanText(data.id || data.ticket_id || data.ticket_no || fallbackId));
}
function riderAppDisplayStatus(stageInput: string): string {
  const stage = cleanText(stageInput).toUpperCase();
  if (["HANDED_OVER","NOT_DONE","DELIVERED","WAITING_PICKUP_DONE","DONE","COMPLETED","PICKUP_DONE"].includes(stage)) return "Đã bàn giao";
  if (["PICKED","READY_PICK","READY_TO_PICK","WAITING_RECEIVE"].includes(stage)) return "Vui lòng vào lấy hàng";
  return "Phiếu đang xử lý";
}
async function riderPickupReceipt(env: Env, wh: string, saved: Record<string, unknown>) {
  // Earlier assisted receipts stored only the ticket number. The sequence allocator also uses it in the document ID.
  const ticketId = cleanText(saved.rider_ticket_id) || wh + "_" + cleanText(saved.ticket_no).replace("-", "_");
  const ticket = await readDoc(env, holdCollection(wh), ticketId);
  const stage = cleanText(ticket?.workflow_status || ticket?.status || "HOLD").toUpperCase();
  return {
    ok: true,
    station: wh,
    seq: saved.seq,
    ticket_no: saved.ticket_no,
    order_count: saved.rider_order_count ?? ticket?.order_count ?? 0,
    status: ["CANCELLED", "CANCELED"].includes(stage)
      ? "Phiếu đã hủy · Vui lòng gọi hỗ trợ"
      : ticket ? riderAppDisplayStatus(stage) : "Phiếu đã được tiếp nhận",
    workflow_status: stage
  };
}
function buildRiderMirrorFromHold(data: Record<string,unknown>, holdWh: string, fallbackId: string, operatorEmail: string): Record<string,unknown> {
  const time = nowMs();
  const stage = cleanText(data.workflow_status || data.status || "HOLD").toUpperCase();
  const visibleUntil = ["CANCELLED","CANCELED","DELETED","REMOVED"].includes(stage)
    ? time - 1
    : (stage === "HANDED_OVER" ? Number(data.visible_until_ms || 0) || time + 10 * 60 * 1000 : Number(data.visible_until_ms || 0));
  return {
    ...data,
    id: holdRiderMirrorId(data, fallbackId),
    warehouse: holdWh,
    warehouse_code: holdWh,
    status: stage,
    workflow_status: stage,
    display_status: riderAppDisplayStatus(stage),
    pickup_status: stage === "HANDED_OVER" ? "NOT_DONE" : "WAITING",
    visible_until_ms: visibleUntil,
    updated_at_ms: time,
    operator: cleanText(data.operator || data.operator_email || data.last_operator || operatorEmail),
    source: "worker_hold_mirror_v198"
  };
}
async function allocateSharedTicketSequence(env: Env, wh: string, dateKey: string): Promise<{seq:number;ticket_no:string;ticket_id:string;date_key:string}> {
  // V1.9.6: dùng chung sequence atomic cho HOLD và bàn giao trực tiếp.
  const day = todayVn();
  const counterKey = `ticket:${wh}:${dateKey}`;
  const legacyMax = await env.DB.prepare(`
    SELECT MAX(CAST(COALESCE(json_extract(data_json, '$.seq'), 0) AS INTEGER)) AS max_seq
    FROM docs_d0
    WHERE work_day=?
      AND collection_path IN (?, ?)
      AND COALESCE(json_extract(data_json, '$.date_key'), '')=?
  `).bind(day, holdCollection(wh), riderCollection(wh), dateKey).first<{max_seq:number}>();
  const minUsedSeq = Math.max(0, Number(legacyMax?.max_seq || 0));
  const time = nowMs();
  const row = await env.DB.prepare(`
    INSERT INTO daily_counters_d0(work_day,counter_key,value,updated_at_ms)
    VALUES(?,?,?,?)
    ON CONFLICT(work_day,counter_key) DO UPDATE SET
      value=CASE WHEN value < ? THEN ? + 1 ELSE value + 1 END,
      updated_at_ms=excluded.updated_at_ms
    RETURNING value
  `).bind(day, counterKey, minUsedSeq + 1, time, minUsedSeq, minUsedSeq).first<{value:number}>();
  const seq = Number(row?.value || (minUsedSeq + 1));
  const seqText = String(seq).padStart(4, "0");
  return { seq, ticket_no:`${dateKey}-${seqText}`, ticket_id:`${wh}_${dateKey}_${seqText}`, date_key:dateKey };
}
// Operational writes use a single D1 batch with a revision check.
async function pilotApi(path:string, body:Record<string,unknown>, env:Env, ctx:ExecutionContext, user:VerifiedUser, wh:string):Promise<Response> {
  const day=todayVn(), now=nowMs(), holds=holdCollection(wh), riders=riderCollection(wh), orders=orderCollection(wh);
  const sql=(query:string,...args:(string|number)[])=>env.DB.prepare(query).bind(...args);
  const fail=(msg:string,status=409):never=>{throw new VnwlHttpError(status,"IFC_REQUEST",msg);};
  const insert=(collection:string,id:string,data:Record<string,unknown>)=>sql("INSERT INTO docs_d0 VALUES(?,?,?,?,?)",day,collection,id,JSON.stringify(data),now);
  const guard=()=>sql("INSERT OR REPLACE INTO pilot_guard(singleton,valid) VALUES(1,changes())");
  const exact=async(code:string)=>{
    const norm=cleanText(code).toUpperCase();
    if(!norm) return fail("Không có đơn chờ bàn giao khớp mã tại kho này.");
    let row=await readDoc(env,orders,safeOrderId(code));
    if(!row || !orderMatches(row, norm)) {
      row = await readDoc(env,orders,safeOrderId(norm)) || await readDoc(env,orders,safeOrderId(code.toLowerCase()));
    }
    if(!row || !orderMatches(row, norm)) {
      const suffix = `%${norm}`;
      const foundRow = await env.DB.prepare(`
        SELECT doc_id, data_json FROM docs_d0
        WHERE work_day=? AND collection_path=?
          AND (
            UPPER(COALESCE(json_extract(data_json, '$.order_code'), '')) = ?
            OR UPPER(COALESCE(json_extract(data_json, '$.tracking_no'), '')) = ?
            OR UPPER(COALESCE(json_extract(data_json, '$.order_sn'), '')) = ?
            OR UPPER(COALESCE(json_extract(data_json, '$.shopee_order_sn'), '')) = ?
            OR UPPER(COALESCE(json_extract(data_json, '$.order_sn_display'), '')) = ?
            OR UPPER(COALESCE(json_extract(data_json, '$.order_code'), '')) LIKE ?
            OR UPPER(COALESCE(json_extract(data_json, '$.tracking_no'), '')) LIKE ?
            OR UPPER(COALESCE(json_extract(data_json, '$.order_sn'), '')) LIKE ?
            OR UPPER(COALESCE(json_extract(data_json, '$.shopee_order_sn'), '')) LIKE ?
            OR UPPER(COALESCE(json_extract(data_json, '$.order_sn_display'), '')) LIKE ?
          )
        ORDER BY updated_at_ms DESC LIMIT 1
      `).bind(day, orders, norm, norm, norm, norm, norm, suffix, suffix, suffix, suffix, suffix).first<DocumentRow>();
      if (foundRow) {
        row = dataFromRow(foundRow);
      }
    }
    if(!row || !orderMatches(row, norm)) return fail(`Mã [${code}]: Không tìm thấy đơn chờ bàn giao tại kho này.`);
    if(String(row.status || "").toUpperCase() === "HANDED_OVER") return fail(`Mã [${code}]: Đơn đã được bàn giao trước đó (${cleanText(row.order_code || row.tracking_no || norm)}).`);
    if(String(row.status || "").toUpperCase() !== "NO_RIDER") return fail(`Mã [${code}]: Trạng thái đơn không phải chờ lấy hàng.`);
    const taken=await sql("SELECT ticket_id FROM active_hold_orders_d0 WHERE work_day=? AND warehouse=? AND order_key IN (?,?,?,?,?)",
      day, wh,
      "ID:"+String(row.id).toUpperCase(),
      "CODE:"+norm,
      "CODE:"+cleanText(row.order_code).toUpperCase(),
      "CODE:"+cleanText(row.tracking_no).toUpperCase(),
      "CODE:"+cleanText(row.order_sn||row.shopee_order_sn).toUpperCase()
    ).first();
    if(taken) return fail(`Mã [${code}]: Đơn đang thuộc phiếu khác.`);
    return row;
  };
  if(path==="/api/kiosk/check"){await exact(cleanText(body.code));return json({ok:true});}
  if(path==="/api/kiosk/register"){
    const key=cleanText(body.request_id),driver=cleanText(body.driver_name);
    const rawCodes=Array.isArray(body.codes)?body.codes.map(cleanText).filter(Boolean):[];
    const codes=Array.from(new Set(rawCodes));
    if(!/^[a-f0-9-]{36}$/i.test(key)||!driver||driver.length>80||!codes.length||codes.length>100||codes.some(c=>!c||c.length>100)) return fail("Tên, mã đơn hoặc lượt đăng ký không hợp lệ.",400);
    const fingerprint=JSON.stringify([driver,codes]),receipt="pilot_receipts_"+wh;
    const replay=async()=>{
      const r=await readDoc(env,receipt,key);
      if(!r)return null;
      if(r.fingerprint!==fingerprint||(body.rider_fingerprint&&r.rider_fingerprint!==body.rider_fingerprint))return fail("Lượt đăng ký đã dùng cho danh sách khác.");
      return json({ok:true,seq:r.seq,ticket_no:r.ticket_no});
    };
    const previous=await replay();if(previous)return previous;
    try{
      const items=[];
      for(const code of codes) items.push(await exact(code));
      const allocated=await allocateSharedTicketSequence(env,wh,day.replaceAll("-",""));
      const id=allocated.ticket_id;
      const ticket={...allocated,id,driver_name:driver,status:"HOLD",workflow_status:"HOLD",warehouse:wh,warehouse_code:wh,created_at_ms:now,updated_at_ms:now,order_count:items.length,order_ids:items.map(i=>i.id),order_codes:codes,items:items.map((o,i)=>({...o,order_id:o.id,seq:i+1}))};
      const batch = [insert(receipt, key, {
        fingerprint,
        seq: allocated.seq,
        ticket_no: allocated.ticket_no,
        rider_ticket_id: id,
        rider_order_count: items.length,
        ...(body.rider_fingerprint ? { rider_fingerprint: body.rider_fingerprint } : {})
      })];
      for(const order of items){
        batch.push(sql("UPDATE docs_d0 SET updated_at_ms=updated_at_ms WHERE work_day=? AND collection_path=? AND doc_id=? AND json_extract(data_json,'$.status')='NO_RIDER'",day,orders,String(order.id)),guard());
        const lockCodes = new Set([
          cleanText(order.order_code).toUpperCase(),
          cleanText(order.tracking_no).toUpperCase(),
          cleanText(order.order_sn).toUpperCase(),
          cleanText(order.shopee_order_sn).toUpperCase(),
        ]);
        lockCodes.delete("");
        batch.push(sql("INSERT INTO active_hold_orders_d0 VALUES(?,?,?,?,?,?)",day,wh,"ID:"+String(order.id).toUpperCase(),id,allocated.ticket_no,now));
        for(const c of lockCodes) batch.push(sql("INSERT INTO active_hold_orders_d0 VALUES(?,?,?,?,?,?)",day,wh,"CODE:"+c,id,allocated.ticket_no,now));
      }
      const mirror=buildRiderMirrorFromHold(ticket,wh,id,user.email);
      batch.push(insert(holds,id,ticket),insert(riders,id,mirror));
      await env.DB.batch(batch);
      for(const [col,data] of [[holds,ticket],[riders,mirror]] as const)notify(env,ctx,col,"fs_delta",{docs:[deltaDoc(col,id,data)],warehouse_code:wh});
      ctx.waitUntil(room(env).fetch("https://room.internal/broadcast",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"rider_registered",station:wh,warehouse_code:wh,ticket_no:allocated.ticket_no,seq:allocated.seq,order_count:items.length,driver_name:driver,ticket_id:id,created_at_ms:now})}).catch(()=>undefined));
      await supportEvent(env,{type:"rider_registered",station:wh,ticket_no:allocated.ticket_no,seq:allocated.seq,order_count:items.length,driver_name:driver}).catch(()=>{});
      return json({ok:true,seq:allocated.seq,ticket_no:allocated.ticket_no});
    } catch(e){const done=await replay();if(done)return done;if(String(e).match(/constraint/i))return fail("Đơn vừa thay đổi hoặc đã được giữ ở phiếu khác.");throw e;}
  }
  if(path==="/api/hold/finish_sorting_batch"){
    const ticketIds=Array.isArray(body.ticket_ids)?Array.from(new Set(body.ticket_ids.map(cleanText).filter(Boolean))):[];
    const scanned=new Set(Array.isArray(body.scanned)?body.scanned.map(cleanText).filter(Boolean):[]);
    if(!ticketIds.length||ticketIds.length>50||!scanned.size||scanned.size>200)return fail("Sorting batch không hợp lệ.",400);
    await ensureActiveSlotsSchema(env);await ensureActiveBoxesSchema(env);await ensureActiveHoldOrdersSchema(env);
    const tickets:Record<string,unknown>[]=[];const orderMap=new Map<string,{ticketId:string;item:Record<string,unknown>} >();
    for(const ticketId of ticketIds){
      const ticket=await readDoc(env,holds,ticketId);
      if(!ticket||String(ticket.status).toUpperCase()!=="PICKED"||ticket.is_sorting_batch)return fail("Phiếu nguồn phải ở trạng thái PICKED trước khi Sorting bàn giao.");
      const items=Array.isArray(ticket.items)?ticket.items as Record<string,unknown>[]:[];
      if(!items.length)return fail("Phiếu nguồn không có danh sách đơn.");
      for(const item of items){const orderId=cleanText(item.id||item.order_id);if(!orderId||orderMap.has(orderId))return fail("Đơn trong Sorting batch bị trùng hoặc thiếu mã.");orderMap.set(orderId,{ticketId,item});}
      tickets.push(ticket);
    }
    if(orderMap.size!==scanned.size||[...orderMap.keys()].some(id=>!scanned.has(id)))return fail("Cần scan đủ chính xác mọi đơn của các phiếu nguồn.");
    const now=nowMs(),batch:D1PreparedStatement[]=[],changedOrders:Record<string,unknown>[]=[];
    for(const [orderId,source] of orderMap){
      const order=await readDoc(env,orders,orderId);if(!order||!statusActive(order))return fail("Một đơn đã được cập nhật hoặc không còn chờ bàn giao.");
      const owner=await sql("SELECT ticket_id FROM active_hold_orders_d0 WHERE work_day=? AND warehouse=? AND order_key=?").bind(day,wh,"ID:"+orderId.toUpperCase()).first<{ticket_id:string}>();
      if(!owner||owner.ticket_id!==source.ticketId)return fail("Đơn không còn thuộc phiếu nguồn dự kiến.");
      const updated={...order,status:"HANDED_OVER",workflow_status:"HANDED_OVER",order_status:"HANDED_OVER",handed_over_at_ms:now,handed_over_at:new Date(now).toISOString(),handed_over_by:user.email,updated_at_ms:now};
      batch.push(sql("UPDATE docs_d0 SET data_json=?,updated_at_ms=? WHERE work_day=? AND collection_path=? AND doc_id=? AND UPPER(COALESCE(json_extract(data_json,'$.status'),'NO_RIDER')) IN ('NO_RIDER','HOLD','PICKED','PROCESSING') AND EXISTS(SELECT 1 FROM active_hold_orders_d0 WHERE work_day=? AND warehouse=? AND ticket_id=? AND order_key=?)",JSON.stringify(updated),now,day,orders,orderId,day,wh,source.ticketId,"ID:"+orderId.toUpperCase()),guard(),sql("DELETE FROM active_slots_d0 WHERE work_day=? AND warehouse=? AND order_id=?",day,wh,orderId));
      changedOrders.push(updated);
    }
    const closedTickets:Record<string,unknown>[]=[];
    for(const ticket of tickets){
      const id=cleanText(ticket.id),items=(ticket.items as Record<string,unknown>[]),next={...ticket,status:"HANDED_OVER",workflow_status:"HANDED_OVER",display_status:"Đã bàn giao",handed_over_count:items.length,handed_over_at_ms:now,handed_over_by:user.email,box_active:false,updated_at_ms:now,last_operator:user.email,operator:user.email};
      batch.push(sql("UPDATE docs_d0 SET data_json=?,updated_at_ms=? WHERE work_day=? AND collection_path=? AND doc_id=? AND json_extract(data_json,'$.status')='PICKED'",JSON.stringify(next),now,day,holds,id),guard(),sql("DELETE FROM active_boxes_d0 WHERE work_day=? AND warehouse=? AND ticket_id=?",day,wh,id),sql("DELETE FROM active_hold_orders_d0 WHERE work_day=? AND warehouse=? AND ticket_id=?",day,wh,id));
      const mirror=buildRiderMirrorFromHold(next,wh,id,user.email);batch.push(sql("INSERT INTO docs_d0 VALUES(?,?,?,?,?) ON CONFLICT(work_day,collection_path,doc_id) DO UPDATE SET data_json=excluded.data_json,updated_at_ms=excluded.updated_at_ms",day,riders,id,JSON.stringify(mirror),now));
      closedTickets.push(next);
    }
    try{await env.DB.batch(batch);}catch(e){if(String(e).match(/constraint/i))return fail("Phiếu hoặc đơn vừa được thay đổi bởi thao tác khác.");throw e;}
    for(const ticket of closedTickets){notify(env,ctx,holds,"fs_delta",{docs:[deltaDoc(holds,String(ticket.id),ticket)],warehouse_code:wh});const mirror=buildRiderMirrorFromHold(ticket,wh,String(ticket.id),user.email);notify(env,ctx,riders,"rider_overview_changed",{docs:[deltaDoc(riders,String(ticket.id),mirror)],warehouse_code:wh});}
    notify(env,ctx,orders,"orders_delta",{action:"SORTING_BATCH_HANDOVER",count:changedOrders.length,docs:changedOrders.map(o=>deltaDoc(orders,String(o.id),o,false)),warehouse_code:wh,operator:user.email});
    return json({ok:true,successItems:changedOrders,skippedItems:[],tickets:closedTickets,sorting_batch_closed:true});
  }
  if(path.endsWith("/claim_next")){
    const requestedId=cleanText(body.ticket_id),sorting=body.mode==="SORTING_BATCH";
    const count=Number(body.limit??(sorting?3:1));
    if(!Number.isInteger(count)||count<1||count>(sorting?3:1))return fail("Số phiếu nhận không hợp lệ.",400);
    const ids=requestedId?[requestedId]:(await sql("SELECT doc_id FROM docs_d0 WHERE work_day=? AND collection_path=? AND json_extract(data_json,'$.status')='HOLD' ORDER BY CAST(json_extract(data_json,'$.seq') AS INTEGER),doc_id LIMIT ?",day,holds,count).all<{doc_id:string}>()).results.map(row=>row.doc_id);
    if(!ids.length)return json({ok:true,items:[]});
    const batchId=sorting?"SORTING_"+crypto.randomUUID():"",claimed:Record<string,unknown>[]=[],batch:D1PreparedStatement[]=[];
    for(const id of ids){
      const ticket=await readDoc(env,holds,id);if(!ticket)return fail("Không tìm thấy phiếu.",404);
      if(requestedId&&ticket.status==="RECEIVED"&&ticket.received_by===user.email)return json({ok:true,ticket,items:[ticket]});
      if(ticket.status!=="HOLD")return fail("Phiếu đã được nhận hoặc đổi trạng thái. Hãy tải lại.");
      const next={...ticket,status:"RECEIVED",workflow_status:"RECEIVED",display_status:riderAppDisplayStatus("RECEIVED"),received_by:user.email,received_at_ms:now,received_device_id:cleanText(body.device_id),device_kind:cleanText(body.device_kind),operator:user.email,last_operator:user.email,updated_at_ms:now,...(batchId?{sorting_batch_id:batchId}:{})};
      batch.push(sql("UPDATE docs_d0 SET data_json=?,updated_at_ms=? WHERE work_day=? AND collection_path=? AND doc_id=? AND json_extract(data_json,'$.status')='HOLD'",JSON.stringify(next),now,day,holds,id),guard());
      const mirror=buildRiderMirrorFromHold(next,wh,id,user.email);
      batch.push(sql("INSERT OR REPLACE INTO docs_d0 VALUES(?,?,?,?,?)",day,riders,id,JSON.stringify(mirror),now));claimed.push(next);
    }
    try{await env.DB.batch(batch);}catch(e){if(String(e).match(/constraint/i))return fail("Phiếu vừa được nhận bởi thao tác khác. Hãy tải lại.");throw e;}
    for(const ticket of claimed){
      const id=String(ticket.id),mirror=buildRiderMirrorFromHold(ticket,wh,id,user.email);
      for(const [col,data] of [[holds,ticket],[riders,mirror]] as const)notify(env,ctx,col,"fs_delta",{docs:[deltaDoc(col,id,data)],warehouse_code:wh});
    }
    return json({ok:true,ticket:claimed[0],items:claimed,...(batchId?{batch_id:batchId}:{})});
  }
  const id=cleanText(body.ticket_id);
  const ticket=await readDoc(env,holds,id);if(!ticket)return fail("Không tìm thấy phiếu.",404);
  const stage=String(ticket.status),action=path.split("/").pop();
  const next:Record<string,unknown>={...ticket,updated_at_ms:now,last_operator:user.email,operator:user.email};
  let status="";
  const batch:D1PreparedStatement[]=[];
  if(action==="skip_box"&&stage==="RECEIVED"&&!ticket.box_code){status="BOX_ASSIGNED";next.box_skipped=true;}
  if(action==="mark_picked"&&stage==="BOX_ASSIGNED"&&(ticket.box_code||ticket.box_skipped)){status="PICKED";next.picked_by=user.email;next.picked_at_ms=now;}
  if(action==="cancel"&&!holdIsTerminal(ticket)){status="CANCELLED";next.cancelled_by=user.email;next.cancelled_at_ms=now;}
  if(action==="finish"&&stage==="HANDED_OVER")return json({ok:true,ticket,successItems:ticket.items,skippedItems:[]});
  if(action==="finish"&&stage==="PICKED"){
    const items=Array.isArray(ticket.items)?ticket.items as Record<string,unknown>[]:[];
    const scanned=new Set(Array.isArray(body.scanned)?body.scanned.map(String):[]);
    if(!items.length||items.length!==scanned.size||items.some(i=>!scanned.has(String(i.id||i.order_id))))return fail("Cần scan đủ mọi đơn thuộc phiếu.");
    status="HANDED_OVER";Object.assign(next,{handed_over_count:items.length,handed_over_at_ms:now,handed_over_by:user.email,box_active:false});
    for(const i of items){
      const oid=String(i.id||i.order_id);
      const existing = await readDoc(env, orders, oid);
      if (existing) {
        batch.push(sql("UPDATE docs_d0 SET data_json=json_patch(data_json,?),updated_at_ms=? WHERE work_day=? AND collection_path=? AND doc_id=? AND json_extract(data_json,'$.status') IN ('NO_RIDER','PICKED','PROCESSING','HOLD') AND EXISTS(SELECT 1 FROM active_hold_orders_d0 WHERE work_day=? AND warehouse=? AND ticket_id=? AND order_key=?)",JSON.stringify({status,order_status:status,queue_status:status,updated_at_ms:now,handed_over_by:user.email,handed_over_at_ms:now}),now,day,orders,oid,day,wh,id,"ID:"+oid.toUpperCase()),guard(),sql("DELETE FROM active_slots_d0 WHERE work_day=? AND warehouse=? AND order_id=?",day,wh,oid));
      } else {
        const fallbackOrder = { ...i, id:oid, order_id:oid, status, order_status:status, queue_status:status, handed_over_by:user.email, handed_over_at_ms:now, handed_over_at:new Date(now).toISOString(), updated_at_ms:now };
        batch.push(insert(orders, oid, fallbackOrder), sql("DELETE FROM active_slots_d0 WHERE work_day=? AND warehouse=? AND order_id=?",day,wh,oid));
      }
    }
  }
  if(!status)return fail("Phiếu đã đổi trạng thái. Hãy tải lại.");
  Object.assign(next,{status,workflow_status:status,display_status:riderAppDisplayStatus(status)});
  if(Array.isArray(body.activity_log))next.activity_log=body.activity_log;
  batch.unshift(sql("UPDATE docs_d0 SET data_json=?,updated_at_ms=? WHERE work_day=? AND collection_path=? AND doc_id=? AND json_extract(data_json,'$.status')=?",JSON.stringify(next),now,day,holds,id,stage),guard());
  if(status==="CANCELLED"||status==="HANDED_OVER") for(const table of ["active_boxes_d0","active_hold_orders_d0"])batch.push(sql("DELETE FROM "+table+" WHERE work_day=? AND warehouse=? AND ticket_id=?",day,wh,id));
  const mirror=buildRiderMirrorFromHold(next,wh,id,user.email);
  batch.push(sql("INSERT OR REPLACE INTO docs_d0 VALUES(?,?,?,?,?)",day,riders,id,JSON.stringify(mirror),now));
  try{await env.DB.batch(batch);}catch(e){if(String(e).match(/constraint/i))return fail("Phiếu hoặc đơn vừa thay đổi. Hãy tải lại.");throw e;}
  for(const [col,data] of [[holds,next],[riders,mirror]] as const)notify(env,ctx,col,"fs_delta",{docs:[deltaDoc(col,id,data)],warehouse_code:wh});
  if(status==="HANDED_OVER"){
    const changed=await Promise.all((next.items as Record<string,unknown>[]).map(i=>readDoc(env,orders,String(i.id||i.order_id))));
    notify(env,ctx,orders,"orders_delta",{docs:changed.filter(Boolean).map(o=>deltaDoc(orders,String(o!.id),o)),warehouse_code:wh});
    return json({ok:true,ticket:next,successItems:changed,skippedItems:[],hold_closed:true});
  }
  return json({ok:true,item:next,ticket:next,items:[next]});
}

async function operationalApi(request: Request, env: Env, ctx: ExecutionContext, user: VerifiedUser, headers: HeadersInit): Promise<Response> {
  const url = new URL(request.url); const path = url.pathname; const body = request.method === "POST" ? asObject(await request.json().catch(() => ({}))) : {};
  const wh = warehouse(body.warehouse || url.searchParams.get("warehouse") || "WH1");
  await purgePriorDays(env, ctx);
  await ensureActiveHoldOrdersSchema(env);
  if(path==="/api/session")return json({ok:true,email:user.email,uid:user.uid});
  if(path.startsWith("/api/kiosk/") || ["/api/hold/claim_next","/api/hold/mark_picked","/api/hold/skip_box","/api/hold/cancel","/api/hold/finish","/api/hold/finish_sorting_batch"].includes(path)){
    if(request.method!=="POST")return json({ok:false,error:"POST required"},405);
    return pilotApi(path,body,env,ctx,user,path.startsWith("/api/kiosk/")?warehouse(user.kioskWarehouse||env.KIOSK_WAREHOUSE):wh);
  }
  if (path === "/api/health" || path === "/api/connection/status") return json({ ok:true, service:"ifc-01-handover", mode:"cloud_d1", version:"IFC_01_HANDOVER_0_7_4", turn_configured:turnConfigured(env), transport:"cloudflare_realtime_d1_d0", day_vn:todayVn(), sql:{status:"online",ok:true}, websocket:{status:"online"}, updated_at_ms:nowMs(), ...dailyFullResetInfo() },200,headers);
  if (path === "/api/fs/doc" && request.method === "GET") {
    const collection = collectionName(url.searchParams.get("collection")); const id = safeId(url.searchParams.get("id")); const doc = await readDoc(env,collection,id);
    return json({ ok:true, exists:!!doc, doc },200,headers);
  }
  if(path==="/api/admin/reset_current_data"&&user.role!=="admin")return json({ok:false,error:"Chỉ Admin Pro được reset dữ liệu toàn hệ thống."},403,headers);
  if (path === "/api/admin/reset_current_data" && request.method === "POST") {
    // V2.0: reset sạch toàn bộ dữ liệu vận hành của work_day hiện tại.
    // Dùng cho nút Reset nhanh toàn bộ data trên app; xóa đơn, phiếu, Rider, BOX, Slot, counters trong ca hiện tại.
    await ensureActiveSlotsSchema(env);
    await ensureActiveBoxesSchema(env);
    await ensureActiveHoldOrdersSchema(env);
    await ensureOperationalPerformanceIndexes(env);
    const day = todayVn();
    const beforeDocs = await env.DB.prepare("SELECT COUNT(*) AS n FROM docs_d0 WHERE work_day=?").bind(day).first<{n:number}>();
    const beforeEvents = await env.DB.prepare("SELECT COUNT(*) AS n FROM events_d0 WHERE work_day=?").bind(day).first<{n:number}>();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM docs_d0 WHERE work_day=?").bind(day),
      env.DB.prepare("DELETE FROM events_d0 WHERE work_day=?").bind(day),
      env.DB.prepare("DELETE FROM daily_counters_d0 WHERE work_day=?").bind(day),
      env.DB.prepare("DELETE FROM active_slots_d0 WHERE work_day=?").bind(day),
      env.DB.prepare("DELETE FROM active_boxes_d0 WHERE work_day=?").bind(day),
      env.DB.prepare("DELETE FROM active_hold_orders_d0 WHERE work_day=?").bind(day)
    ]);
    lastResetOperationDay = "";
    notify(env, ctx, "*", "reset_all_data", { action:"MANUAL_RESET_CURRENT_DATA", operation_day_vn:day, cleared_docs:Number(beforeDocs?.n || 0), cleared_events:Number(beforeEvents?.n || 0), operator:user.email });
    return json({ ok:true, reset:true, operation_day_vn:day, cleared_docs:Number(beforeDocs?.n || 0), cleared_events:Number(beforeEvents?.n || 0), message:"Đã reset sạch toàn bộ dữ liệu vận hành hiện tại." },200,headers);
  }

  if (path === "/api/cleanup/daily_retention" && request.method === "POST") {
    // V2.0: cleanup ngày cũ an toàn; giữ nguyên ca hiện tại theo mốc 06:00 VN.
    const result = await purgePriorDays(env, ctx);
    return json({ ok:true, cleanup:true, ...result, message: result.cleared_docs ? `Đã xóa ${result.cleared_docs} document ngày cũ.` : "Không có dữ liệu ngày cũ cần xóa." },200,headers);
  }

  if (path === "/api/fs/query" && request.method === "POST") {
    const collection = collectionName(body.collection); const constraints = Array.isArray(body.constraints) ? body.constraints as Constraint[] : [];
    const docs = applyConstraints(await readCollection(env, collection), constraints);
    return json({ ok:true, docs, count:docs.length, day_vn:todayVn() },200,headers);
  }
  if (path === "/api/fs/commit" && request.method === "POST") {
    const ops = Array.isArray(body.ops) ? body.ops as unknown as CommitOp[] : [];
    const changed = new Map<string, Record<string, unknown>[]>(); let count = 0;
    for (const raw of ops.slice(0,2000)) {
      const collection = collectionName(raw.collection); const id = safeId(raw.id);
      if (!changed.has(collection)) changed.set(collection, []);
      if (raw.type === "delete") {
        const orderWh = orderCollectionWarehouse(collection);
        const holdWh = holdCollectionWarehouse(collection);
        const previous = (orderWh || holdWh) ? await readDoc(env, collection, id) : null;
        await deleteDoc(env,collection,id);
        if (orderWh && previous) await releaseActiveSlot(env, orderWh, previous);
        if (holdWh && previous) {
          await releaseActiveBoxForTicket(env, holdWh, id);
          await releaseHoldOrderLocks(env, holdWh, id);
          const riderId = holdRiderMirrorId(previous, id);
          await deleteDoc(env, riderCollection(holdWh), riderId);
          if (!changed.has(riderCollection(holdWh))) changed.set(riderCollection(holdWh), []);
          changed.get(riderCollection(holdWh))!.push(deltaDoc(riderCollection(holdWh), riderId, null, true));
        }
        changed.get(collection)!.push(deltaDoc(collection,id,null,true));
      } else {
        const orderWh = orderCollectionWarehouse(collection);
        const holdWh = holdCollectionWarehouse(collection);
        const isMerge = raw.type === "update" || raw.merge === true;
        const previous = (orderWh || holdWh) && isMerge ? await readDoc(env, collection, id) : null;
        const inputData = (orderWh || holdWh) && isMerge ? { ...(previous || {}), ...asObject(raw.data) } : asObject(raw.data);
        if (holdWh) {
          await claimHoldOrderLocks(env, holdWh, id, cleanText(inputData.ticket_no || inputData.id || id), inputData);
        }
        const data = await writeDoc(env,collection,id,inputData,orderWh ? false : isMerge);
        if (orderWh && previous && statusActive(previous) && !statusActive(data)) await releaseActiveSlot(env, orderWh, previous);
        if (holdWh) {
          if (holdIsTerminal(data)) {
            await releaseActiveBoxForTicket(env, holdWh, id);
            await releaseHoldOrderLocks(env, holdWh, id);
          }
          const riderInput = buildRiderMirrorFromHold(data, holdWh, id, user.email);
          const riderId = cleanText(riderInput.id);
          const riderData = await writeDoc(env, riderCollection(holdWh), riderId, riderInput, true);
          if (!changed.has(riderCollection(holdWh))) changed.set(riderCollection(holdWh), []);
          changed.get(riderCollection(holdWh))!.push(deltaDoc(riderCollection(holdWh), riderId, riderData, false));
        }
        changed.get(collection)!.push(deltaDoc(collection,id,data,false));
      }
      count++;
    }
    for (const [collection, docs] of changed.entries()) {
      const type = collection.startsWith("rider_overview_vnwl_") ? "rider_overview_changed" : "fs_delta";
      notify(env,ctx,collection,type,{ action:"commit", count:docs.length, docs, operator:user.email, warehouse_code:wh });
    }
    return json({ ok:true, written:count, rider_mirror_by_worker:true, day_vn:todayVn() },200,headers);
  }
  if ((path === "/api/orders/bootstrap" || path === "/api/orders/reconcile") && request.method === "POST") {
    const limit = Math.min(5000, Math.max(1, Number(body.limit || 1500)));
    const items = (await readCollection(env,orderCollection(wh),limit)).filter(d => cleanText(d.warehouse_code || wh).toUpperCase() === wh);
    return json({ ok:true, source:"cloud_d1_d0", mode:"cloud_d1", warehouse:wh, count:items.length, items, updated_at_ms:nowMs(), day_vn:todayVn() },200,headers);
  }
  if (path === "/api/location/export/full" || path === "/api/location/update_slots") {
    const selected = cleanText(body.warehouse || url.searchParams.get("warehouse")).toUpperCase();
    if (!user.warehouses.includes(selected)) {
      return json({ok:false,error:"Hãy chọn kho đang hoạt động mà tài khoản được cấp quyền."},403,headers);
    }
  }
  if (path === "/api/location/export/full" && request.method === "GET") {
    const items = (await readCollection(env,orderCollection(wh))).filter(statusActive);
    return json({ ok:true, items },200,headers);
  }
  if (path === "/api/location/update_slots" && request.method === "POST") {
    const rows = body.rows;
    if (!Array.isArray(rows) || !rows.length || rows.length > 10) {
      return json({ ok:false,error:"Mỗi lượt upload cần từ 1 đến 10 dòng. Hãy mở lại công cụ upload và thử lại." },400,headers);
    }
    const errors: {row:number;error:string;code:string}[] = [];
    const docs: Record<string,unknown>[] = [];
    const messages: Record<string,string> = {
      MISSING_CREATE_FIELDS: "Thiếu Mã vận đơn, Mã đơn hàng Shopee, Location hoặc Sub.",
      SUB_OUT_OF_RANGE_1_40: "Sub phải là số từ 1 đến 40.",
      AMBIGUOUS_TRACKING_NO: "Có nhiều đơn trùng mã vận đơn tại kho này.",
      LOCKED_ACTIVE_ORDER_LOCATION_SUB: "Đơn đang HOLD, đã pick hoặc đang xử lý nên không thể đổi Location/Sub.",
      TERMINAL_ORDER: "Đơn đã kết thúc, không thể cập nhật Location/Sub.",
      LOCATION_SUB_OCCUPIED: "Location/Sub đang được đơn khác sử dụng.",
      ORDER_CHANGED_RETRY: "Đơn vừa được thay đổi. Kiểm tra lại và thử upload dòng này."
    };
    let created = 0, updated = 0, noChange = 0;
    try {
      for (const [index, raw] of rows.entries()) {
        const input = asObject(raw);
        const trackingNo = cleanText(input.tracking_no);
        const orderSn = cleanText(input.order_sn);
        const location = cleanText(input.location);
        const sub = cleanText(input.sub);
        const saved = trackingNo && orderSn && location && sub
          ? await saveOrderWithClaimedSlot(env,wh,safeOrderId(trackingNo.toUpperCase()),{
            ...orderCodes(trackingNo,orderSn),location,sub
          },user.email,"LOCATION_UPLOAD")
          : {ok:false,error:"MISSING_CREATE_FIELDS"};
        if (!saved.ok || !saved.item) {
          const code = saved.error || "LOCATION_UPLOAD_FAILED";
          const row = Number(input.__row_no) || Number(body.batch_start || 0) + index + 2;
          errors.push({row,code,error:`Dòng ${row}: ${messages[code] || code}`});
        } else if (saved.action === "NO_CHANGE") {
          noChange++;
        } else {
          if (saved.action === "CREATE") created++;
          else updated++;
          docs.push(deltaDoc(orderCollection(wh),cleanText(saved.item.id),saved.item));
        }
      }
    } finally {
      if (docs.length) notify(env,ctx,orderCollection(wh),"orders_delta",{
        action:"LOCATION_UPLOAD",warehouse_code:wh,docs,operator:user.email
      });
    }
    return json({ok:true,created,updated,no_change:noChange,count:created+updated+noChange,errors},200,headers);
  }
  if (path === "/api/orders/create_with_slot" && request.method === "POST") {
    const item = asObject(body.item || body);
    let trackingNo = cleanText(item.tracking_no);
    const orderSn = cleanText(item.order_sn || item.shopee_order_sn || item.cloud_d0_aux2_order_sn);
    let orderCode = trackingNo || cleanText(item.order_code) || orderSn;
    const location = cleanText(item.location_base || item.location || item.location_code);
    const sub = cleanText(item.sub_code || item.sub);
    const requireSlot = body.optional_sub !== true;
    if (!orderSn || !location || (!sub && requireSlot)) {
      return json({ ok:false, error:"MISSING_CREATE_FIELDS", message:"Thiếu Mã đơn hàng Shopee, Location hoặc Sub." },400,headers);
    }
    let id = safeOrderId(orderCode);
    if(!trackingNo){
      const rows=await env.DB.prepare("SELECT doc_id,data_json,updated_at_ms FROM docs_d0 WHERE work_day=? AND collection_path=? AND (UPPER(json_extract(data_json,'$.order_sn'))=? OR UPPER(json_extract(data_json,'$.shopee_order_sn'))=? OR UPPER(json_extract(data_json,'$.cloud_d0_aux2_order_sn'))=?) AND UPPER(COALESCE(NULLIF(json_extract(data_json,'$.status'),''),NULLIF(json_extract(data_json,'$.queue_status'),''),NULLIF(json_extract(data_json,'$.order_status'),''),'NO_RIDER')) IN ('NO_RIDER','HOLD','PICKED','PROCESSING') ORDER BY updated_at_ms DESC LIMIT 2").bind(todayVn(),orderCollection(wh),orderSn.toUpperCase(),orderSn.toUpperCase(),orderSn.toUpperCase()).all<DocumentRow>();
      const active=rows.results.map(dataFromRow).filter((value):value is Record<string,unknown>=>!!value&&statusActive(value));
      if(active.length>1)return json({ok:false,error:"AMBIGUOUS_SHOPEE_CODE",message:"Mã Shopee đang trùng nhiều đơn. Vui lòng kiểm tra lại danh sách đơn."},409,headers);
      if(active.length===1){
        id=String(active[0].id);orderCode=cleanText(active[0].order_code)||orderCode;trackingNo=cleanText(active[0].tracking_no);
        item.suffix_keys=Array.from(new Set([...(Array.isArray(active[0].suffix_keys)?active[0].suffix_keys:[]),...(Array.isArray(item.suffix_keys)?item.suffix_keys:[])]));
      }
    }
    const saved = await saveOrderWithClaimedSlot(env, wh, id, {
      ...item,
      id,
      order_code: orderCode,
      tracking_no: trackingNo,
      order_sn: orderSn,
      shopee_order_sn: orderSn,
      cloud_d0_aux2_order_sn: orderSn,
      order_sn_display: orderSn,
      shopee_order_sn_display: orderSn,
      location_base: location,
      location,
      sub_code: sub,
      sub
    }, user.email, "CREATE_FORM", requireSlot);
    if (!saved.ok) {
      return json({ ok:false, error:saved.error, suggested_sub:saved.suggested_sub ?? null, max_sub:MAX_SUB_PER_LOCATION }, ["LOCATION_SUB_OCCUPIED","ORDER_CHANGED_RETRY","AMBIGUOUS_TRACKING_NO"].includes(saved.error || "") ? 409 : 400, headers);
    }
    const itemSaved = saved.item!;
    notify(env, ctx, orderCollection(wh), "orders_delta", {
      action: saved.action || "CREATE",
      warehouse_code: wh,
      docs: [deltaDoc(orderCollection(wh), cleanText(itemSaved.id), itemSaved, false)],
      operator: user.email
    });
    return json({ ok:true, action:saved.action, item:itemSaved, max_sub:MAX_SUB_PER_LOCATION },200,headers);
  }
  if (path === "/api/sync/client_snapshot" && request.method === "POST") {
    // V1.4: retained only for compatibility. Normal realtime flow never pushes browser cache back to D1.
    const orders = Array.isArray(body.orders) ? body.orders : []; const changed: Record<string, unknown>[] = [];
    for (const raw of orders.slice(0,5000)) {
      const data = asObject(raw); const id = safeId(data.id || safeOrderId(cleanText(data.order_code || data.tracking_no)));
      const saved = await writeDoc(env,orderCollection(wh),id,{...data,warehouse_code:wh},true);
      changed.push(deltaDoc(orderCollection(wh),id,saved,false));
    }
    const items = await readCollection(env,orderCollection(wh));
    if (changed.length) notify(env,ctx,orderCollection(wh),"orders_delta",{ action:"client_snapshot", count:changed.length, docs:changed, warehouse_code:wh });
    return json({ ok:true, action:"client_snapshot", received:orders.length, merged:orders.length, count:items.length, items },200,headers);
  }
  if (path === "/api/orders/lookup_for_handover" && request.method === "POST") {
    const keys = Array.from(new Set((Array.isArray(body.keys) ? body.keys : []).map(k => cleanText(k)).filter(Boolean))).slice(0,100);
    const results: Record<string,unknown>[] = [];
    for (const key of keys) results.push({ key, orders: await findActiveOrdersByScanKey(env, wh, key, Math.min(50, Math.max(1, Number(body.limit || 50)))) });
    return json({ ok:true, warehouse:wh, results, optimized_lookup:true },200,headers);
  }
  if (path === "/api/orders/commit_handover" && request.method === "POST") {
    const items = Array.isArray(body.items) ? body.items : [];
    const successItems: Record<string,unknown>[] = [];
    const skippedItems: Record<string,unknown>[] = [];
    const writes:D1PreparedStatement[]=[];
    const day=todayVn();
    const handoverAtMs = nowMs();
    for (const raw of items.slice(0, 200)) {
      const item = asObject(raw);
      const code = cleanText(item.order_code || item.tracking_no);
      const id = safeId(item.id || safeOrderId(code));
      const current = await readDoc(env, orderCollection(wh), id);
      if (!current || !statusActive(current)) {
        skippedItems.push({ ...item, skip_reason:"Đơn không còn ở trạng thái chờ bàn giao" });
        continue;
      }
      const lockedInHold = await env.DB.prepare("SELECT ticket_no FROM active_hold_orders_d0 WHERE work_day=? AND warehouse=? AND order_key IN (?,?) LIMIT 1")
        .bind(day, wh, "ID:" + id.toUpperCase(), "CODE:" + cleanText(current.order_code || current.tracking_no).toUpperCase())
        .first<{ticket_no: string}>();
      if (lockedInHold) {
        throw new VnwlHttpError(409, "ORDER_IN_HOLD", "Đơn đang thuộc phiếu " + (lockedInHold.ticket_no || "") + ". Hãy hoàn tất bàn giao trên phiếu.");
      }
      const updated = {
        ...current,
        status:"HANDED_OVER",
        queue_status:"HANDED_OVER",
        order_status:"HANDED_OVER",
        handed_over_at_ms:handoverAtMs,
        handed_over_at:new Date(handoverAtMs).toISOString(),
        handed_over_by:user.email,
        updated_at_ms:handoverAtMs
      };
      writes.push(env.DB.prepare("UPDATE docs_d0 SET data_json=?,updated_at_ms=? WHERE work_day=? AND collection_path=? AND doc_id=? AND UPPER(COALESCE(json_extract(data_json,'$.status'),'NO_RIDER')) IN ('NO_RIDER','HOLD','PICKED','PROCESSING') AND NOT EXISTS(SELECT 1 FROM active_hold_orders_d0 WHERE work_day=? AND warehouse=? AND order_key IN (?,?))").bind(JSON.stringify(updated),handoverAtMs,day,orderCollection(wh),id,day,wh,"ID:"+id.toUpperCase(),"CODE:"+cleanText(current.order_code||current.tracking_no).toUpperCase()),
        env.DB.prepare("INSERT OR REPLACE INTO pilot_guard VALUES(1,changes())"),
        env.DB.prepare("DELETE FROM active_slots_d0 WHERE work_day=? AND warehouse=? AND order_id=?").bind(day,wh,id));

      successItems.push(updated);
    }

    let directTicket: Record<string,unknown> | null = null;
    const shouldCreateDirectTicket = body.create_direct_ticket === true || cleanText(body.create_direct_ticket).toLowerCase() === "true";
    if (successItems.length && shouldCreateDirectTicket) {
      // Direct handover: tạo phiếu ngay trong API bàn giao. Không phụ thuộc request thứ hai từ browser.
      const dateKey = cleanText(body.date_key || todayVn().replaceAll("-", ""));
      const allocated = await allocateSharedTicketSequence(env, wh, dateKey);
      const driverName = cleanText(body.driver_name || body.rider_name || "-") || "-";
      const ticketPayload: Record<string,unknown> = {
        id: allocated.ticket_id,
        ticket_no: allocated.ticket_no,
        date_key: allocated.date_key,
        seq: allocated.seq,
        warehouse: wh,
        warehouse_code: wh,
        driver_name: driverName,
        status: "HANDED_OVER",
        workflow_status: "HANDED_OVER",
        pickup_status: "NOT_DONE",
        display_status: "Đã bàn giao",
        handed_over_count: successItems.length,
        order_count: successItems.length,
        handed_over_at_ms: handoverAtMs,
        created_at_ms: handoverAtMs,
        updated_at_ms: handoverAtMs,
        visible_until_ms: handoverAtMs + 10 * 60 * 1000,
        operator: user.email,
        operator_email: user.email,
        handed_over_by: user.email,
        source: "worker_direct_handover_atomic_v196",
        order_codes: successItems.map(item => cleanText(item.order_code || item.tracking_no)).filter(Boolean),
        items: successItems.map((item, index) => ({
          seq: index + 1,
          id: cleanText(item.id),
          order_id: cleanText(item.id),
          order_code: cleanText(item.order_code || item.tracking_no),
          tracking_no: cleanText(item.tracking_no || item.order_code),
          order_sn: cleanText(item.order_sn || item.shopee_order_sn || item.cloud_d0_aux2_order_sn),
          warehouse_code: wh,
          location_code: cleanText(item.location_code || item.location_base || item.location),
          sub_code: cleanText(item.sub_code || item.sub)
        }))
      };
      directTicket=ticketPayload;
      writes.push(env.DB.prepare("INSERT INTO docs_d0 VALUES(?,?,?,?,?)").bind(day,riderCollection(wh),allocated.ticket_id,JSON.stringify(ticketPayload),handoverAtMs));
    }
    if(writes.length){
      try{await env.DB.batch(writes);}catch(e){if(String(e).toLowerCase().includes("constraint"))throw new VnwlHttpError(409,"ORDER_CHANGED","Đơn đang thuộc phiếu HOLD hoặc vừa được bàn giao.");throw e;}
    }
    if(directTicket){
      const allocated={ticket_id:String(directTicket.id)};
      notify(env, ctx, riderCollection(wh), "rider_overview_changed", {
        action: "DIRECT_HANDOVER_TICKET_CREATED",
        warehouse_code: wh,
        id: allocated.ticket_id,
        docs: [deltaDoc(riderCollection(wh), allocated.ticket_id, directTicket, false)],
        operator: user.email
      });
    }

    if (successItems.length) {
      notify(env,ctx,orderCollection(wh),"orders_delta",{
        action:"HANDOVER",
        count:successItems.length,
        docs:successItems.map(item => deltaDoc(orderCollection(wh), cleanText(item.id), item, false)),
        warehouse_code:wh,
        operator:user.email
      });
    }
    return json({
      ok:true,
      successItems,
      skippedItems,
      success_items:successItems,
      skipped_items:skippedItems,
      direct_ticket:directTicket,
      direct_ticket_created:!!directTicket,
      message:`Đã bàn giao ${successItems.length} đơn.`
    },200,headers);
  }
  if (path === "/api/rider/overview/upsert" && request.method === "POST") {
    const ticket = asObject(body.ticket || body); const id = safeId(ticket.id || ticket.ticket_id || ticket.ticket_no || crypto.randomUUID());
    const data = await writeDoc(env,riderCollection(wh),id,{...ticket,id,warehouse:wh,updated_at_ms:nowMs(),operator:ticket.operator || user.email},true);
    notify(env,ctx,riderCollection(wh),"rider_overview_changed",{ warehouse_code:wh, id, docs:[deltaDoc(riderCollection(wh),id,data,false)], operator:user.email });
    return json({ ok:true, item:data },200,headers);
  }
  if (path === "/api/rider/overview/update" && request.method === "POST") {
    const id = safeId(body.id || body.ticket_id || body.ticket_no); const data = await writeDoc(env,riderCollection(wh),id,{...body,updated_at_ms:nowMs(),operator:body.operator || user.email},true);
    notify(env,ctx,riderCollection(wh),"rider_overview_changed",{ warehouse_code:wh, id, docs:[deltaDoc(riderCollection(wh),id,data,false)], operator:user.email });
    return json({ ok:true, item:data },200,headers);
  }
  if (path === "/api/rider/overview/list" && request.method === "POST") {
    const limitRows = Math.min(500, Math.max(1, Number(body.limit || 300)));
    const [savedItems, recoveredHoldItems] = await Promise.all([
      readVisibleRiderOverview(env, wh, limitRows),
      readHoldRiderRecovery(env, wh, limitRows)
    ]);
    const merged = new Map<string, Record<string,unknown>>();
    for (const item of savedItems) {
      const key = cleanText(item.id || item.ticket_id || item.ticket_no);
      if (key) merged.set(key, item);
    }
    for (const item of recoveredHoldItems) {
      const key = cleanText(item.id || item.ticket_id || item.ticket_no);
      if (!key) continue;
      const current = merged.get(key);
      if (!current || Number(item.updated_at_ms || 0) >= Number(current.updated_at_ms || 0)) merged.set(key, item);
    }
    const items = Array.from(merged.values())
      .sort((a, b) => Number(b.updated_at_ms || b.created_at_ms || 0) - Number(a.updated_at_ms || a.created_at_ms || 0))
      .slice(0, limitRows);
    return json({
      ok:true, items, count:items.length, visible_only:true,
      recovered_from_hold_count:recoveredHoldItems.length,
      source:"rider_plus_hold_recovery_v199",
      updated_at_ms:nowMs()
    },200,headers);
  }
  if (path === "/api/hold/tickets/list" && request.method === "POST") {
    const items = (await readCollection(env,holdCollection(wh))).sort((a,b) => {
      const as = Number(a.seq || 0), bs = Number(b.seq || 0);
      if (as && bs && as !== bs) return as - bs;
      return cleanText(a.ticket_no || a.id).localeCompare(cleanText(b.ticket_no || b.id), "en", { numeric:true });
    });
    return json({ ok:true, items, tickets:items, count:items.length, updated_at_ms:nowMs(), sorted_by:"driver_sequence_asc" },200,headers);
  }
  if (path === "/api/hold/claim_box" && request.method === "POST") {
    const ticketId = safeId(body.ticket_id || body.id || body.ticket_no);
    const boxCode = normalizedBoxCode(body.box_code || body.box || body.code);
    if (!boxCode) return json({ ok:false, error:"MISSING_BOX_CODE", message:"Vui lòng scan mã BOX." },400,headers);
    const ticket = await readDoc(env, holdCollection(wh), ticketId);
    if (!ticket) return json({ ok:false, error:"HOLD_TICKET_NOT_FOUND", message:"Không tìm thấy phiếu HOLD." },404,headers);
    const status = cleanText(ticket.status || ticket.workflow_status || "HOLD").toUpperCase();
    if (holdIsTerminal(ticket)) return json({ ok:false, error:"HOLD_TICKET_COMPLETED", message:"Phiếu đã hoàn tất hoặc đã xóa, không thể gắn BOX." },409,headers);
    if (!["RECEIVED", "BOX_ASSIGNED"].includes(status)) {
      return json({ ok:false, error:"RECEIVE_TICKET_BEFORE_BOX", message:"Phải Nhận phiếu trước khi scan BOX." },409,headers);
    }
    const assignedBox = normalizedBoxCode(ticket.box_code);
    if (assignedBox && assignedBox !== boxCode) {
      return json({ ok:false, error:"TICKET_ALREADY_HAS_BOX", message:`Phiếu đã gắn BOX ${assignedBox}.` },409,headers);
    }
    const currentBox = await env.DB.prepare("SELECT ticket_id,ticket_no FROM active_boxes_d0 WHERE work_day=? AND warehouse=? AND box_code=? LIMIT 1")
      .bind(todayVn(), wh, boxCode).first<{ticket_id:string;ticket_no:string}>();
    if (currentBox && cleanText(currentBox.ticket_id) !== ticketId) {
      return json({ ok:false, error:"BOX_IN_USE", box_code:boxCode, ticket_no:currentBox.ticket_no, message:`BOX ${boxCode} đang được sử dụng tại phiếu ${currentBox.ticket_no}.` },409,headers);
    }
    const time = nowMs();
    if (!currentBox) {
      await env.DB.prepare("INSERT OR IGNORE INTO active_boxes_d0(work_day,warehouse,box_code,ticket_id,ticket_no,assigned_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?,?)")
        .bind(todayVn(), wh, boxCode, ticketId, cleanText(ticket.ticket_no || ticketId), time, time).run();
      const owner = await env.DB.prepare("SELECT ticket_id,ticket_no FROM active_boxes_d0 WHERE work_day=? AND warehouse=? AND box_code=? LIMIT 1")
        .bind(todayVn(), wh, boxCode).first<{ticket_id:string;ticket_no:string}>();
      if (!owner || cleanText(owner.ticket_id) !== ticketId) {
        return json({ ok:false, error:"BOX_IN_USE", box_code:boxCode, ticket_no:cleanText(owner?.ticket_no), message:`BOX ${boxCode} vừa được phiếu khác sử dụng.` },409,headers);
      }
    } else {
      await env.DB.prepare("UPDATE active_boxes_d0 SET updated_at_ms=? WHERE work_day=? AND warehouse=? AND box_code=? AND ticket_id=?")
        .bind(time, todayVn(), wh, boxCode, ticketId).run();
    }
    const incomingLog = Array.isArray(body.activity_log) ? body.activity_log : ticket.activity_log;
    const updated = await writeDoc(env, holdCollection(wh), ticketId, {
      ...ticket,
      status:"BOX_ASSIGNED", workflow_status:"BOX_ASSIGNED", display_status:"Phiếu đang xử lý",
      box_code:boxCode, box_active:true, box_assigned_at:new Date(time).toISOString(), box_assigned_at_ms:time, box_assigned_by:user.email,
      operator:user.email, operator_email:user.email, last_operator:user.email, updated_at_ms:time, activity_log:incomingLog
    }, false);
    // V1.9.8: claim_box là route riêng, nên phải mirror Rider Overview ngay tại Worker.
    // Nếu thiếu bước này, máy khác đang mở Rider Overview không nhận realtime ở bước Scan BOX.
    const riderInput = buildRiderMirrorFromHold(updated, wh, ticketId, user.email);
    const riderId = cleanText(riderInput.id);
    const riderData = await writeDoc(env, riderCollection(wh), riderId, riderInput, true);
    notify(env,ctx,holdCollection(wh),"hold_box_assigned",{ action:"BOX_ASSIGNED", warehouse_code:wh, box_code:boxCode, ticket_id:ticketId, docs:[deltaDoc(holdCollection(wh),ticketId,updated,false)], operator:user.email });
    notify(env,ctx,riderCollection(wh),"rider_overview_changed",{ action:"BOX_ASSIGNED", warehouse_code:wh, box_code:boxCode, ticket_id:ticketId, docs:[deltaDoc(riderCollection(wh),riderId,riderData,false)], operator:user.email, direct_delta:true });
    return json({ ok:true, item:updated, ticket:updated, rider_item:riderData, box_code:boxCode, reusable_after:"HANDED_OVER_OR_CANCELLED", rider_realtime_mirrored:true },200,headers);
  }
  if (path === "/api/hold/find_by_box" && request.method === "POST") {
    const boxCode = normalizedBoxCode(body.box_code || body.box || body.code);
    if (!boxCode) return json({ ok:false, error:"MISSING_BOX_CODE", message:"Vui lòng scan mã BOX." },400,headers);
    const active = await env.DB.prepare("SELECT ticket_id,ticket_no FROM active_boxes_d0 WHERE work_day=? AND warehouse=? AND box_code=? LIMIT 1")
      .bind(todayVn(), wh, boxCode).first<{ticket_id:string;ticket_no:string}>();
    if (!active) return json({ ok:true, found:false, box_code:boxCode },200,headers);
    const ticket = await readDoc(env, holdCollection(wh), cleanText(active.ticket_id));
    if (!ticket || holdIsTerminal(ticket)) {
      await releaseActiveBoxForTicket(env, wh, active.ticket_id);
      return json({ ok:true, found:false, box_code:boxCode, released_stale:true },200,headers);
    }
    return json({ ok:true, found:true, box_code:boxCode, ticket_no:active.ticket_no, item:ticket, ticket },200,headers);
  }
  if (path === "/api/hold/allocate_ticket" && request.method === "POST") {
    const dateKey = cleanText(body.date_key || todayVn().replaceAll("-", ""));
    const allocated = await allocateSharedTicketSequence(env, wh, dateKey);
    return json({ ok:true, date_key:allocated.date_key, warehouse:wh, seq:allocated.seq, seq_text:String(allocated.seq).padStart(4,"0"), ticket_no:allocated.ticket_no, ticket_id:allocated.ticket_id, shared_sequence:true },200,headers);
  }
  if (path === "/api/master_maintenance/status" && request.method === "GET") return json({ ok:true, enabled:false, source:"vnwl_cloud_only" },200,headers);
  return json({ ok:false, error:"api_not_found", path },404,headers);
}

// QR grants access to one station only. Guest data never selects a warehouse.
function normalizeRiderKey(value:unknown):string { return cleanText(value).normalize("NFKC").toUpperCase(); }
async function guestPickupApi(request:Request,env:Env,ctx:ExecutionContext):Promise<Response> {
  const headers={"Cache-Control":"no-store"};
  const fail=(message:string,status=400,extra:Record<string,unknown>={})=>json({ok:false,message,...extra},status,headers);
  if(Number(request.headers.get("Content-Length")||0)>8192)return fail("Yêu cầu quá lớn.",413);
  const text=await request.text();if(text.length>8192)return fail("Yêu cầu quá lớn.",413);
  const body=asObject(JSON.parse(text));
  const lookupCode=cleanText(body.code);
  const station=await env.DB.prepare("SELECT w.code AS station,w.name FROM ifc_warehouses w LEFT JOIN ifc_station_qr q ON q.station=w.code LEFT JOIN ifc_station_qr_aliases a ON a.station=w.code WHERE (q.code=? OR a.code=? OR UPPER(w.code)=UPPER(?) OR UPPER(?) LIKE '%'||UPPER(w.code)||'%' OR (?='b5edaac0-78a3-40eb-9e33-84022dd87248' AND w.code='VNHCM1')) AND w.active=1 LIMIT 1").bind(lookupCode,lookupCode,lookupCode,lookupCode,lookupCode).first<{station:string;name:string}>();
  if(!station)return fail("Mã QR không hợp lệ hoặc kho đang tạm ngưng. Hãy gọi nhân viên tại kho.",404);
  const token=cleanText(body.token);
  if(!/^[a-f0-9-]{36}$/i.test(token))return fail("Phiên không hợp lệ. Hãy mở lại mã QR.");
  const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),v=>v.toString(16).padStart(2,"0")).join("");
  const owner=await hash(token),wh=station.station,action=cleanText(body.action);
  // Atomic station/IP bucket, shared by every isolate. No device fingerprinting.
  const bucket=String(Math.floor(Date.now()/60000));
  const source=request.headers.get("CF-Connecting-IP")||"local";
  const limitId="rider_rate_"+await hash(wh+":"+source+":"+bucket);
  const rate=await env.DB.prepare("INSERT INTO daily_counters_d0(work_day,counter_key,value,updated_at_ms) VALUES(?,?,1,?) ON CONFLICT(work_day,counter_key) DO UPDATE SET value=value+1,updated_at_ms=excluded.updated_at_ms WHERE value<600 RETURNING value").bind(todayVn(),limitId,nowMs()).first();
  if(!rate)return fail("Đang có nhiều yêu cầu. Vui lòng chờ một phút rồi thử lại.",429);
  if(action==="info")return json({ok:true,station:wh,name:station.name,min_length:3,max_orders:20,day:todayVn()},200,headers);
  if(!["check","register","status"].includes(action))return fail("Thao tác không hợp lệ.");
  await purgePriorDays(env,ctx);await ensureActiveHoldOrdersSchema(env);
  const requestId=cleanText(body.request_id);
  if(action!=="check"&&!/^[a-f0-9-]{36}$/i.test(requestId))return fail("Thiếu mã lượt đăng ký.");
  const digest=await hash(owner+":"+requestId);
  const key=[digest.slice(0,8),digest.slice(8,12),digest.slice(12,16),digest.slice(16,20),digest.slice(20,32)].join("-");
  const previous=action!=="check"?await readDoc(env,"pilot_receipts_"+wh,key):null;
  const receipt = async (saved: Record<string, unknown>) => json(await riderPickupReceipt(env, wh, saved), 200, headers);
  if(action==="status")return previous?receipt(previous):fail("Chưa có phiếu được tạo cho lượt này.",404);
  const keys=Array.isArray(body.keys)?body.keys.map(normalizeRiderKey):[];
  if(!keys.length||keys.length>20||keys.some(k=>! /^[A-Z0-9_-]{3,100}$/.test(k)))return fail("Nhập từ 3 ký tự cuối trở lên, tối đa 20 mã mỗi lượt.");
  if(new Set(keys).size!==keys.length)return fail("Danh sách có mã nhập lặp lại.");
  const driver=cleanText(body.driver_name).normalize("NFKC")||"Rider";
  const fingerprint=JSON.stringify([driver,keys]);
  if(previous){
    if(previous.rider_fingerprint!==fingerprint)return fail("Lượt đã được gửi với nội dung khác. Hãy lấy số mới.",409);
    return receipt(previous);
  }
  const results:Record<string,unknown>[]=[],selected:Record<string,unknown>[]=[];
  for(const suffix of keys){
    // Same fields, station, operation day and exact suffix as VNWL; never pick first on a collision.
    const found=await findActiveOrdersByScanKey(env,wh,suffix,50);
    if(found.length>1){results.push({key:suffix,state:"ambiguous",message:`Có nhiều đơn trùng đuôi. Hãy nhập ${suffix.length<=5?6:suffix.length+1} ký tự cuối hoặc mã đầy đủ.`});continue;}
    if(!found.length){results.push({key:suffix,state:"missing",message:"Chưa tìm thấy đơn. Kiểm tra mã hoặc nhập thêm ký tự."});continue;}
    const order=found[0],canonical=cleanText(order.tracking_no||order.order_code);
    const locked=await env.DB.prepare("SELECT ticket_id FROM active_hold_orders_d0 WHERE work_day=? AND warehouse=? AND order_key IN (?,?)").bind(todayVn(),wh,"ID:"+cleanText(order.id).toUpperCase(),"CODE:"+canonical.toUpperCase()).first();
    if(cleanText(order.status)!=="NO_RIDER"||locked){results.push({key:suffix,state:"unavailable",message:"Đơn đang được xử lý ở phiếu khác. Bấm Gọi hỗ trợ."});continue;}
    if(selected.some(o=>o.id===order.id)){results.push({key:suffix,state:"duplicate",message:"Mã này cùng một đơn với mã đã nhập trước đó."});continue;}
    selected.push(order);results.push({key:suffix,state:"ready",message:"Đã tìm thấy một đơn khớp mã."});
  }
  if(action==="check")return json({ok:true,station:wh,results,valid:results.every(r=>r.state==="ready")},200,headers);
  if(driver.length>80)return fail("Tên tài xế không hợp lệ.");
  if(results.some(r=>r.state!=="ready"))return fail("Có mã cần kiểm tra lại. Phiếu chưa được tạo.",409,{results});
  const user:VerifiedUser={uid:owner,email:"qr:"+owner,role:"kiosk",warehouses:[wh],supportStations:[],kioskWarehouse:wh,expiresAt:Date.now()+3600000};
  const response=await pilotApi("/api/kiosk/register",{request_id:key,driver_name:driver,codes:selected.map(o=>cleanText(o.tracking_no||o.order_code)),rider_fingerprint:fingerprint},env,ctx,user,wh);
  if(!response.ok)return response;
  const saved=await readDoc(env,"pilot_receipts_"+wh,key);
  if(!saved)throw Error("Không đọc được phiếu. Giữ nguyên lượt và thử lại.");
  return receipt(saved);
}

export default {
  // Cấu hình Cron cần merge vào wrangler hiện tại: 0 23 * * * (23:00 UTC = 06:00 Việt Nam).
  // Ngoài Cron, mọi request sau 06:00 vẫn tự kích hoạt reset để app luôn trống đúng quy tắc.
  async scheduled(_event: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(purgePriorDays(env, ctx).then(() => undefined));
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url); const headers = cors(request,env);
    if (request.method === "OPTIONS") return originAllowed(request,env) ? new Response(null,{status:204,headers}) : json({ok:false,error:"origin_not_allowed"},403,headers);
    if (url.pathname === "/health") {
      const turnCheck:Record<string,unknown>={};
      if(url.searchParams.get("check_turn")==="1"&&turnConfigured(env)){
        try{await guestIce(env,"health-check");turnCheck.turn_credentials_ready=true;}
        catch{turnCheck.turn_credentials_ready=false;}
      }
      return json({ok:true,service:"ifc-01-handover",mode:"cloudflare",version:"IFC_01_HANDOVER_0_7_4",turn_configured:turnConfigured(env),day_vn:todayVn(),...dailyFullResetInfo(),...turnCheck},200,headers);
    }
    if (!originAllowed(request,env)) return json({ok:false,error:"origin_not_allowed"},403,headers);
    if (url.pathname === "/v1/browser/ws") {
      const ticket = cleanText(url.searchParams.get("ticket"));
      return room(env).fetch(`https://room.internal/ws?ticket=${encodeURIComponent(ticket)}`, request);
    }
    if(url.pathname==="/api/rider/pickup"){
      if(request.method!=="POST")return json({ok:false,message:"POST required"},405);
      try{return await guestPickupApi(request,env,ctx);}catch(e){
        if(e instanceof VnwlHttpError)return json({ok:false,message:e.message,...e.extra},e.status);
        if(e instanceof SyntaxError)return json({ok:false,message:"Dữ liệu không hợp lệ."},400);
        return json({ok:false,message:"Chưa xử lý được yêu cầu. Giữ nguyên lượt và thử lại."},500);
      }
    }
    if(url.pathname==="/api/rider/call"&&request.method==="POST"){
      const data=asObject(await request.json().catch(()=>({})));
      const lookupRiderCode=cleanText(data.code);
      const station=await env.DB.prepare("SELECT w.code AS station FROM ifc_warehouses w LEFT JOIN ifc_station_qr q ON q.station=w.code LEFT JOIN ifc_station_qr_aliases a ON a.station=w.code WHERE (q.code=? OR a.code=? OR UPPER(w.code)=UPPER(?) OR UPPER(?) LIKE '%'||UPPER(w.code)||'%' OR (?='b5edaac0-78a3-40eb-9e33-84022dd87248' AND w.code='VNHCM1')) AND w.active=1 LIMIT 1").bind(lookupRiderCode,lookupRiderCode,lookupRiderCode,lookupRiderCode,lookupRiderCode).first<{station:string}>();
      if(!station)return json({error:"QR không hợp lệ hoặc station đã khóa."},404);
      const token=cleanText(data.token);
      if(!/^[a-f0-9-]{36}$/i.test(token))return json({error:"Phiên không hợp lệ."},400);
      const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
      const caller="qr:"+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
      const lookup=()=>env.DB.prepare("SELECT c.id,c.status,c.created_at_ms,m.meeting_url FROM ifc_support_calls c LEFT JOIN ifc_mobile_meetings m ON m.call_id=c.id WHERE kiosk_email=? AND station=? ORDER BY created_at_ms DESC LIMIT 1").bind(caller,station.station).first<{id:string;status:string;created_at_ms:number;meeting_url:string}>();
      let row=await lookup();
      const readAssistedReceipt = async () => {
        if (!row || row.status === "waiting") return null;
        const saved = await readDoc(env, "pilot_receipts_" + station.station, row.id);
        return saved ? riderPickupReceipt(env, station.station, saved) : null;
      };
      if (data.action === "receipt") return json({ receipt: await readAssistedReceipt() });
      if(!row&&data.action==="start"){
        const id=crypto.randomUUID(),now=Date.now();
        const [inserted]=await env.DB.batch([env.DB.prepare("INSERT INTO ifc_support_calls(id,station,kiosk_email,rider_name,issue,status,created_at_ms,updated_at_ms) SELECT ?,?,?,?,'Yêu cầu QR gọi từ điện thoại','waiting',?,? WHERE NOT EXISTS(SELECT 1 FROM ifc_support_calls WHERE kiosk_email=?) AND (SELECT count(*) FROM ifc_support_calls WHERE station=? AND created_at_ms>?)<30").bind(id,station.station,caller,cleanText(data.rider_name).slice(0,80),now,now,caller,station.station,now-60000),
          env.DB.prepare("INSERT INTO ifc_help_queue SELECT id,station,?,1+(SELECT COALESCE(MAX(number),0) FROM ifc_help_queue WHERE station=? AND day=?) FROM ifc_support_calls WHERE id=?").bind(todayVn(),station.station,todayVn(),id)
        ]);
        if(inserted.meta.changes)await supportEvent(env,{type:"support_call",call_id:id,station:station.station,issue:"Yêu cầu QR gọi từ điện thoại",video_mode:"ifc_guest"});
        row=await lookup();
      }
      if(!row)return json({error:"Chưa có lượt hoặc station đang bận."},429);
      if(data.action==="cancel"||row.created_at_ms<Date.now()-3600000){
        await env.DB.prepare("UPDATE ifc_support_calls SET status='cancelled',updated_at_ms=? WHERE id=? AND status IN ('waiting','accepted','held')").bind(Date.now(),row.id).run();
        row=await lookup();
      }
      if(data.action==="signal"){
        if(!row||!["accepted","held"].includes(row.status)||row.created_at_ms<Date.now()-3600000)return json({error:"Cuộc gọi chưa sẵn sàng hoặc đã kết thúc."},410);
        return guestSignals(env,row.id,"rider",data);
      }
      const queue=row&&await env.DB.prepare(`SELECT q.number,(SELECT count(*) FROM ifc_help_queue h JOIN ifc_support_calls c ON c.id=h.call_id WHERE h.station=q.station AND c.status='waiting' AND c.created_at_ms>? AND (h.day<q.day OR (h.day=q.day AND h.number<q.number))) AS ahead FROM ifc_help_queue q WHERE q.call_id=?`).bind(Date.now()-3600000,row.id).first();
      const receipt = await readAssistedReceipt();
      return json({queue,station:station.station,status:row?.status,video_mode:"ifc_guest",...(receipt ? { receipt } : {})});
    }
    let verified;
    try { verified=await identity(request,env); }
    catch(e){return json({ok:false,error:e instanceof Error?e.message:"Token không hợp lệ."},401,headers);}
    try {
      const role=await roleFor(env,verified.email);
      if(!role)return json({ok:false,error:"Email chưa được cấp quyền. Liên hệ quản trị viên IFC_01."},403,headers);
      const isRoot=role==="admin";
      const warehouses=isRoot?(await env.DB.prepare("SELECT code FROM ifc_warehouses WHERE active=1 ORDER BY code").all<{code:string}>()).results.map(r=>r.code):await warehousesFor(env,verified.email);
      let kioskWarehouse:string|undefined;
      if(!isRoot){
        const kioskRow=await env.DB.prepare("SELECT warehouse FROM ifc_memberships WHERE email=? AND role='kiosk' AND warehouse IN (SELECT code FROM ifc_warehouses WHERE active=1) ORDER BY warehouse LIMIT 1").bind(verified.email).first<{warehouse:string}>();
        const legacyKiosk=await env.DB.prepare("SELECT role FROM ifc_permissions WHERE email=?").bind(verified.email).first<{role:string}>();
        kioskWarehouse=kioskRow?.warehouse||(legacyKiosk?.role==="kiosk"?"WH1":undefined);
      }
      const supportStations=isRoot?warehouses:await supportStationsFor(env,verified.email);
      const user:VerifiedUser={...verified,role,warehouses,supportStations,kioskWarehouse};
      if(url.pathname==="/api/session"){
        const managedStations=role==="warehouse_admin"?(await env.DB.prepare("SELECT m.warehouse FROM ifc_memberships m JOIN ifc_warehouses w ON m.warehouse=w.code WHERE m.email=? AND m.role='warehouse_admin' AND w.active=1 ORDER BY m.warehouse").bind(user.email).all<{warehouse:string}>()).results.map(r=>r.warehouse):isRoot?warehouses:[];
        return json({ok:true,...user,managedStations},200,headers);
      }
      if(url.pathname==="/api/admin/station-qr"&&request.method==="POST"){
        const station=cleanText(url.searchParams.get("station")).toUpperCase();
        if(!isRoot&&await membershipRole(env,user.email,station)!=="warehouse_admin")return json({error:"Không quản lý station này."},403);
        await env.DB.prepare("INSERT OR IGNORE INTO ifc_station_qr SELECT code,? FROM ifc_warehouses WHERE code=? AND active=1").bind(crypto.randomUUID(),station).run();
        const qr=await env.DB.prepare("SELECT code FROM ifc_station_qr WHERE station=?").bind(station).first<{code:string}>();
        return qr?json({code:qr.code}):json({error:"Station chưa hoạt động."},404);
      }
      if(url.pathname==="/api/admin/devices"){
        const station=cleanText(url.searchParams.get("station")).toUpperCase();
        return await manageDevices(request,env,isRoot||await membershipRole(env,user.email,station)==="warehouse_admin",station);
      }
      if(url.pathname==="/api/admin/admins")return await manageAdmins(request,env,user);
      if(url.pathname==="/api/admin/permissions")return await managePermissions(request,env,user);
      if(url.pathname==="/api/admin/warehouses")return await manageWarehouses(request,env,user);
      if(url.pathname.startsWith("/api/support/"))return await supportApi(request,env,user,ctx);
      if(url.pathname.startsWith("/api/")){
        const apiBody=await request.clone().json().catch(()=>({})) as Record<string,unknown>;
        const kioskPath=url.pathname.startsWith("/api/kiosk/");
        const wh=cleanText(kioskPath?(user.kioskWarehouse||apiBody.warehouse):(apiBody.warehouse||url.searchParams.get("warehouse"))).toUpperCase()||"WH1";
        const scopedRole=await membershipRole(env,user.email,wh);
        if(!scopedRole)return json({ok:false,error:"Tài khoản chưa được cấp quyền tại kho "+wh+"."},403,headers);
        if(scopedRole==="kiosk"&&!["/api/kiosk/check","/api/kiosk/register"].includes(url.pathname))return json({ok:false,error:"Tài khoản quầy chỉ được đăng ký lấy hàng."},403,headers);
        if(scopedRole!=="kiosk"&&kioskPath)return json({ok:false,error:"Chỉ tài khoản kiosk được dùng màn hình đăng ký tại quầy."},403,headers);
      }
      if (url.pathname === "/v1/ws-ticket" && request.method === "POST") {
        const support=url.searchParams.get("desk")==="1";
        if(support&&!user.kioskWarehouse&&!user.supportStations.length)return json({error:"Chưa được cấp quyền Customer Service."},403);
        const issued = await room(env).fetch("https://room.internal/ticket", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({support,uid:user.uid,email:user.email,warehouses:user.warehouses,supportStations:user.supportStations,kioskWarehouse:user.kioskWarehouse,sessionExpiry:user.expiresAt,origin:request.headers.get("Origin") || ""}) });
        return new Response(issued.body, { status: issued.status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
      }
      if (url.pathname.startsWith("/api/")) return await operationalApi(request,env,ctx,user,headers);
      return json({ok:false,error:"not_found"},404,headers);
    } catch (e) {
      if (e instanceof VnwlHttpError) {
        return json({ ok:false, error:e.message || e.code, code:e.code, message:e.message, ...(e.extra || {}) }, e.status, headers);
      }
      const message = e instanceof Error ? e.message : String(e);
      return json({ ok:false, error:"VNWL_D1_OPERATION_FAILED", message }, 500, headers);
    }
  }
};

export class VnwlRoom {
  constructor(private state: DurableObjectState, private env: Env) {
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping","pong"));
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ticket" && request.method === "POST") {
      const payload = asObject(await request.json()); const ticket = crypto.randomUUID();
      const record: SocketTicket = { support:payload.support===true,uid:cleanText(payload.uid), email:cleanText(payload.email), warehouses:Array.isArray(payload.warehouses)?payload.warehouses.map(x=>cleanText(x).toUpperCase()):[], supportStations:Array.isArray(payload.supportStations)?payload.supportStations.map(x=>cleanText(x).toUpperCase()):[], kioskWarehouse:cleanText(payload.kioskWarehouse).toUpperCase()||undefined, origin:cleanText(payload.origin), sessionExpiry:Number(payload.sessionExpiry),expiresAt:nowMs()+60000 };
      await this.state.storage.put(`ticket:${ticket}`, record);
      return json({ok:true,ticket,expires_in_ms:60000});
    }
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ok:false,error:"websocket_required"},426);
      const ticket = cleanText(url.searchParams.get("ticket")); const record = await this.state.storage.get<SocketTicket>(`ticket:${ticket}`);
      if (!record || record.expiresAt < nowMs()) { if (record) await this.state.storage.delete(`ticket:${ticket}`); return json({ok:false,error:"ticket_invalid"},401); }
      if (record.origin && record.origin !== cleanText(request.headers.get("Origin"))) return json({ok:false,error:"ticket_origin_mismatch"},401);
      await this.state.storage.delete(`ticket:${ticket}`);
      const role=await roleFor(this.env,record.email);
      if(!record.sessionExpiry||record.sessionExpiry<=nowMs()||!role||(!record.supportStations?.length&&!record.kioskWarehouse&&role==="customer_service"))return json({ok:false},403);
      const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
      server.serializeAttachment({ email:record.email, warehouses:record.warehouses||[], supportStations:record.supportStations||[], kioskWarehouse:record.kioskWarehouse, sessionExpiry:record.sessionExpiry } satisfies SocketAttachment);
      this.state.acceptWebSocket(server, [record.support?"desk":"browser"]);
      const clients = this.state.getWebSockets("browser").length;
      const statusEvent = JSON.stringify({ type:"connection_status", status:{ ok:true, transport:"cloudflare_realtime_d1_d0", sql:{status:"online",ok:true}, websocket:{status:"online",clients}, updated_at_ms:nowMs() } });
      // V1.9 ANTI-LAG: khi một máy kết nối, chỉ xác nhận cho máy đó; không phát lại trạng thái tới toàn bộ 20 máy.
      try { server.send(statusEvent); } catch (_) {}
      return new Response(null,{status:101,webSocket:client});
    }
    if (url.pathname === "/broadcast" && request.method === "POST") {
      const event = await request.text();
      const eventData=asObject(JSON.parse(event));
      const eventWarehouse=cleanText(eventData.warehouse_code||asObject(eventData.data).warehouse_code).toUpperCase();
      const sockets=this.state.getWebSockets("browser");
      for(const socket of sockets){try{
        const session=socket.deserializeAttachment() as SocketAttachment|null;
        if(!session?.email||!(Number(session.sessionExpiry)>nowMs())){socket.close(1008,"Session expired");continue;}
        if(session.kioskWarehouse)continue;
        const isRoot=await isAdmin(this.env,session.email);
        const allowed=isRoot?[]:await warehousesFor(this.env,session.email);
        if(eventWarehouse&&!isRoot&&!allowed.includes(eventWarehouse))continue;
        socket.send(event);
      }catch{}}
      return json({ok:true,clients:this.state.getWebSockets("browser").length});
    }
    if(url.pathname==="/support-event"&&request.method==="POST"){
      const event=asObject(await request.json().catch(()=>({}))),type=cleanText(event.type),station=cleanText(event.station).toUpperCase(),sockets=this.state.getWebSockets("desk");let recipients=0;
      const csRows=station?await this.env.DB.prepare("SELECT email FROM ifc_customer_service WHERE station=?").bind(station).all<{email:string}>():{results:[]};
      const currentAgents=new Set(csRows.results.map(r=>cleanText(r.email).toLowerCase()));
      for(const socket of sockets){try{const session=socket.deserializeAttachment() as SocketAttachment|null;if(!session?.email||Number(session.sessionExpiry)<=nowMs()){socket.close(1008,"Session expired");continue;}
        const email=cleanText(session.email).toLowerCase();
        const isAdminUser=await isAdmin(this.env,email);
        const isAgent=currentAgents.has(email);
        const isKiosk=email===cleanText(event.kiosk_email).toLowerCase();
        const relevant=type==="support_call"?(isAdminUser||isAgent):(isKiosk||isAdminUser||isAgent);
        if(relevant){socket.send(JSON.stringify({type:"support_event",event}));recipients++;}
      }catch{}}
      return json({ok:true,recipients});
    }
    return json({ok:false,error:"room_not_found"},404);
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message === "string" && message === "ping") { try { ws.send("pong"); } catch (_) {} return; }
    if(typeof message!=="string"||message.length>1_000_000)return;
    let payload:Record<string,unknown>;try{payload=asObject(JSON.parse(message));}catch{return;}
    if(payload.type!=="support_signal")return;
    const callId=cleanText(payload.call_id),signalType=cleanText(payload.signal_type),target=cleanText(payload.to_email).toLowerCase();
    if(!callId||!target||!(["offer","answer","ice","hangup"].includes(signalType)))return;
    const session=ws.deserializeAttachment() as SocketAttachment|null;if(!session?.email||Number(session.sessionExpiry)<=nowMs())return;
    const call=await this.env.DB.prepare("SELECT id,station,kiosk_email,status,accepted_by FROM ifc_support_calls WHERE id=?").bind(callId).first<{id:string;station:string;kiosk_email:string;status:string;accepted_by:string}>();
    if(!call||!["accepted","held"].includes(call.status))return;
    const fromKiosk=session.email===call.kiosk_email&&session.kioskWarehouse===call.station&&await membershipRole(this.env,session.email,call.station)==="kiosk";
    const serviceGrant=await isAdmin(this.env,session.email)||await this.env.DB.prepare("SELECT email FROM ifc_customer_service WHERE email=? AND station=?").bind(session.email,call.station).first();
    const fromAgent=session.email===call.accepted_by&&!!serviceGrant;
    if(!fromKiosk&&!fromAgent)return;
    const expectedTarget=fromKiosk?call.accepted_by:call.kiosk_email;if(target!==expectedTarget)return;
    const event=JSON.stringify({type:"support_signal",call_id:callId,signal_type:signalType,from_email:session.email,payload:payload.payload});
    let targetAllowed=target===call.kiosk_email?await membershipRole(this.env,target,call.station)==="kiosk":await isAdmin(this.env,target)||!!(await this.env.DB.prepare("SELECT email FROM ifc_customer_service WHERE email=? AND station=?").bind(target,call.station).first());
    if(!targetAllowed)return;
    for(const socket of this.state.getWebSockets("desk")){try{const peer=socket.deserializeAttachment() as SocketAttachment|null;if(peer?.email===target&&Number(peer.sessionExpiry)>nowMs())socket.send(event);}catch{}}
  }
  webSocketClose(_ws: WebSocket): void {
    // V1.9 ANTI-LAG: máy còn mở tự giữ trạng thái qua heartbeat; không broadcast khi máy khác rời phòng.
  }
}
