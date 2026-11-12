import type {Metadata,Viewport} from 'next';
import type {ReactNode} from 'react';
import OperationalDocument from '@/components/OperationalDocument';
export const metadata:Metadata={"title":"VNWL PC","description":"IFC warehouse operations"};
export const viewport:Viewport={width:'device-width',initialScale:1};
export default function Layout({children}:{children:ReactNode}){return <OperationalDocument legacyVisual bodyClass={""} stylesheets={["/next-styles/desktop.css?v=0.8.9"]} scripts={[{"src":"/next-runtime/ready.js"},{"src":"/vendor/qr.js"},{"src":"/next-runtime/desktop-1.js?v=0.8.1"},{"src":"/vnwl_config.js"},{"src":"/next-runtime/desktop-2.js?v=0.8.14-location-grant","type":"module"}]}>{children}</OperationalDocument>;}