import type { ViewTabsSchema } from '@/types';
import { Separator } from './ui/separator';

export const ViewTabs = ({ config }: { config: ViewTabsSchema[] }) => {
  return (
    <div>
      <div className="flex flex-wrap gap-2 justify-center items-center p-2">
        {config.map((tab) => (
          <div
            className="p-2 hover:bg-card rounded cursor-pointer select-none"
            key={tab.id}
          >
            {tab.trigger}
          </div>
        ))}
      </div>
      <Separator />
      <div className="p-2 h-full">
        {config.map((tab) => (
          <div key={tab.id}>{tab.content}</div>
        ))}
      </div>
    </div>
  );
};
