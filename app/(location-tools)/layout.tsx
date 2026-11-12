import type {Metadata,Viewport} from 'next';
import type {ReactNode} from 'react';
import OperationalDocument from '@/components/OperationalDocument';
export const metadata:Metadata={"title":"VNWL - Công cụ Upload / Download Location","description":"IFC warehouse operations"};
export const viewport:Viewport={width:'device-width',initialScale:1};
export default function Layout({children}:{children:ReactNode}){return <OperationalDocument legacyVisual bodyClass={""} stylesheets={["/next-styles/location-tools.css?v=0.8.0"]} scripts={[{"src":"/vendor/xlsx.full.min.js"},{"src":"/vnwl_config.js"},{"src":"/next-runtime/location-tools-1.js?v=0.8.14-location-grant","type":"module"}]}>{children}</OperationalDocument>;}