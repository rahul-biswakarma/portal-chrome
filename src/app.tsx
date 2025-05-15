import './globals.css';

import { ViewTabs } from './components/view-tabs';
import { StatusBar } from './components/status-bar';
import { CustomizeView } from './components/views/customize-view/customize-view';
import type { ViewTabsSchema } from './types';
import { AppProvider } from './contexts/app-context';

const views: ViewTabsSchema[] = [
  {
    id: 'customize',
    trigger: 'Customize',
    content: <CustomizeView />,
  },
];

function App() {
  // const [, setApiKey] = useState<string | null>(null); // API key will be managed by context

  // useEffect(() => {
  //   const loadApiKey = async () => {
  //     try {
  //       const key = await getFromStorage<string | null>('openAIApiKey', null);
  //       // setApiKey(key); // This will be handled in context if needed for persistence
  //     } catch (error) {
  //       console.error('Error loading API key:', error);
  //     }
  //   };
  //   loadApiKey();
  // }, []);

  return (
    <AppProvider>
      <div className="grid grid-rows-[1fr_auto] h-screen bg-background text-foreground overflow-hidden">
        <div className="h-full overflow-hidden">
          <ViewTabs config={views} />
        </div>
        <StatusBar />
      </div>
    </AppProvider>
  );
}

export default App;
