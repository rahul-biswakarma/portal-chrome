import './globals.css';

import { ViewTabs } from './components/view-tabs';
import { ChatCustomizationView } from './components/views/chat-customization';
import { CssEditorView } from './components/views/css-editor-view/css-editor-view';
import { HierarchyView } from './components/views/hierarchy-view/hierarchy-view';
import { PilotModeView } from './components/views/pilot-mode';
import { Settings } from './components/views/settings/settings';
import { VisualPreferencesView } from './components/views/visual-preferences';

import { useState } from 'react';
import { AppProvider } from './contexts/app-context';
import type { ViewTabsSchema } from './types';

const views: ViewTabsSchema[] = [
  {
    id: 'pilot-mode',
    trigger: 'Pilot Mode',
    content: <PilotModeView />,
  },
  {
    id: 'css-editor',
    trigger: 'CSS Editor',
    content: <CssEditorView />,
  },
  {
    id: 'visual-preferences',
    trigger: 'Customizer',
    content: <VisualPreferencesView />,
  },
  {
    id: 'chat-customization',
    trigger: (
      <div className="flex items-center gap-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Chat AI
      </div>
    ),
    content: <ChatCustomizationView />,
  },

  {
    id: 'hierarchy',
    trigger: (
      <div className="flex items-center gap-2 w-5 h-5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          className="icon icon-tabler icons-tabler-outline icon-tabler-sitemap"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M3 15m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
          <path d="M15 15m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
          <path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
          <path d="M6 15v-1a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v1" />
          <path d="M12 9l0 3" />
        </svg>
      </div>
    ),
    content: <HierarchyView />,
  },
  {
    id: 'settings',
    trigger: (
      <div className="flex items-center gap-2 w-5 h-5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          className="icon icon-tabler icons-tabler-outline icon-tabler-settings"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" />
          <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
        </svg>
      </div>
    ),
    content: <Settings />,
  },
];

function App() {
  const [activeTab, setActiveTab] = useState<string>('pilot-mode');

  return (
    <AppProvider>
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
        <div className="h-full overflow-y-hidden overflow-x-hidden">
          <ViewTabs config={views} activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>
      </div>
    </AppProvider>
  );
}

export default App;
