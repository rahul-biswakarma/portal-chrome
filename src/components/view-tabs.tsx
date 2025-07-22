import type { ViewTabsSchema } from '@/types';
import { Separator } from './ui/separator';
import clsx from 'clsx';

export const ViewTabs = ({
  config,
  activeTab,
  setActiveTab,
}: {
  config: ViewTabsSchema[];
  activeTab: string | null;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
}) => {
  return (
    <div className="h-full flex flex-col">
      <div className="flex gap-2 justify-center items-center p-2 min-h-[40px] flex-shrink-0">
        {config.map(tab => (
          <div
            className={clsx(
              'px-3 py-1.5 hover:bg-muted rounded cursor-pointer select-none font-medium text-sm transition-colors',
              activeTab === tab.id && 'bg-secondary'
            )}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.trigger}
          </div>
        ))}
      </div>
      <Separator />
      <div className="flex-1 overflow-hidden">
        {config.map(tab => (
          <div className={clsx('h-full', activeTab !== tab.id && 'hidden')} key={tab.id}>
            <div className="h-full overflow-y-auto">{tab.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
