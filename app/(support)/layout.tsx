import type {Metadata,Viewport} from 'next';
import type {ReactNode} from 'react';
import OperationalDocument from '@/components/OperationalDocument';
export const metadata:Metadata={"title":"Customer Service · IFC_01 Handover","description":"IFC_01 Handover · Next.js"};
export const viewport:Viewport={"width":"device-width","initialScale":1};
export default function Layout({children}:{children:ReactNode}){
 return <OperationalDocument bodyClass={""} stylesheets={["/support/guest-video.css?v=0.7.6","/next-styles/support.css?v=0.8.6"]} scripts={[{"src":"/support/support.js?v=0.8.6","type":"module"}]}>{children}</OperationalDocument>;
}
