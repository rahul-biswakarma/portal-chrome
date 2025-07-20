import { useState } from 'react';
import { useAppContext } from '@/contexts';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getActiveTab } from '@/utils/tabs';
import { getPageStructure } from '@/utils/page-structure';
import { extractTailwindClasses } from '@/utils/tailwind';
import { extractComputedStyles } from '@/utils/computed-styles';
import { getGeminiApiKey, generatePromptWithGemini, generateCSSWithGemini } from '@/utils/gemini';
import { Progress } from '@/components/ui/progress';
import { LogMessages } from '@/constants/log-messages';
import { captureScreenshot } from '@/utils/screenshot';
import type { TreeNode } from '@/types/tree';
import type { TailwindClassData } from '@/types/tailwind';

// Helper function to get current CSS
const getCurrentCSS = async (tabId: number): Promise<string> => {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const styleEl = document.getElementById('portal-generated-css');
      return styleEl ? styleEl.textContent || '' : '';
    },
  });
  return result[0]?.result || '';
};

// Helper function to apply CSS
const applyCSS = async (tabId: number, css: string): Promise<void> => {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: cssContent => {
      let styleEl = document.getElementById('portal-generated-css');

      if (cssContent.trim() === '') {
        if (styleEl) {
          styleEl.remove();
        }
        return;
      }

      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'portal-generated-css';

        // Insert at the bottom of head for higher specificity (natural CSS cascade)
        // This allows overriding existing styles without !important
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = cssContent;
    },
    args: [css],
  });
};

export const PromptInput = () => {
  const [prompt, setPrompt] = useState('');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const { selectedImage, addLog } = useAppContext();

  const generateInitialPrompt = async () => {
    if (!selectedImage) {
      addLog('Please select a reference image first', 'warning');
      return;
    }

    try {
      setIsGeneratingPrompt(true);
      setProgress(10);
      addLog('Taking screenshot...', 'info');

      const tab = await getActiveTab();
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      // Take screenshot
      const screenshot = await captureScreenshot(tab.id);

      setProgress(30);
      addLog('Analyzing page structure...', 'info');
      const pageStructureStr = await getPageStructure(tab.id);
      const classHierarchy: TreeNode = {
        element: 'body',
        portalClasses: [],
        children: [],
      };
      const portalClassMatches = pageStructureStr.match(/portal-[a-zA-Z0-9-_]+/g) || [];
      if (portalClassMatches.length > 0) {
        classHierarchy.portalClasses = [...new Set(portalClassMatches)] as string[];
      }

      setProgress(50);
      addLog('Extracting Tailwind classes...', 'info');
      const rawTailwindData = (await extractTailwindClasses(tab.id)) || {};
      const tailwindData: TailwindClassData = {};
      Object.entries(rawTailwindData).forEach(([selector, classes]) => {
        if (Array.isArray(classes)) {
          tailwindData[selector] = classes;
        }
      });

      // Get computed styles
      addLog('Extracting computed styles...', 'info');
      const computedStyles = await extractComputedStyles(tab.id);

      // Get current CSS
      const currentCSS = await getCurrentCSS(tab.id);

      // Get Gemini API key
      const apiKey = await getGeminiApiKey();
      if (!apiKey) {
        throw new Error('Gemini API key not found');
      }

      // Create a new session ID
      const newSessionId = `session_${Date.now()}`;
      setSessionId(newSessionId);

      // Generate prompt using Gemini
      setProgress(75);
      const generatedPrompt = await generatePromptWithGemini(
        apiKey,
        selectedImage || '',
        screenshot,
        currentCSS,
        computedStyles,
        newSessionId
      );

      // Set the generated prompt
      setPrompt(generatedPrompt);
      setProgress(100);
      addLog('Prompt generated successfully', 'success');

      // Reset progress after a delay
      setTimeout(() => {
        setProgress(0);
      }, 1000);
    } catch (error) {
      console.error('Error generating prompt:', error);
      let errorMessage = 'Unknown error';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        errorMessage = 'API error - please check console for details';
      }

      addLog(`Error generating prompt: ${errorMessage}`, 'error');
      setProgress(0);
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt) {
      addLog('Please provide a prompt.', 'warning');
      return;
    }

    try {
      setProgress(10);
      addLog(LogMessages.SCREENSHOT_TAKING || 'Taking full page screenshot...', 'info');

      // Create a new session ID if we don't have one yet
      const currentSessionId = sessionId || `session_${Date.now()}`;
      if (!sessionId) {
        setSessionId(currentSessionId);
        addLog(`Created new chat session: ${currentSessionId}`, 'info');
      } else {
        addLog(`Using existing chat session: ${currentSessionId}`, 'info');
      }

      const tab = await getActiveTab();
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      // Take screenshot
      const screenshot = await captureScreenshot(tab.id);

      setProgress(20);
      addLog('Analyzing page structure...', 'info');
      const pageStructureStr = await getPageStructure(tab.id);
      const classHierarchy: TreeNode = {
        element: 'body',
        portalClasses: [],
        children: [],
      };
      const portalClassMatches = pageStructureStr.match(/portal-[a-zA-Z0-9-_]+/g) || [];
      if (portalClassMatches.length > 0) {
        classHierarchy.portalClasses = [...new Set(portalClassMatches)] as string[];
      }

      setProgress(30);
      addLog('Extracting Tailwind classes...', 'info');
      const rawTailwindData = (await extractTailwindClasses(tab.id)) || {};
      const tailwindData: TailwindClassData = {};
      Object.entries(rawTailwindData).forEach(([selector, classes]) => {
        if (Array.isArray(classes)) {
          tailwindData[selector] = classes;
        }
      });

      // Get computed styles
      addLog('Extracting computed styles...', 'info');
      const computedStyles = await extractComputedStyles(tab.id);

      // Get current CSS
      const currentCSS = await getCurrentCSS(tab.id);

      const apiKey = await getGeminiApiKey();
      if (!apiKey) {
        throw new Error('Gemini API key not found');
      }

      // Generate CSS using Gemini
      setProgress(50);
      const generatedCSS = await generateCSSWithGemini(
        apiKey,
        prompt,
        classHierarchy,
        tailwindData,
        currentCSS,
        selectedImage,
        screenshot,
        computedStyles,
        currentSessionId
      );

      // Apply the generated CSS
      setProgress(90);
      await applyCSS(tab.id, generatedCSS);

      setProgress(100);
      addLog('CSS generated and applied successfully', 'success');

      // Reset progress after a delay
      setTimeout(() => {
        setProgress(0);
      }, 1000);
    } catch (error) {
      console.error('Error generating CSS:', error);
      let errorMessage = 'Unknown error';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        errorMessage = 'API error - please check console for details';
      }

      addLog(`Error generating CSS: ${errorMessage}`, 'error');
      setProgress(0);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="prompt" className="text-sm font-medium text-foreground">
            Prompt
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={generateInitialPrompt}
            disabled={isGeneratingPrompt}
          >
            {isGeneratingPrompt ? 'Generating...' : 'Generate Prompt'}
          </Button>
        </div>
        <Textarea
          id="prompt"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Describe the changes you want to make..."
          className="min-h-[100px]"
        />
      </div>

      {progress > 0 && (
        <div className="flex flex-col gap-2">
          <Progress value={progress} className="w-full" />
          <p className="text-xs text-muted-foreground text-center">{progress}% complete</p>
        </div>
      )}

      <Button onClick={handleGenerate} disabled={!prompt || isGeneratingPrompt} className="w-full">
        Generate CSS
      </Button>
    </div>
  );
};
