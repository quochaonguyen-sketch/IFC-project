import type {Metadata,Viewport} from 'next';
import type {ReactNode} from 'react';
import OperationalDocument from '@/components/OperationalDocument';
export const metadata:Metadata={"title":"VNWL Mobile","description":"IFC warehouse operations"};
export const viewport:Viewport={width:'device-width',initialScale:1};
export default function Layout({children}:{children:ReactNode}){return <OperationalDocument legacyVisual bodyClass={"mobile-handover-only"} stylesheets={["/next-styles/mobile.css?v=0.8.9"]} scripts={[{"src":"/next-runtime/ready.js"},{"src":"/vendor/qr.js"},{"src":"/vnwl_config.js"},{"src":"/next-runtime/mobile-1.js?v=0.8.7","type":"module"}]}>{children}</OperationalDocument>;}
