import type { ViewTabsSchema } from '@/types';
import clsx from 'clsx';
import { Separator } from './ui/separator';

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
      <div className="flex-shrink-0">
        <div className="flex gap-0.5 sm:gap-1 md:gap-2 p-1 sm:p-1.5 md:p-2 min-h-[40px] sm:min-h-[44px] overflow-x-auto scrollbar-hide">
          <div className="flex gap-0.5 sm:gap-1 md:gap-2 items-center justify-center w-full sm:w-auto sm:mx-auto">
            {config.map(tab => (
              <div
                className={clsx(
                  'px-1.5 sm:px-2 md:px-3 py-1.5 md:py-2 hover:bg-muted/80 rounded cursor-pointer select-none font-medium text-xs md:text-sm transition-all duration-200 whitespace-nowrap flex-shrink-0 min-h-[36px] flex items-center justify-center border border-transparent',
                  activeTab === tab.id &&
                    'bg-secondary text-secondary-foreground border-border shadow-sm',
                  // Better touch targets on mobile
                  'min-w-[44px] sm:min-w-0'
                )}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                <div className="flex items-center gap-1.5">{tab.trigger}</div>
              </div>
            ))}
          </div>
        </div>
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
