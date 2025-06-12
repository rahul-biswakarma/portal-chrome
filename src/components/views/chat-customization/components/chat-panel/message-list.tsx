// Message list component for displaying chat messages
import { useRef, useEffect } from 'react';
import { ScrollArea } from '@radix-ui/react-scroll-area';
import type { ChatMessage } from '../../types';

interface MessageListProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  onMessageSelect?: (messageId: string) => void;
}

export function MessageList({ messages, isLoading, onMessageSelect }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <ScrollArea className="flex-1 p-4">
      <div ref={scrollRef} className="space-y-4">
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            onClick={() => onMessageSelect?.(message.id)}
          />
        ))}
        
        {isLoading && (
          <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
            <span className="text-sm text-muted-foreground">AI is thinking...</span>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

interface MessageItemProps {
  message: ChatMessage;
  onClick?: () => void;
}

function MessageItem({ message, onClick }: MessageItemProps) {
  const isUser = message.type === 'user';
  const isSystem = message.type === 'system';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div
        className={`
          max-w-[80%] rounded-lg p-3 space-y-2
          ${isUser 
            ? 'bg-primary text-primary-foreground ml-4' 
            : isSystem
            ? 'bg-muted text-muted-foreground border border-border'
            : 'bg-muted mr-4'
          }
        `}
      >
        {/* Message content */}
        <div className="text-sm whitespace-pre-wrap">
          {message.content}
        </div>

        {/* Message metadata */}
        {message.metadata && (
          <MessageMetadata metadata={message.metadata} />
        )}

        {/* Timestamp */}
        <div className="text-xs opacity-70">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

interface MessageMetadataProps {
  metadata: NonNullable<ChatMessage['metadata']>;
}

function MessageMetadata({ metadata }: MessageMetadataProps) {
  const { cssChanges, suggestions, processingTime } = metadata;

  return (
    <div className="space-y-2 pt-2 border-t border-border/20">
      {/* CSS Changes */}
      {cssChanges && cssChanges.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium opacity-80">Applied Changes:</div>
          <div className="space-y-1">
            {cssChanges.map((change, index) => (
              <div key={index} className="text-xs bg-background/20 rounded px-2 py-1">
                <code className="font-mono">
                  {change.selector} → {change.property}: {change.newValue}
                </code>
                {change.confidence < 0.8 && (
                  <span className="ml-2 text-yellow-400">⚠</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {suggestions && suggestions.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium opacity-80">Suggestions:</div>
          <div className="space-y-1">
            {suggestions.map((suggestion, index) => (
              <div key={index} className="text-xs opacity-70">
                • {suggestion}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Processing time */}
      {processingTime && (
        <div className="text-xs opacity-50">
          Processed in {processingTime}ms
        </div>
      )}
    </div>
  );
} 