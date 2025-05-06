// src/copilot-webview-listener.ts
import * as vscode from 'vscode';
import { CopilotLogger } from './logger';

/**
 * Handles capturing prompts from Copilot's WebView interface
 */
export class CopilotWebviewListener {
  private logger: CopilotLogger;
  private disposables: vscode.Disposable[] = [];
  private messageListener: vscode.Disposable | null = null;
  private webviewPanel: vscode.WebviewPanel | null = null;

  constructor (logger: CopilotLogger) {
    this.logger = logger;
  }

  /**
   * Register listeners for Copilot chat panels
   */
  public register (): vscode.Disposable {
    // Monitor for WebView panel creation
    const webviewDisposable = vscode.window.registerWebviewPanelSerializer('github.copilot.chat', {
      deserializeWebviewPanel: async (webviewPanel: vscode.WebviewPanel) => {
        this.setupWebviewListener(webviewPanel);
      }
    });

    // Also watch for new WebView panels being created
    const onDidCreateWebviewPanel = vscode.window.createWebviewPanel(
      'github.copilot.chat', // viewType
      'Copilot Chat',        // title
      vscode.ViewColumn.One, // showOptions
      {}                     // options
    );

    // Check if this is a Copilot chat panel
    if (onDidCreateWebviewPanel.viewType === 'github.copilot.chat' ||
      onDidCreateWebviewPanel.title.includes('Copilot') ||
      onDidCreateWebviewPanel.title.includes('copilot')) {
      this.setupWebviewListener(onDidCreateWebviewPanel);
    }

    // Look for existing Copilot panels
    this.findExistingCopilotPanels();

    // Add command to manually trigger websocket connection
    const reconnectCommand = vscode.commands.registerCommand('copilot-prompt-logger.reconnectWebsocket', () => {
      this.findExistingCopilotPanels();
      vscode.window.showInformationMessage('Attempted to reconnect to Copilot chat panels');
    });

    this.disposables.push(webviewDisposable, onDidCreateWebviewPanel, reconnectCommand);

    // Return a disposable that cleans up all listeners
    return {
      dispose: () => {
        this.disposables.forEach(d => d.dispose());
        if (this.messageListener) {
          this.messageListener.dispose();
        }
      }
    };
  }

  /**
   * Find any existing Copilot panels that are already open
   */
  private findExistingCopilotPanels (): void {
    // This is a workaround as there's no direct API to get all open webview panels
    // The best we can do is try to access them indirectly

    // First, try looking for the Copilot view in the side panel
    const copilotViewId = 'github.copilot.chat';
    vscode.commands.executeCommand('workbench.view.extension.' + copilotViewId)
      .then(() => {
        vscode.window.showInformationMessage('Connected to Copilot chat view');
      })
      .then(undefined, err => {
        // Silently fail - view might not exist
        console.log('Could not find Copilot view:', err);
      });

    // Try activating the Copilot extension which might help us find panels
    vscode.extensions.getExtension('GitHub.copilot')?.activate().then(() => {
      console.log('Activated Copilot extension');
    });

    // Look for active text editors that might contain webview panels
    vscode.window.visibleTextEditors.forEach(editor => {
      if (editor.document.uri.scheme === 'vscode-webview') {
        console.log('Found potential webview editor');
      }
    });
  }

  /**
   * Set up a listener for a Copilot webview panel
   */
  private setupWebviewListener (panel: vscode.WebviewPanel): void {
    this.webviewPanel = panel;
    console.log('Setting up listener for Copilot chat panel');

    // Clean up previous listener if any
    if (this.messageListener) {
      this.messageListener.dispose();
    }

    // Inject a script into the webview to capture user input
    this.injectCaptureScript(panel.webview);

    // Set up listener for messages from webview
    this.messageListener = panel.webview.onDidReceiveMessage(message => {
      if (message.type === 'userInput' && message.text) {
        console.log('Captured user input from Copilot chat:', message.text);
        this.logger.logUserInput('Copilot Chat', message.text);
      }
    });

    // Also capture when the panel is disposed
    panel.onDidDispose(() => {
      console.log('Copilot chat panel closed');
      if (this.messageListener) {
        this.messageListener.dispose();
        this.messageListener = null;
      }
      this.webviewPanel = null;
    });
  }

  /**
   * Inject a script into the webview to capture user input
   */
  private injectCaptureScript (webview: vscode.Webview): void {
    // This is a best-effort approach as webview injection might be restricted
    try {
      webview.html = webview.html.replace(
        '</head>',
        `<script>
                    (function() {
                        // Listen for input events in the chat interface
                        document.addEventListener('input', function(e) {
                            if (e.target &&
                                (e.target.tagName === 'TEXTAREA' ||
                                 e.target.tagName === 'INPUT' ||
                                 e.target.getAttribute('role') === 'textbox')) {
                                // Capture text when Enter is pressed
                                e.target.addEventListener('keydown', function(ke) {
                                    if (ke.key === 'Enter' && !ke.shiftKey) {
                                        const text = e.target.value;
                                        if (text && text.trim()) {
                                            // Send message to extension
                                            const vscode = acquireVsCodeApi();
                                            vscode.postMessage({
                                                type: 'userInput',
                                                text: text
                                            });
                                        }
                                    }
                                });
                            }
                        });

                        // Also watch for click events on send buttons
                        document.addEventListener('click', function(e) {
                            if (e.target &&
                                (e.target.classList.contains('send-button') ||
                                 e.target.getAttribute('aria-label') === 'Send message')) {

                                // Find associated input field
                                const inputField = document.querySelector('textarea') ||
                                                  document.querySelector('[role="textbox"]');

                                if (inputField && inputField.value && inputField.value.trim()) {
                                    // Send message to extension
                                    const vscode = acquireVsCodeApi();
                                    vscode.postMessage({
                                        type: 'userInput',
                                        text: inputField.value
                                    });
                                }
                            }
                        });
                    })();
                </script></head>`
      );
    } catch (error) {
      console.error('Failed to inject capture script:', error);
    }
  }

  /**
   * Alternative method: Use DOM observation for capturing chat
   * This can be enabled to try a different approach if needed
   */
  public monitorWebviewDOM (): vscode.Disposable {
    // Command to monitor chat interface via DOM
    const disposable = vscode.commands.registerCommand('copilot-prompt-logger.monitorChatDOM', () => {
      // Try to find Copilot chat UI elements
      if (this.webviewPanel) {
        try {
          this.webviewPanel.webview.postMessage({
            command: 'observeDOM',
            selector: '.copilot-chat-input, [role="textbox"]'
          });
        } catch (error) {
          console.error('Failed to send message to webview:', error);
        }
      } else {
        vscode.window.showInformationMessage('No active Copilot chat panel found');
      }
    });

    return disposable;
  }
}