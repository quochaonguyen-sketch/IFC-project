#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
admin_email="${IFC_ADMIN_EMAIL:-}"
if [[ -z "$admin_email" ]]; then
  read -rp "Email Firebase cua quan tri vien IFC_01: " admin_email
fi
IFC_ADMIN_EMAIL="$admin_email" node --input-type=module <<'JS'
import fs from "node:fs";
const path="wrangler.jsonc", config=JSON.parse(fs.readFileSync(path,"utf8"));
const email=process.env.IFC_ADMIN_EMAIL.trim().toLowerCase();
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
  console.error("Email quản trị viên không hợp lệ. Nhập email Firebase của Admin Pro rồi chạy lại.");
  process.exit(1);
}
if(config.name!=="ifc-01-handover-pilot" || config.d1_databases.find(d=>d.binding==="DB")?.database_id!=="21bea648-c0d7-48ed-a823-cff382bdd2fd")throw Error("Sai Worker hoặc D1 đang được cấu hình cho IFC_01 Handover.");
const web=JSON.parse(fs.readFileSync("public/firebase-config.js","utf8").replace(/^export default\s*/,"").replace(/;\s*$/,""));
if(config.vars.FIREBASE_PROJECT_ID!=="sdd-local-app" || web.projectId!==config.vars.FIREBASE_PROJECT_ID || web.authDomain!=="sdd-local-app.firebaseapp.com")throw Error("Firebase config sai project; dung ban IFC moi.");
config.vars.ADMIN_EMAIL=email;
fs.writeFileSync(path,JSON.stringify(config,null,2)+"\n");
JS
npm install
npm test
npm run voice
npm run vendor
npx wrangler d1 execute DB --remote --file=schema.sql
npm run deploy
