import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ProcessingLogProps } from '../types';

export const ProcessingLog: React.FC<ProcessingLogProps> = ({
  logs,
  maxEntries = 20,
  showTimestamps = true,
}) => {
  const displayLogs = logs.slice(-maxEntries);

  const getBadgeVariant = (level: string) => {
    switch (level) {
      case 'error':
        return 'destructive' as const;
      case 'warning':
        return 'secondary' as const;
      case 'success':
        return 'default' as const;
      default:
        return 'outline' as const;
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Processing Log</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-60 w-full">
          <div className="space-y-2">
            {displayLogs.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No logs yet. Start processing to see activity.
              </p>
            ) : (
              displayLogs.map(log => (
                <div
                  key={log.id}
                  className="flex items-start gap-2 text-sm border-b border-gray-100 dark:border-gray-800 pb-2 last:border-b-0"
                >
                  <Badge variant={getBadgeVariant(log.level)} className="mt-0.5 text-xs min-w-fit">
                    {log.level}
                  </Badge>

                  {showTimestamps && (
                    <span className="text-gray-500 dark:text-gray-400 text-xs mt-0.5 min-w-fit">
                      {formatTime(log.timestamp)}
                    </span>
                  )}

                  {log.iteration && (
                    <Badge variant="outline" className="mt-0.5 text-xs min-w-fit">
                      #{log.iteration}
                    </Badge>
                  )}

                  <span className="flex-1 leading-5">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {logs.length > maxEntries && (
          <p className="text-xs text-gray-500 mt-2 text-center">
            Showing last {maxEntries} of {logs.length} entries
          </p>
        )}
      </CardContent>
    </Card>
  );
};
