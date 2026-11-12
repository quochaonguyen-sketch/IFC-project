import type {ReactNode} from 'react';
import OperationalRuntime, {type ScriptSource} from './OperationalRuntime';

export default function OperationalDocument({children,bodyClass,stylesheets,scripts,legacyVisual=false}:{
  children:ReactNode;
  bodyClass?:string;
  legacyVisual?:boolean;
  stylesheets:string[];
  scripts:ScriptSource[];
}) {
  const page=stylesheets.find(href=>href.startsWith('/next-styles/'))?.split('/').pop()?.split('?')[0].replace('.css','')||'desktop';
  return <html lang="vi"><head>
    {stylesheets.map(href => <link key={href} rel="stylesheet" href={href} />)}
    {!legacyVisual && <link rel="stylesheet" href="/ui/system.css?v=1" />}
  </head><body className={bodyClass} data-page={page}>
    {children}
    <OperationalRuntime scripts={scripts} />
  </body></html>;
}
