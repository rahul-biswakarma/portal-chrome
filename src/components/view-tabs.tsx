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
    <div className="h-full flex-1 flex flex-col grow">
      <div className="flex gap-2 justify-center items-center p-2 overflow-x-auto whitespace-nowrap">
        {config.map(tab => (
          <div
            className={clsx(
              'px-2 py-1 hover:bg-mute rounded cursor-pointer select-none font-medium',
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
      <div className="h-full overflow-hidden">
        {config.map(tab => (
          <div
            className={clsx('h-full overflow-y-auto', activeTab !== tab.id && 'hidden')}
            key={tab.id}
          >
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
};
