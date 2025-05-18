import { useState, useContext } from 'react';
import { Button } from './ui/button';
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from './ui/drawer';
import { useLogger, type LogEntry } from '@/services/logger';
import {
  AlertCircle,
  CheckCircle,
  Info,
  Clock,
  XCircle,
  Loader2,
  CloudIcon,
} from 'lucide-react';
import { useProgressStore } from '@/stores/progress-store';
import { AppContext } from '@/contexts/app-context';

// Function to render the icon based on log level
const getIconForLevel = (level: LogEntry['level'], size = 16) => {
  switch (level) {
    case 'success':
      return <CheckCircle size={size} className="text-green-500" />;
    case 'warning':
      return <AlertCircle size={size} className="text-amber-500" />;
    case 'error':
      return <XCircle size={size} className="text-red-500" />;
    case 'info':
    default:
      return <Info size={size} className="text-blue-500" />;
  }
};

// Format timestamp
const formatTime = (date: Date) => {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const StatusBar = () => {
  const { logs, currentLog } = useLogger();
  const { progress, isVisible } = useProgressStore();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const appContext = useContext(AppContext);

  if (!appContext) {
    throw new Error('StatusBar must be used within an AppProvider');
  }

  const { devRevCssStage } = appContext;

  // Determine what to show in the status bar
  const getStatusContent = () => {
    // Show generation progress first
    if (isVisible && progress > 0) {
      return (
        <>
          <Loader2 size={16} className="animate-spin text-blue-500" />
          <span className="truncate max-w-[500px]">
            {currentLog?.message || 'Generating CSS...'}
          </span>
        </>
      );
    }

    // Then check for DevRev CSS loading states
    if (devRevCssStage === 'loading') {
      return (
        <>
          <Loader2 size={16} className="animate-spin text-blue-500" />
          <span className="truncate max-w-[500px]">
            Loading CSS from DevRev...
          </span>
        </>
      );
    }

    if (devRevCssStage === 'loaded') {
      return (
        <>
          <CloudIcon size={16} className="text-green-500" />
          <span className="truncate max-w-[500px]">CSS loaded from DevRev</span>
        </>
      );
    }

    if (devRevCssStage === 'error') {
      return (
        <>
          <XCircle size={16} className="text-red-500" />
          <span className="truncate max-w-[500px]">
            Error loading CSS from DevRev
          </span>
        </>
      );
    }

    // Finally, show the current log message or ready state
    if (currentLog) {
      return (
        <>
          {getIconForLevel(currentLog.level)}
          <span className="truncate max-w-[500px]">{currentLog.message}</span>
        </>
      );
    }

    return (
      <>
        <Clock size={16} className="text-muted-foreground" />
        <span className="text-muted-foreground text-xs truncate max-w-full">
          Ready
        </span>
      </>
    );
  };

  return (
    <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
      <DrawerTrigger asChild>
        <div
          className="flex flex-col border-t border-border bg-card p-1 h-fit cursor-pointer text-xs truncate max-w-full overflow-hidden"
          onClick={() => setIsDrawerOpen(true)}
        >
          <div className="flex items-center justify-between p-2">
            <div className="flex items-center gap-2 text-xs">
              {getStatusContent()}
            </div>
            {isVisible && progress > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {Math.round(progress)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </DrawerTrigger>

      <DrawerContent className="max-h-[80vh]">
        <DrawerHeader>
          <DrawerTitle>Activity Log</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-2 overflow-y-auto max-h-[calc(80vh-120px)]">
          {logs.length > 0 ? (
            <div className="flex flex-col gap-2">
              {logs.map((log: LogEntry) => (
                <div
                  key={log.id}
                  className="flex items-start gap-2 py-2 border-b border-border"
                >
                  <div className="mt-0.5">{getIconForLevel(log.level)}</div>
                  <div className="flex-1">
                    <div className="text-sm">{log.message}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatTime(log.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No activity logs yet
            </div>
          )}
        </div>

        <DrawerFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDrawerOpen(false)}
          >
            Close
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
