import { initializeApp, getAuth, onAuthStateChanged, apiPost, apiGet } from '/adapter.js';
initializeApp(); const auth=getAuth(); let previewRows=[];
const $=id=>document.getElementById(id); const clean=v=>String(v??'').trim();
function esc(v){ return clean(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function note(text,type=''){ $('message').textContent=text; $('message').style.background=type==='bad'?'#fee2e2':type==='ok'?'#dcfce7':'#eff6ff'; $('message').style.color=type==='bad'?'#991b1b':type==='ok'?'#166534':'#1e3a8a'; $('log').textContent=new Date().toLocaleTimeString('vi-VN')+' - '+text; }
function busy(show,text='Đang xử lý...'){ $('busy').style.display=show?'block':'none'; $('busyText').textContent=text; }
const UPLOAD_CHUNK_SIZE = 10;
function setUploadButtonsDisabled(disabled){ ['preview','confirm','downloadBlank','downloadFull','fileInput','warehouse'].forEach(id=>{ const el=$(id); if(el) el.disabled=!!disabled; }); }
function setUploadWarning(show,detail=''){ const box=$('uploadWarning'); if(!box) return; box.style.display=show?'block':'none'; const d=$('uploadWarningDetail'); if(d) d.textContent=detail || 'Nếu cần chuyển tab, hệ thống sẽ tạm dừng trước batch kế tiếp và tự chạy tiếp khi quay lại.'; }
function setUploadProgress(show,done=0,total=0,detail=''){ const wrap=$('uploadProgressWrap'); if(!wrap) return; wrap.style.display=show?'block':'none'; const safeTotal=Math.max(0,Number(total)||0); const safeDone=Math.min(safeTotal,Math.max(0,Number(done)||0)); const percent=safeTotal?Math.round((safeDone/safeTotal)*100):(show?0:0); $('uploadProgressBar').style.width=percent+'%'; $('uploadProgressText').textContent='Upload: '+percent+'%'; $('uploadProgressCount').textContent=safeDone+'/'+safeTotal+' dòng'; $('uploadProgressDetail').textContent=detail || (show?'Đang chuẩn bị upload...':'Chưa bắt đầu upload.'); }
function sleep(ms){ return new Promise(resolve=>setTimeout(resolve,ms)); }
let uploadInProgress=false;
let lastUploadProgress={done:0,total:0,detail:''};
function setLastUploadProgress(done,total,detail){ lastUploadProgress={done:Number(done)||0,total:Number(total)||0,detail:String(detail||'')}; }
function waitForUploadTabVisible(detail='',done=null,total=null){
  if(!document.hidden) return Promise.resolve();
  const d=done==null?lastUploadProgress.done:done;
  const t=total==null?lastUploadProgress.total:total;
  setUploadProgress(true,d,t,detail || 'Tab đang ẩn nên hệ thống tạm dừng upload để tránh mất kết nối. Quay lại tab này để tự tiếp tục.');
  $('toolbarStatus').textContent='Upload tạm dừng vì tab đang ẩn...';
  return new Promise(resolve=>{
    const onVisible=()=>{
      if(!document.hidden){
        document.removeEventListener('visibilitychange',onVisible);
        $('toolbarStatus').textContent='Đã quay lại tab. Đang tiếp tục upload...';
        setUploadProgress(true,d,t,'Đã quay lại tab. Hệ thống tiếp tục upload batch kế tiếp...');
        resolve();
      }
    };
    document.addEventListener('visibilitychange',onVisible);
  });
}
document.addEventListener('visibilitychange',()=>{
  if(uploadInProgress && document.hidden){
    setUploadProgress(true,lastUploadProgress.done,lastUploadProgress.total,'Tab đang ẩn nên upload sẽ tạm dừng trước batch kế tiếp để tránh mất kết nối.');
  }
});
window.addEventListener('beforeunload',(e)=>{
  if(uploadInProgress){
    e.preventDefault();
    e.returnValue='Upload location đang chạy. Đóng tab có thể làm gián đoạn tiến trình.';
  }
});
function normHeader(v){ return clean(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[\s_\-\.\/]+/g,''); }
const aliases={ tracking:['mavandon','madon','tracking','trackingno','ordercode','barcode'], orderSn:['madonhang','madonhangshopee','ordersn','shopeeordersn'], location:['location','vitri','locationcode','locationbase','loc'], sub:['sub','subcode','slot','bin'] };
function pick(obj,list){ const map={}; Object.keys(obj).forEach(k=>map[normHeader(k)]=obj[k]); for(const x of list){ if(Object.prototype.hasOwnProperty.call(map,x)) return clean(map[x]); } return ''; }
function normalizedRow(obj,rowNo){ return { __row_no:rowNo, tracking_no:pick(obj,aliases.tracking), order_sn:pick(obj,aliases.orderSn), location:pick(obj,aliases.location), sub:pick(obj,aliases.sub) }; }
function validate(rows){
  const errors=[], seenTracking=new Map(), seenSlot=new Map();
  for(const r of rows){
    const row=r.__row_no;
    const tracking=r.tracking_no.toUpperCase();
    const sub=Number(r.sub);
    if(!tracking) errors.push(`Dòng ${row}: thiếu Mã vận đơn`);
    else if(seenTracking.has(tracking)) errors.push(`Dòng ${row}: trùng Mã vận đơn với dòng ${seenTracking.get(tracking)}`);
    else seenTracking.set(tracking,row);
    if(!r.order_sn) errors.push(`Dòng ${row}: thiếu Mã đơn hàng`);
    if(!r.location) errors.push(`Dòng ${row}: thiếu Location`);
    if(!r.sub) errors.push(`Dòng ${row}: thiếu Sub`);
    else if(!/^\d+$/.test(r.sub)||sub<1||sub>40) errors.push(`Dòng ${row}: Sub phải là số từ 1 đến 40`);
    else if(r.location){
      const slot=JSON.stringify([r.location.toUpperCase(),sub]);
      if(seenSlot.has(slot)) errors.push(`Dòng ${row}: trùng Location + Sub với dòng ${seenSlot.get(slot)}`);
      else seenSlot.set(slot,row);
    }
  }
  return errors;
}
function workbookRows(items){ return (items||[]).map(r=>[clean(r.tracking_no||r.order_code),clean(r.order_sn||r.shopee_order_sn||r.cloud_d0_aux2_order_sn),clean(r.location_base||r.location||r.location_code),clean(r.sub_code||r.sub)]); }
function downloadWorkbook(items,name){ if(!window.XLSX) throw new Error('Không tải được thư viện Excel.'); const ws=XLSX.utils.aoa_to_sheet([['Mã vận đơn','Mã đơn hàng Shopee','Location','Sub'],...workbookRows(items)]); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Location'); XLSX.writeFile(wb,name); }
function render(rows){ const issues=validate(rows); const preview=rows.slice(0,100); $('previewBox').innerHTML=`<p><b>Số dòng:</b> ${rows.length} ${issues.length?`— <span class="bad">Lỗi: ${issues.length}</span>`:'— <span class="ok">Hợp lệ</span>'}</p>${issues.length?`<p class="bad">${esc(issues.slice(0,8).join('; '))}</p>`:''}<div class="table-wrap"><table><thead><tr><th>#</th><th>Mã vận đơn</th><th>Mã đơn hàng Shopee</th><th>Location</th><th>Sub</th></tr></thead><tbody>${preview.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.tracking_no)}</td><td>${esc(r.order_sn)}</td><td>${esc(r.location)}</td><td>${esc(r.sub)}</td></tr>`).join('')}</tbody></table></div>`; }
onAuthStateChanged(auth,user=>{
  const warehouses=user.warehouses||[];
  const select=$('warehouse');
  select.replaceChildren(...warehouses.map(code=>new Option(code,code)));
  const saved=localStorage.getItem('ifc-warehouse');
  if(warehouses.includes(saved)) select.value=saved;
  $('authStatus').textContent=warehouses.length?`Đã đăng nhập: ${user.email}`:'Tài khoản chưa được cấp kho để cập nhật Location.';
  select.disabled=$('downloadFull').disabled=$('confirm').disabled=!warehouses.length;
});
$('fileInput').onchange=()=>{ previewRows=[]; $('previewBox').replaceChildren(); setUploadProgress(false); note('Bấm Preview file để kiểm tra dữ liệu.'); };
$('downloadBlank').onclick=()=>{ try{ downloadWorkbook([],`VNWL_Template_Location_4Cot_${$('warehouse').value}.xlsx`); note('Đã tải template rỗng 4 cột.','ok'); }catch(e){ note('Lỗi tải template: '+e.message,'bad'); } };
$('downloadFull').onclick=async()=>{ try{ busy(true,'Đang tải dữ liệu...'); const r=await apiGet(`/api/location/export/full?warehouse=${encodeURIComponent($('warehouse').value)}`); downloadWorkbook(r.items||[],`VNWL_LOCATION_${$('warehouse').value}_${new Date().toISOString().slice(0,10)}.xlsx`); note('Đã tải dữ liệu hiện tại theo mẫu 4 cột.','ok'); }catch(e){ note('Lỗi tải dữ liệu: '+e.message,'bad'); } finally{ busy(false); } };
$('preview').onclick=async()=>{
  setUploadProgress(false);
  previewRows=[];
  $('previewBox').replaceChildren();
  const file=$('fileInput').files[0];
  if(!file){ note('Vui lòng chọn file Excel/CSV trước.','bad'); return; }
  try{
    busy(true,'Đang đọc file upload...');
    const csv=file.name.toLowerCase().endsWith('.csv');
    const data=csv?await file.text():await file.arrayBuffer();
    if($('fileInput').files[0]!==file) return;
    const wb=XLSX.read(data,{type:csv?'string':'array',raw:true});
    const ws=wb.Sheets[wb.SheetNames[0]];
    const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
    const hIdx=aoa.findIndex(row=>row.some(c=>aliases.tracking.includes(normHeader(c)))&&row.some(c=>aliases.location.includes(normHeader(c))));
    if(hIdx<0) throw new Error('Không tìm thấy tiêu đề. File phải có: Mã vận đơn | Mã đơn hàng Shopee | Location | Sub.');
    const headers=aoa[hIdx].map(clean);
    for(let i=hIdx+1;i<aoa.length;i++){
      const values=aoa[i];
      if(!values.some(clean)) continue;
      const row=Object.fromEntries(headers.map((header,index)=>[header,values[index]??'']));
      previewRows.push(normalizedRow(row,i+1));
    }
    if(!previewRows.length) throw new Error('File không có dòng dữ liệu.');
    render(previewRows);
    const errors=validate(previewRows);
    const message=errors.length?`Preview có ${errors.length} lỗi. Sửa file trước khi upload.`:`Preview hợp lệ: ${previewRows.length} dòng sẵn sàng upload.`;
    setUploadProgress(true,0,previewRows.length,message);
    note(message,errors.length?'bad':'ok');
  }catch(e){ note('Lỗi preview: '+e.message,'bad'); }
  finally{ busy(false); }
};

async function postLocationBatchWithRetry(payload, batchNo){
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++){
    await waitForUploadTabVisible(`Tab đang ẩn. Tạm dừng trước batch ${batchNo}/${payload.batch_count}; quay lại tab này để tiếp tục.`, Number(payload.batch_start)||0, Number(payload.total_rows)||0);
    try{
      return await apiPost('/api/location/update_slots', payload, { timeoutMs: 60000 });
    }catch(e){
      if (e.status && e.status < 500 && e.status !== 429) throw e;
      lastErr = e;
      const msg = String(e && e.message || e || '');
      if(document.hidden){
        setUploadProgress(true, Math.max(0, Number(payload.batch_start)||0), Math.max(0, Number(payload.total_rows)||0), `Batch ${batchNo}/${payload.batch_count} mất kết nối vì tab bị ẩn. Quay lại tab này để thử lại batch này...`);
        await waitForUploadTabVisible('', Number(payload.batch_start)||0, Number(payload.total_rows)||0);
        attempt--;
        continue;
      }
      setUploadProgress(true, Math.max(0, Number(payload.batch_start)||0), Math.max(0, Number(payload.total_rows)||0), `Batch ${batchNo}/${payload.batch_count} lỗi lần ${attempt}: ${msg}${attempt < 2 ? ' — đang thử lại...' : ''}`);
      if (attempt < 2) await sleep(700);
    }
  }
  throw lastErr || new Error('UPLOAD_BATCH_FAILED');
}
$('confirm').onclick=async()=>{
  if(uploadInProgress) return;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalNoChange = 0;
  let totalAccepted = 0;
  let allServerErrors = [];
  try{
    const warehouse=$('warehouse').value;
    if(!auth.currentUser||!warehouse){ note('Tài khoản cần đăng nhập và được cấp kho trước khi upload.','bad'); return; }
    if(!previewRows.length){ note('Hãy Preview file trước khi xác nhận upload.','bad'); return; }
    const errors=validate(previewRows);
    if(errors.length){ note(`File còn ${errors.length} lỗi. Không upload để tránh sai dữ liệu.`, 'bad'); return; }
    if(!confirm(`Xác nhận upload ${previewRows.length} dòng vào kho ${warehouse}?\n\nNếu chuyển tab, upload sẽ tạm dừng và tự tiếp tục khi quay lại.\nMã mới sẽ được tạo; mã đang chuẩn bị sẽ cập nhật location/sub.`)) return;
    const total = previewRows.length;
    const batchCount = Math.ceil(total / UPLOAD_CHUNK_SIZE);
    busy(true,'Đang ghi dữ liệu lên Server...');
    uploadInProgress=true;
    setUploadButtonsDisabled(true);
    setUploadProgress(true,0,total,`Bắt đầu upload ${total} dòng theo ${batchCount} batch. Không đóng popup trong lúc upload. Nếu chuyển tab, hệ thống sẽ tạm dừng và tự chạy tiếp khi quay lại.`);
    setLastUploadProgress(0,total,`Bắt đầu upload ${total} dòng theo ${batchCount} batch.`);
    for(let start=0,batchNo=1; start<total; start+=UPLOAD_CHUNK_SIZE,batchNo++){
      await waitForUploadTabVisible(`Tab đang ẩn. Tạm dừng trước batch ${batchNo}/${batchCount}; quay lại tab này để tiếp tục.`, start, total);
      const end = Math.min(start + UPLOAD_CHUNK_SIZE, total);
      const chunk = previewRows.slice(start,end);
      const detail = `Đang upload batch ${batchNo}/${batchCount} — dòng ${start+1} đến ${end}...`;
      setUploadProgress(true,start,total,detail);
      setLastUploadProgress(start,total,detail);
      $('toolbarStatus').textContent = `Đang upload batch ${batchNo}/${batchCount}...`;
      setUploadWarning(true,`Đang upload batch ${batchNo}/${batchCount} — dòng ${start+1} đến ${end}. Vui lòng không đóng/out màn hình cho đến khi đạt 100%.`);
      const r=await postLocationBatchWithRetry({warehouse,rows:chunk,batch_no:batchNo,batch_count:batchCount,batch_start:start,batch_size:chunk.length,total_rows:total}, batchNo);
      totalCreated += Number(r.created || 0);
      totalUpdated += Number(r.updated || 0);
      totalNoChange += Number(r.no_change || r.noChange || 0);
      totalAccepted += Number(r.count || 0);
      if(Array.isArray(r.errors) && r.errors.length) allServerErrors = allServerErrors.concat(r.errors.map(e=>({...e,batch_no:batchNo})));
      setUploadProgress(true,end,total,`Đã upload batch ${batchNo}/${batchCount}. Đã gửi ${end}/${total} dòng; Server nhận ${totalAccepted} dòng hợp lệ. Tạo mới: ${totalCreated}; cập nhật: ${totalUpdated}; không đổi: ${totalNoChange}.`);
      setLastUploadProgress(end,total,`Đã upload batch ${batchNo}/${batchCount}. Đã gửi ${end}/${total} dòng; Server nhận ${totalAccepted} dòng hợp lệ. Không đổi: ${totalNoChange}.`);
      await sleep(80);
    }
    setUploadProgress(true,total,total,`Hoàn tất 100%. Server nhận ${totalAccepted} dòng hợp lệ. Tạo mới: ${totalCreated}; cập nhật: ${totalUpdated}; không đổi: ${totalNoChange}; lỗi/chặn: ${allServerErrors.length}.`);
    if(allServerErrors.length){
      render(previewRows);
      const first = allServerErrors[0] || {};
      note(`Đã upload xong 100%. Server nhận ${totalAccepted} dòng; có ${allServerErrors.length} dòng bị chặn. Dòng đầu: ${first.error||'Lỗi dữ liệu'}.`, 'bad');
    } else {
      note(`Update thành công 100%. Tạo mới: ${totalCreated}; cập nhật: ${totalUpdated}; không thay đổi: ${totalNoChange}.`, 'ok');
    }
    window.parent?.postMessage({type:'VNWL_LOCATION_UPLOAD_DONE',created:totalCreated,updated:totalUpdated,no_change:totalNoChange,blocked:allServerErrors.length,released:0},location.origin);
  }catch(e){
    note('Lỗi upload: '+e.message,'bad');
    const doneText = totalAccepted ? `Đã nhận ${totalAccepted} dòng trước khi lỗi.` : 'Chưa ghi được dòng nào hoặc chưa xác định được số dòng đã ghi.';
    setUploadProgress(true, Math.min(previewRows.length, totalAccepted), previewRows.length, doneText+' Vui lòng kiểm tra Server/Worker rồi upload lại; hệ thống sẽ cập nhật các dòng đã có, không tạo trùng mã vận đơn.');
  } finally{
    uploadInProgress=false;
    setUploadWarning(false);
    busy(false);
    setUploadButtonsDisabled(false);
    if(!$('warehouse').value) $('warehouse').disabled=$('downloadFull').disabled=$('confirm').disabled=true;
    $('toolbarStatus').textContent='Chọn file template đã nhập dữ liệu.';
  }
};
