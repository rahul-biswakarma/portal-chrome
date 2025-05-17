import { useState } from 'react';
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
import { AlertCircle, CheckCircle, Info, Clock, XCircle } from 'lucide-react';

export const StatusBar = () => {
  const { logs, currentLog } = useLogger();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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

  return (
    <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
      <DrawerTrigger asChild>
        <div
          className="flex items-center justify-between border-t border-border p-2 bg-card max-h-[32px] h-full cursor-pointer"
          onClick={() => setIsDrawerOpen(true)}
        >
          <div className="flex items-center gap-2 text-sm">
            {currentLog ? (
              <>
                {getIconForLevel(currentLog.level)}
                <span className="truncate max-w-[500px]">
                  {currentLog.message}
                </span>
              </>
            ) : (
              <>
                <Clock size={16} className="text-muted-foreground" />
                <span className="text-muted-foreground text-xs truncate max-w-full">
                  Ready
                </span>
              </>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {logs.length > 0
              ? `${logs.length} ${logs.length === 1 ? 'action' : 'actions'}`
              : ''}
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
