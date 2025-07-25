// Main Chat Customization View
import { useState, useEffect, useCallback } from 'react';
import { MessageCircle, Settings, History, Sparkles, X } from 'lucide-react';
import { MessageList } from './components/chat-panel/message-list';
import { MessageInput } from './components/chat-panel/message-input';
import { LLMService } from './services/llm.service';
import { ContextService } from './services/context.service';
import { CSSApplicationService } from './services/css-application.service';
import { useAppContext } from '@/contexts';
import { ErrorModal } from '@/components/ui/error-modal';

// Types for the Chat AI implementation
interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    cssChanges?: Array<{
      selector: string;
      property: string;
      oldValue: string;
      newValue: string;
      confidence: number;
    }>;

    processingTime?: number;
  };
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export function ChatCustomizationView() {
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [llmService] = useState(() => new LLMService());
  const [contextService] = useState(() => new ContextService());
  const [cssService] = useState(() => CSSApplicationService.getInstance());
  const [errorModal, setErrorModal] = useState<{
    isOpen: boolean;
    title: string;
    error: string | Error;
    details?: string;
  }>({
    isOpen: false,
    title: '',
    error: '',
    details: undefined,
  });
  const { setCssContent } = useAppContext();

  // Initialize chat session and context
  useEffect(() => {
    const initializeSession = async () => {
      const session: ChatSession = {
        id: `session_${Date.now()}`,
        title: `Chat ${new Date().toLocaleDateString()}`,
        messages: [
          {
            id: `msg_${Date.now()}`,
            type: 'system',
            content:
              "Welcome! I can help modify your website styles. Describe what you'd like to change, and I'll generate the appropriate CSS modifications.",
            timestamp: Date.now(),
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      setCurrentSession(session);

      // Initialize context (suggestions removed)
      try {
        await contextService.analyzeCurrentPage();
      } catch (error) {
        console.warn('Could not analyze page context:', error);
      }
    };

    initializeSession();
  }, [contextService, llmService]);

  // Handle sending messages
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!currentSession) return;

      const userMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        type: 'user',
        content,
        timestamp: Date.now(),
      };

      // Add user message
      setCurrentSession(prev =>
        prev
          ? {
              ...prev,
              messages: [...prev.messages, userMessage],
              updatedAt: Date.now(),
            }
          : null
      );

      setIsLoading(true);

      try {
        // Get current page context
        const context = await contextService.analyzeCurrentPage();

        // Process message with LLM service
        const llmResponse = await llmService.processMessage({
          userInput: content,
          context: {
            url: context.url,
            title: context.title,
            portalElements: context.portalElements,
          },
        });

        // Create assistant response message
        const assistantMessage: ChatMessage = {
          id: `msg_${Date.now()}`,
          type: 'assistant',
          content: `${llmResponse.understanding}\n\n${llmResponse.reasoning}`,
          timestamp: Date.now(),
          metadata: {
            cssChanges: llmResponse.cssChanges,
            processingTime: llmResponse.processingTime,
          },
        };

        setCurrentSession(prev =>
          prev
            ? {
                ...prev,
                messages: [...prev.messages, assistantMessage],
                updatedAt: Date.now(),
              }
            : null
        );

        // Suggestions removed from UI

        // Auto-apply CSS changes if they exist
        if (llmResponse.cssChanges && llmResponse.cssChanges.length > 0) {
          try {
            const applied = await cssService.applyCSSChanges(llmResponse.cssChanges, setCssContent);
            if (applied) {
              console.log('CSS changes applied successfully to page and CSS editor');
            } else {
              console.warn('Failed to apply CSS changes');
              setErrorModal({
                isOpen: true,
                title: 'CSS Application Error',
                error: 'Failed to apply CSS changes to the page',
                details:
                  'Check the browser console for more details about the CSS application failure.',
              });
            }
          } catch (error) {
            console.error('Error applying CSS changes:', error);
            setErrorModal({
              isOpen: true,
              title: 'CSS Application Error',
              error: error instanceof Error ? error : new Error(String(error)),
              details: error instanceof Error ? error.stack : undefined,
            });
          }
        }
      } catch (error) {
        console.error('Failed to process message:', error);

        // Show error modal with details
        setErrorModal({
          isOpen: true,
          title: 'Chat AI Processing Error',
          error: error instanceof Error ? error : new Error(String(error)),
          details: error instanceof Error ? error.stack : undefined,
        });

        // Also add a system message to the chat
        const errorMessage: ChatMessage = {
          id: `msg_${Date.now()}`,
          type: 'system',
          content:
            'Sorry, I encountered an error processing your request. Please check the error details and try again.',
          timestamp: Date.now(),
        };

        setCurrentSession(prev =>
          prev
            ? {
                ...prev,
                messages: [...prev.messages, errorMessage],
                updatedAt: Date.now(),
              }
            : null
        );
      } finally {
        setIsLoading(false);
      }
    },
    [currentSession, llmService, contextService]
  );

  // Handle message selection
  const handleMessageSelect = useCallback((messageId: string) => {
    console.log('Selected message:', messageId);
    // Could implement message editing or other actions
  }, []);

  // Handle clearing applied styles
  const handleClearStyles = useCallback(async () => {
    try {
      const cleared = await cssService.removeAppliedCSS(setCssContent);
      if (cleared) {
        console.log('Applied styles cleared successfully from page and CSS editor');
      } else {
        console.warn('Failed to clear applied styles');
      }
    } catch (error) {
      console.error('Error clearing applied styles:', error);
    }
  }, [cssService, setCssContent]);

  if (!currentSession) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/20">
        <div className="flex items-center gap-3">
          <MessageCircle className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold text-lg">Style Assistant</h2>
            <p className="text-sm text-muted-foreground">
              Modify your website with natural language
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleClearStyles}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            title="Clear applied styles"
          >
            <X className="h-4 w-4" />
          </button>
          <button className="p-2 hover:bg-muted rounded-lg transition-colors">
            <History className="h-4 w-4" />
          </button>
          <button className="p-2 hover:bg-muted rounded-lg transition-colors">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Chat Panel */}
      <div className="flex-1 flex flex-col min-h-0">
        <MessageList
          messages={currentSession.messages}
          isLoading={isLoading}
          onMessageSelect={handleMessageSelect}
        />

        <MessageInput
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          placeholder="Describe your styling changes..."
        />
      </div>

      {/* Status Bar */}
      <div className="px-4 py-2 bg-muted/20 border-t border-border">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>Messages: {currentSession.messages.length}</span>
            <span>Last updated: {new Date(currentSession.updatedAt).toLocaleTimeString()}</span>
          </div>
          <div className="flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            <span>AI-powered styling</span>
          </div>
        </div>
      </div>

      {/* Error Modal */}
      <ErrorModal
        isOpen={errorModal.isOpen}
        onClose={() => setErrorModal(prev => ({ ...prev, isOpen: false }))}
        title={errorModal.title}
        error={errorModal.error}
        details={errorModal.details}
      />
    </div>
  );
}
