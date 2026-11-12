import type {Metadata,Viewport} from 'next';
import type {ReactNode} from 'react';
import OperationalDocument from '@/components/OperationalDocument';
export const metadata:Metadata={"title":"Đăng nhập · IFC_01 Handover","description":"IFC_01 Handover · Next.js"};
export const viewport:Viewport={"width":"device-width","initialScale":1};
export default function Layout({children}:{children:ReactNode}){
 return <OperationalDocument bodyClass={""} stylesheets={["/auth.css","/next-styles/login.css"]} scripts={[{"src":"/login/login.js?v=0.7.0","type":"module"}]}>{children}</OperationalDocument>;
}
