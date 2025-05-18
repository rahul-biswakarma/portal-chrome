import './globals.css';

import { ViewTabs } from './components/view-tabs';
import { StatusBar } from './components/status-bar';
import { CustomizeView } from './components/views/customize-view/customize-view';
import { HierarchyView } from './components/views/hierarchy-view/hierarchy-view';
import { Settings } from './components/views/settings/settings';

import type { ViewTabsSchema } from './types';
import { AppProvider } from './contexts/app-context';
import { useState } from 'react';

const views: ViewTabsSchema[] = [
  {
    id: 'customize',
    trigger: 'Customize',
    content: <CustomizeView />,
  },
  {
    id: 'hierarchy',
    trigger: 'Class Hierarchy',
    content: <HierarchyView />,
  },
  {
    id: 'settings',
    trigger: 'Settings',
    content: <Settings />,
  },
];

function App() {
  const [activeTab, setActiveTab] = useState<string>('customize');

  return (
    <AppProvider>
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
        <div className="h-full overflow-hidden">
          <ViewTabs
            config={views}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        </div>
        <StatusBar />
      </div>
    </AppProvider>
  );
}

export default App;
