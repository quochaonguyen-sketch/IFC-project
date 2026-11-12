import Brand from '@/components/Brand';
export default function Page(){
 return <>
<header><Brand subtitle="Customer Service" /><nav className="ui-topbar-links" aria-label="Điều hướng hỗ trợ"><a href="/" target="_blank" rel="noopener">Vận hành kho</a></nav></header>
<main><p className="ui-kicker">Kết nối &amp; hỗ trợ</p><h1>{"Bàn hỗ trợ rider"}</h1>
<p className="ui-page-intro">Nhận cuộc gọi từ rider và kiosk tại các kho được phân công. Bật chế độ đang trực và giữ trang này mở để nhận yêu cầu mới.</p>
</main>
{"\n"}
</>;
}
