'use client';

import {useEffect, useRef, useState} from 'react';

export type ScriptSource = {src:string; type?:string};

/** Start the retained operational modules only after React has hydrated their DOM. */
export default function OperationalRuntime({scripts}:{scripts:ScriptSource[]}) {
  const started = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    // Strict Mode replays effects in development; operational subscriptions must start once.
    if (started.current) return;
    started.current = true;
    async function start() {
      for (const source of scripts) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          if (source.type) script.type = source.type;
          script.src = source.src;
          script.async = false;
          script.dataset.ifcRuntime = 'true';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Không tải được ' + source.src));
          document.body.append(script);
        });
      }
      document.documentElement.dataset.ifcReady = 'true';
    }
    start().catch(reason => {
      console.error(reason);
      setError('Không tải được ứng dụng. Kiểm tra kết nối rồi tải lại trang.');
    });
  }, [scripts]);
  return error ? <p role="alert" style={{position:'fixed',bottom:16,left:16,right:16,zIndex:100000,padding:16,background:'#fee2e2',color:'#7f1d1d'}}>{error}</p> : null;
}
