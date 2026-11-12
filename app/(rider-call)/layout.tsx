import type {Metadata,Viewport} from 'next';
import type {ReactNode} from 'react';
import OperationalDocument from '@/components/OperationalDocument';
export const metadata:Metadata={"title":"Gọi hỗ trợ IFC","description":"IFC_01 Handover · Next.js"};
export const viewport:Viewport={"width":"device-width","initialScale":1,"viewportFit":"cover"};
export default function Layout({children}:{children:ReactNode}){
 return <OperationalDocument bodyClass={""} stylesheets={["/auth.css","/support/guest-video.css?v=0.7.6","/next-styles/rider-call.css?v=0.8.10"]} scripts={[{"src":"/rider/call.js?v=0.8.10","type":"module"}]}>{children}</OperationalDocument>;
}
