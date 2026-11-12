import type {Metadata,Viewport} from 'next';
import type {ReactNode} from 'react';
import OperationalDocument from '@/components/OperationalDocument';
export const metadata:Metadata={"title":"Quản trị kho · IFC_01 Handover","description":"IFC_01 Handover · Next.js"};
export const viewport:Viewport={"width":"device-width","initialScale":1};
export default function Layout({children}:{children:ReactNode}){
 return <OperationalDocument bodyClass={""} stylesheets={["/auth.css","/next-styles/admin.css?v=0.8.14"]} scripts={[{"src":"/vendor/qr.js"},{"src":"/admin/admin.js?v=0.8.14-location-grant","type":"module"}]}>{children}</OperationalDocument>;
}
