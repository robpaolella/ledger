import type { ReactNode } from 'react';
import { Switch } from '../../primitives';
import { Card } from '../ui';

interface Props {
  title: string;
  description: string;
  /** Right-hand control for set-up cards; omit for "Not set up yet". */
  switchProps?: { checked: boolean; onChange: (next: boolean) => void };
  /** Shown instead of the body when the extra isn't set up on this server. */
  notSetUp?: boolean;
  children?: ReactNode;
}

/** Shared card chrome for the Optional extras: title, description, switch and a body. */
export default function ExtraCard({ title, description, switchProps, notSetUp, children }: Props) {
  return (
    <Card>
      <div className={`flex items-start justify-between gap-4 px-4 md:px-6 py-[18px] ${notSetUp ? '' : 'border-b border-line'}`}>
        <div className="min-w-0">
          <div className="text-[17px] font-extrabold tracking-tight text-content">{title}</div>
          <div className="text-[13px] text-content-3 mt-1 leading-snug max-w-[640px]">{description}</div>
          {notSetUp && <div className="text-[13px] font-semibold text-content-2 mt-2.5">Not set up yet</div>}
        </div>
        {switchProps && <Switch {...switchProps} title={title} />}
      </div>
      {!notSetUp && children}
    </Card>
  );
}
