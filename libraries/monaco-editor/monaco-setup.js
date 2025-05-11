// Monaco Editor Setup for Chrome Extension
self.MonacoEnvironment = {
  getWorkerUrl: function(workerId, label) {
    try {
      if (label === 'css' || label === 'scss' || label === 'less') {
        return chrome.runtime.getURL('libraries/monaco-editor/min/vs/language/css/cssWorker.js');
      }
      return chrome.runtime.getURL('libraries/monaco-editor/min/vs/base/worker/workerMain.js');
    } catch (err) {
      console.error('Error getting worker URL:', err);
      // Fallback to relative paths if chrome.runtime not available
      if (label === 'css' || label === 'scss' || label === 'less') {
        return 'libraries/monaco-editor/min/vs/language/css/cssWorker.js';
      }
      return 'libraries/monaco-editor/min/vs/base/worker/workerMain.js';
    }
  }
};

// Initialize Monaco Editor
function initMonacoEditor(containerId, initialValue = '', language = 'css') {
  return new Promise((resolve) => {
    try {
      // Check if Monaco is already loaded
      if (typeof monaco !== 'undefined') {
        console.log('Monaco already loaded, initializing editor directly');
        initializeEditor();
        return;
      }

      // Load Monaco Editor
      const script = document.createElement('script');
      try {
        script.src = chrome.runtime.getURL('libraries/monaco-editor/min/vs/loader.js');
      } catch (err) {
        console.warn('Failed to use chrome.runtime.getURL, falling back to relative path');
        script.src = 'libraries/monaco-editor/min/vs/loader.js';
      }

      script.onload = () => {
        try {
          let vsPath;
          try {
            vsPath = chrome.runtime.getURL('libraries/monaco-editor/min/vs');
          } catch (err) {
            console.warn('Failed to use chrome.runtime.getURL for vs path, using relative path');
            vsPath = 'libraries/monaco-editor/min/vs';
          }

          require.config({
            paths: {
              vs: vsPath
            },
            // Add error callback
            catchError: true,
            onError: function(err) {
              console.error('Require JS error:', err);
              showErrorMessage('Failed to load Monaco Editor modules. Try refreshing the page.');
            }
          });

          // Add a timeout to detect loading issues
          const loadTimeout = setTimeout(() => {
            console.error('Timeout loading Monaco editor');
            showErrorMessage('Timeout loading editor components. Try refreshing the page.');
            resolve(null);
          }, 10000);

          require(['vs/editor/editor.main'], function() {
            clearTimeout(loadTimeout);
            initializeEditor();
          }, function(err) {
            clearTimeout(loadTimeout);
            console.error('Failed to load editor modules:', err);
            showErrorMessage('Failed to load editor components. Try refreshing the page.');
            resolve(null);
          });
        } catch (err) {
          console.error('Error in Monaco loader configuration:', err);
          showErrorMessage('Error initializing editor configuration');
          resolve(null);
        }
      };

      script.onerror = (err) => {
        console.error('Failed to load Monaco Editor script:', err);
        showErrorMessage('Failed to load editor script. Try refreshing the page.');
        resolve(null);
      };

      document.head.appendChild(script);
    } catch (err) {
      console.error('Critical error initializing Monaco:', err);
      showErrorMessage('Critical error initializing editor');
      resolve(null);
    }

    // Function to show an error message in the editor container
    function showErrorMessage(message) {
      try {
        const container = document.getElementById(containerId);
        if (container) {
          container.innerHTML = `
            <div style="color: #f44336; padding: 20px; text-align: center; background: #333; border-radius: 4px;">
              <h3>Editor Error</h3>
              <p>${message}</p>
              <button onclick="window.location.reload()" style="background: #555; color: white; border: none; padding: 8px 16px; margin-top: 10px; cursor: pointer; border-radius: 4px;">Refresh Page</button>
            </div>
          `;
        }
      } catch (err) {
        console.error('Error showing error message:', err);
      }
    }

    // Helper function to initialize the editor
    function initializeEditor() {
      try {
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

        // Helper method to set value without any cleaning
        editor.setValue = function(text) {
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
      } catch (err) {
        console.error('Error creating Monaco editor:', err);
        showErrorMessage('Error creating editor instance');
        resolve(null);
      }
    }
  });
}
