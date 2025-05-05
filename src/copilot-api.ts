import * as vscode from 'vscode';
import { CopilotLogger } from './logger';

/**
 * Helper class to interact with GitHub Copilot's API if available
 */
export class CopilotApiInterceptor {
    private logger: CopilotLogger;
    private isHooked = false;
    private lastInput = '';
    private inputTimeout: NodeJS.Timeout | null = null;

    constructor(logger: CopilotLogger) {
        this.logger = logger;
    }

    /**
     * Try to hook into GitHub Copilot's API
     */
    public tryHookCopilotApi(): boolean {
        try {
            // Check if GitHub Copilot extension is available
            const copilotExtension = vscode.extensions.getExtension('GitHub.copilot');
            if (!copilotExtension) {
                console.log('GitHub Copilot extension not found');
                return false;
            }

            console.log('GitHub Copilot extension found');

            // Monitor clipboard for user inputs
            this.setupClipboardMonitoring();

            this.isHooked = true;
            return true;
        } catch (error) {
            console.error('Failed to hook into Copilot API:', error);
            return false;
        }
    }

    /**
     * Monitor clipboard for potential inputs
     */
    private setupClipboardMonitoring(): void {
        // Setup a polling mechanism to check clipboard
        setInterval(async () => {
            try {
                const clipboardText = await vscode.env.clipboard.readText();

                // Only process text that:
                // 1. Is not empty
                // 2. Is different from last captured input
                // 3. Is not too large (not a code block)
                // 4. Doesn't look like a log entry
                if (clipboardText &&
                    clipboardText !== this.lastInput &&
                    clipboardText.length > 5 &&
                    clipboardText.length < 500 &&
                    !clipboardText.includes('```') &&
                    !clipboardText.includes('Prompt at')) {

                    // Debounce to avoid capturing the same input multiple times
                    if (this.inputTimeout) {
                        clearTimeout(this.inputTimeout);
                    }

                    this.inputTimeout = setTimeout(() => {
                        this.lastInput = clipboardText;
                        this.logger.logPrompt('Clipboard', 'User Input', clipboardText);
                    }, 500);
                }
            } catch (error) {
                // Silent fail - clipboard access can fail
            }
        }, 2000); // Check every 2 seconds
    }

    /**
     * Alternative approach: Use a polling mechanism to check for chat input
     */
    public startPollingForChatInput(): vscode.Disposable {
        let lastCapturedText = '';

        // Poll for chat inputs
        const intervalId = setInterval(() => {
            // Try to find active editor with user input
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const document = editor.document;

                // Only focus on potential Copilot input areas
                if (document.uri.scheme === 'memento' ||
                    document.fileName.includes('chat') ||
                    document.uri.path.includes('input')) {

                    const text = document.getText();

                    // Only process text that looks like user input and is different from last captured text
                    if (text &&
                        text !== lastCapturedText &&
                        text.length > 5 &&
                        text.length < 500 &&
                        !text.includes('#') &&
                        !text.includes('```')) {

                        lastCapturedText = text;
                        this.logger.logPrompt('Chat Input', '', text);
                    }
                }
            }
        }, 3000); // Poll every 3 seconds to avoid performance issues

        // Return disposable to clear interval when extension is deactivated
        return {
            dispose: () => clearInterval(intervalId)
        };
    }
}
