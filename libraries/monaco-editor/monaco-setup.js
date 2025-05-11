// Monaco Editor Setup for Chrome Extension
self.MonacoEnvironment = {
  getWorkerUrl: function(workerId, label) {
    if (label === 'css' || label === 'scss' || label === 'less') {
      return chrome.runtime.getURL('libraries/monaco-editor/min/vs/language/css/cssWorker.js');
    }
    return chrome.runtime.getURL('libraries/monaco-editor/min/vs/base/worker/workerMain.js');
  }
};

// Initialize Monaco Editor
function initMonacoEditor(containerId, initialValue = '', language = 'css') {
  return new Promise((resolve) => {
    // Load Monaco Editor
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('libraries/monaco-editor/min/vs/loader.js');
    script.onload = () => {
      require.config({
        paths: {
          vs: chrome.runtime.getURL('libraries/monaco-editor/min/vs')
        }
      });

      require(['vs/editor/editor.main'], function() {
        const container = document.getElementById(containerId);
        if (!container) {
          console.error('Container element not found:', containerId);
          resolve(null);
          return;
        }

        const editor = monaco.editor.create(container, {
          value: initialValue,
          language: language,
          theme: 'vs-dark',
          automaticLayout: true,
          scrollBeyondLastLine: false,
          minimap: {
            enabled: false
          },
          scrollbar: {
            alwaysConsumeMouseWheel: false
          },
          fontSize: 14,
          lineNumbers: 'on',
          wordWrap: 'on',
          tabSize: 2,
          formatOnPaste: true,
          formatOnType: true
        });

        // Helper method to get value
        editor.getValue = function() {
          return editor.getModel().getValue();
        };

        // Helper method to set value with cleaning
        editor.setValue = function(text) {
          if (typeof text === 'string') {
            const cleanText = text
              .replace(/\u00A0/g, ' ')  // Replace non-breaking spaces
              .replace(/\u00C2/g, '')   // Remove the Â character
              .replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u0600-\u0604\u070F\u17B4\u17B5\u200C-\u200F\u2028-\u202F\u2060-\u206F\uFEFF\uFFF0-\uFFFF]/g, '');

            return editor.getModel().setValue(cleanText);
          }
          return editor.getModel().setValue(text);
        };

        // Format document function
        editor.formatDocument = function() {
          try {
            monaco.editor.getEditors()[0].getAction('editor.action.formatDocument').run();
          } catch (err) {
            console.error('Error formatting document:', err);
          }
        };

        // Add resize listener
        window.addEventListener('resize', function() {
          editor.layout();
        });

        resolve(editor);
      });
    };
    script.onerror = (err) => {
      console.error('Failed to load Monaco Editor:', err);
      resolve(null);
    };
    document.head.appendChild(script);
  });
}
