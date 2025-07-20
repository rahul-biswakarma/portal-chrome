// Message input component for chat input with suggestions
import { useState, useRef, type KeyboardEvent } from 'react';
import { Send, Sparkles } from 'lucide-react';

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  suggestions?: string[];
  isLoading?: boolean;
  placeholder?: string;
}

export function MessageInput({
  onSendMessage,
  suggestions = [],
  isLoading = false,
  placeholder = 'Describe your styling changes...',
}: MessageInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (message.trim() && !isLoading) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setMessage(suggestion);
    textareaRef.current?.focus();
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  };

  return (
    <div className="border-t border-border p-4 bg-background">
      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Try these suggestions:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.slice(0, 3).map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="
                  px-3 py-1 text-sm bg-muted hover:bg-muted/80 
                  rounded-full transition-colors cursor-pointer
                  text-muted-foreground hover:text-foreground
                "
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-3">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={e => {
              setMessage(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            className="
              w-full resize-none rounded-lg border border-border bg-background
              px-3 py-2 text-sm placeholder:text-muted-foreground
              focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
              disabled:opacity-50 disabled:cursor-not-allowed
              min-h-[40px] max-h-[120px]
            "
            rows={1}
          />

          {/* Character count */}
          {message.length > 0 && (
            <div className="absolute -bottom-5 right-2 text-xs text-muted-foreground">
              {message.length}/2000
            </div>
          )}
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!message.trim() || isLoading}
          className="
            flex items-center justify-center h-10 w-10 rounded-lg
            bg-primary text-primary-foreground hover:bg-primary/90
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
          "
        >
          {isLoading ? (
            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Input hints */}
      <div className="mt-2 text-xs text-muted-foreground">
        Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Enter</kbd> to send,
        <kbd className="px-1 py-0.5 bg-muted rounded text-xs ml-1">Shift+Enter</kbd> for new line
      </div>
    </div>
  );
}
