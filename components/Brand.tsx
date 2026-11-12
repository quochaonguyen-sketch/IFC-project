import Icon from './Icon';
import type {ReactNode} from 'react';

export default function Brand({subtitle='Quản lý bàn giao'}:{subtitle?:ReactNode}) {
  return <div className="ui-brand"><span className="ui-brand-mark"><Icon name="package" /></span><div className="ui-brand-copy"><strong>IFC Handover</strong><span>{subtitle}</span></div></div>;
}
