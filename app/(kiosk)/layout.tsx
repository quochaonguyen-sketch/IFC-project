import type {Metadata,Viewport} from 'next';
import type {ReactNode} from 'react';
import OperationalDocument from '@/components/OperationalDocument';
export const metadata:Metadata={"title":"IFC_01 Handover · Quầy rider","description":"IFC_01 Handover · Next.js"};
export const viewport:Viewport={"width":"device-width","initialScale":1};
export default function Layout({children}:{children:ReactNode}){
 return <OperationalDocument bodyClass={""} stylesheets={["/next-styles/kiosk.css"]} scripts={[{"src":"/vendor/qr.js"},{"src":"/kiosk/app.js","type":"module"},{"src":"/support/support.js?v=0.8.6","type":"module"}]}>{children}</OperationalDocument>;
}
