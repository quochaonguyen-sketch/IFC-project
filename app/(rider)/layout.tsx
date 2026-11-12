import type {Metadata,Viewport} from 'next';
import type {ReactNode} from 'react';
import OperationalDocument from '@/components/OperationalDocument';
export const metadata:Metadata={"title":"IFC · Đăng ký lấy hàng","description":"IFC_01 Handover · Next.js"};
export const viewport:Viewport={"width":"device-width","initialScale":1,"viewportFit":"cover","themeColor":"#142842"};
export default function Layout({children}:{children:ReactNode}){
 return <OperationalDocument bodyClass={""} stylesheets={["/rider/pickup.css?v=0.8.14","/next-styles/rider.css?v=0.8.11"]} scripts={[{"src":"/rider/rider.js?v=0.8.14","type":"module"}]}>{children}</OperationalDocument>;
}
