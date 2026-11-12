import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
// The Emscripten release reads its WASM locally; bypass Node's HTTP-only fetch loader.
const nativeFetch=globalThis.fetch;globalThis.fetch=undefined;
const previousMax=process.getMaxListeners();process.setMaxListeners(64);
const text2wav=require('text2wav');
const voices={
 '0':'Xin chào. Nhấn Bắt đầu để đăng ký lấy hàng nhé.',
 '1':'Bạn vui lòng nhập tên hiển thị trên ứng dụng tài xế, sau đó nhấn Tiếp tục.',
 '2':'Bạn vui lòng quét hoặc nhập đầy đủ mã vận đơn. Khi đã nhập xong, nhấn Kiểm tra.',
 '3':'Bạn vui lòng kiểm tra lại tên và danh sách đơn hàng, sau đó nhấn Lấy số thứ tự.',
 '4':'Số thứ tự của bạn là',wait:'Bạn vui lòng chờ nhân viên gọi số nhé.',
 'rider-welcome':'Xin chào bác tài. Bấm Bắt đầu đăng ký để lấy hàng tại kho.',
 'rider-name':'Nhập tên trên ứng dụng tài xế, rồi bấm Tiếp tục.',
 'rider-codes':'Nhập từ ba ký tự cuối mã đơn trở lên, rồi bấm Thêm đơn. Nếu có nhiều đơn, nhập lần lượt từng mã. Khi đủ đơn, bấm Xong.',
 'rider-review':'Kiểm tra các mã đã nhập. Nếu đúng, bấm Lấy số thứ tự.',
 'rider-receipt':'Số thứ tự của bạn là',
 'rider-wait':'Vui lòng chờ nhân viên gọi số trước khi nhận hàng.',
 'rider-added':'Đã thêm đơn. Bạn có thể nhập đơn tiếp theo, hoặc bấm Xong để lấy số.',
 'rider-ambiguous':'Có nhiều đơn trùng mã cuối. Bạn hãy nhập thêm ký tự phía trước, hoặc bấm Gọi hỗ trợ.',
 'rider-error':'Có thông tin cần kiểm tra lại. Bạn đọc thông báo trên màn hình hoặc bấm Gọi hỗ trợ.',
 'rider-duplicate':'Bạn đã nhập đơn này rồi. Hãy nhập đơn khác hoặc bấm Xong.',
 'rider-ready':'Đơn đã sẵn sàng. Vui lòng nhận hàng theo hướng dẫn của nhân viên.'
};
['không','một','hai','ba','bốn','năm','sáu','bảy','tám','chín'].forEach((v,i)=>{voices['n'+i]=v;voices['rider-n'+i]=v;});
await mkdir('public/voice',{recursive:true});
try{for(const [key,line] of Object.entries(voices)){
  const wav=await text2wav(line,{voice:'vi+f4',speed:'132',pitch:'54',amplitude:'82'});
 if(wav.length<44||Buffer.from(wav).toString('ascii',0,4)!=='RIFF'||!wav.subarray(44).some(v=>v!==0))throw Error('Invalid WAV '+key);
 await writeFile('public/voice/'+key+'.wav',wav);
}console.log('Generated '+Object.keys(voices).length+' Vietnamese guidance clips.');}
finally{globalThis.fetch=nativeFetch;process.setMaxListeners(previousMax);}
