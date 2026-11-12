import Brand from '@/components/Brand';
import Icon from '@/components/Icon';
export default function Page(){
 return <>
<header><Brand subtitle="Quầy tự phục vụ" /><span className="ui-topbar-label">Dành cho rider tại kho</span></header>
<main><small id={"step"}></small>
<h1 id={"title"}></h1>
<p id={"hint"}></p>
<section id={"view"}></section>
<p id={"msg"} role={"status"}></p>
<footer><button className={"alt"} id={"repeat"}><span className="ui-button-content"><Icon name="volume" />Nghe lại hướng dẫn</span></button>
</footer>
</main>
{"\n"}
</>;
}
