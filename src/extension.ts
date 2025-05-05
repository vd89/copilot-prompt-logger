// src/extension.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CopilotLogger } from './logger';
import { ConfigManager } from './config';
import { CopilotApiInterceptor } from './copilot-api';

let logger: CopilotLogger;
let configManager: ConfigManager;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
	console.log('Copilot Prompt Logger extension is now active!');

	// Initialize the configuration manager
	configManager = new ConfigManager();

	// Initialize the logger
	logger = new CopilotLogger(configManager);

	// Register commands
	const enableLoggingCmd = vscode.commands.registerCommand('copilot-prompt-logger.enableLogging', () => {
		configManager.setEnabled(true);
		vscode.window.showInformationMessage('Copilot Prompt Logging is now enabled.');
		updateStatusBar();
	});

	const disableLoggingCmd = vscode.commands.registerCommand('copilot-prompt-logger.disableLogging', () => {
		configManager.setEnabled(false);
		vscode.window.showInformationMessage('Copilot Prompt Logging is now disabled.');
		updateStatusBar();
	});

	const openLogFileCmd = vscode.commands.registerCommand('copilot-prompt-logger.openLogFile', async () => {
		const logFilePath = await logger.getLogFilePath();
		if (fs.existsSync(logFilePath)) {
			const doc = await vscode.workspace.openTextDocument(logFilePath);
			await vscode.window.showTextDocument(doc);
		} else {
			vscode.window.showErrorMessage('Copilot Prompts log file does not exist yet.');
		}
	});

	// Add debug command to check log file path
	const checkLogPathCmd = vscode.commands.registerCommand('copilot-prompt-logger.checkLogPath', async () => {
		const logFilePath = await logger.getLogFilePath();
		vscode.window.showInformationMessage(`Log file path: ${logFilePath}`);

		// Try to create a test log entry
		await logger.logPrompt('Debug', 'Test Context', 'This is a test prompt from checkLogPath command');
		vscode.window.showInformationMessage(`Test log written. Check file at: ${logFilePath}`);
	});

	context.subscriptions.push(checkLogPathCmd);

	// Register a session start in the log file
	logger.logSessionStart();

	// Set up event listeners for Copilot
	setupCopilotListeners(context);

	// Add Copilot API interceptor
	const apiInterceptor = new CopilotApiInterceptor(logger);
	const hookSuccess = apiInterceptor.tryHookCopilotApi();

	if (hookSuccess) {
		vscode.window.showInformationMessage('Copilot API hook successful');
	} else {
		console.log('Could not hook into Copilot API directly, using fallback methods');
		// Start polling as a fallback
		const pollingDisposable = apiInterceptor.startPollingForChatInput();
		context.subscriptions.push(pollingDisposable);
	}

	// Register a special handler for clipboard content
	const clipboardHandler = vscode.commands.registerCommand('copilot-prompt-logger.checkClipboard', async () => {
		try {
			const text = await vscode.env.clipboard.readText();
			if (text && text.length > 10) {
				logger.logPrompt('Clipboard', 'Manual Clipboard Check', text);
				vscode.window.showInformationMessage('Clipboard content logged as potential prompt');
			}
		} catch (error) {
			console.error('Failed to access clipboard:', error);
		}
	});

	context.subscriptions.push(clipboardHandler);

	// Add configs, commands, and handlers to context subscriptions
	context.subscriptions.push(
		enableLoggingCmd,
		disableLoggingCmd,
		openLogFileCmd
	);

	// Register event listeners for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('copilotPromptLogger')) {
				configManager.reloadConfig();
				updateStatusBar();
			}
		})
	);

	// Create a status bar item
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	updateStatusBar();
	statusBarItem.command = 'copilot-prompt-logger.openLogFile';
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	// Create new command to manually log a prompt
	let logPromptCommand = vscode.commands.registerCommand('copilot-prompt-logger.logPrompt', async () => {
		const prompt = await vscode.window.showInputBox({
			placeHolder: 'Enter your prompt',
			prompt: 'Log a prompt to the prompt log file'
		});

		if (prompt) {
			const activeEditor = vscode.window.activeTextEditor;
			const fileName = activeEditor ? activeEditor.document.fileName : 'Manual Entry';
			const context = activeEditor ? activeEditor.document.getText() : '';

			await logger.logPrompt(fileName, context, prompt);
			vscode.window.showInformationMessage('Prompt logged successfully!');
		}
	});

	context.subscriptions.push(logPromptCommand);
}

function updateStatusBar () {
	if (!statusBarItem) { return; };

	if (configManager.isEnabled()) {
		statusBarItem.text = "$(github-copilot) Logger: On";
		statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
	} else {
		statusBarItem.text = "$(github-copilot) Logger: Off";
		statusBarItem.backgroundColor = undefined;
	}
}

function setupCopilotListeners (context: vscode.ExtensionContext) {
	// Listen for specific Copilot commands
	const commandListener = vscode.commands.registerCommand('github.copilot.chat.sendRequest', async (prompt: string) => {
		if (configManager.isEnabled() && prompt) {
			// Only log actual user chat inputs
			logger.logPrompt('Copilot Chat', 'User Input', prompt);
		}
		return prompt;
	});

	context.subscriptions.push(commandListener);

	// Use a more targeted approach to intercept Copilot commands
	const originalExecuteCommand = vscode.commands.executeCommand;
	// @ts-ignore - Replace the executeCommand function with our proxy
	vscode.commands.executeCommand = function (command, ...args) {
		if (configManager.isEnabled()) {
			// Only capture specific Copilot chat-related commands
			if (command === 'github.copilot.chat.sendRequest' ||
				command === 'github.copilot.interactiveSession.request') {

				// Only capture if the first argument is a string (the user's input)
				if (args && args.length > 0 && typeof args[ 0 ] === 'string') {
					const userInput = args[ 0 ];
					// Don't log system messages or empty inputs
					if (userInput && !userInput.startsWith('system:') && userInput.trim()) {
						logger.logPrompt('Copilot Chat', 'User Input', userInput.trim());
					}
				}
			}
		}
		return originalExecuteCommand.apply(vscode.commands, [ command, ...args ]);
	};

	// Setup a simple editor input listener for chat panels
	const inputBoxWatcher = vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (!configManager.isEnabled() || !editor) { return; };

		// Only focus on input boxes in Copilot panels
		if (editor.document.uri.scheme === 'memento' ||
			editor.document.uri.path.includes('copilot-chat-input')) {

			// Get the current document text
			const text = editor.document.getText();

			// We'll watch this document for changes
			const disposable = vscode.workspace.onDidChangeTextDocument((e) => {
				if (e.document === editor.document) {
					const currentText = e.document.getText();
					if (currentText && currentText !== text && currentText.trim()) {
						// Only log when user presses Enter/submits - not every keystroke
						vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup').then(() => {
							if (currentText.endsWith('\n') && currentText.trim()) {
								logger.logPrompt('Copilot Chat', 'User Input', currentText.trim());
							}
						});
					}
				}
			});

			// Clean up when editor changes
			context.subscriptions.push(disposable);
		}
	});

	context.subscriptions.push(inputBoxWatcher);

	// Create a webview panel to monitor focus and capture clipboard on submit
	let webviewProvider = vscode.window.registerWebviewViewProvider('copilot-prompt-logger.captureView', {
		resolveWebviewView (webviewView) {
			// Make the webview capture clipboard when Copilot is used
			webviewView.webview.html = `
				<html>
				<body>
					<div>Monitoring for Copilot prompts...</div>
					<script>
						window.addEventListener('focus', () => {
							// When focus returns to VS Code (after user submits to Copilot)
							navigator.clipboard.readText().then(text => {
								if (text && text.length > 5) {
									// Send captured text to extension
									vscode.postMessage({ type: 'clipboardContent', content: text });
								}
							});
						});
					</script>
				</body>
				</html>
			`;

			webviewView.webview.onDidReceiveMessage(message => {
				if (message.type === 'clipboardContent') {
					logger.logPrompt('Clipboard Capture', 'User Input', message.content);
				}
			});
		}
	});

	context.subscriptions.push(webviewProvider);

	// Listen for text document changes but be very selective
	const textDocChangeListener = vscode.workspace.onDidChangeTextDocument(event => {
		if (!configManager.isEnabled()) { return; };

		// Only consider specific documents that might be Copilot-related
		if (event.document.fileName.includes('copilot') ||
			event.document.uri.scheme === 'copilot-chat') {

			// Only consider significant changes
			const changes = event.contentChanges;

			if (changes.length > 0) {
				// We're looking for user input patterns, not machine-generated content
				for (const change of changes) {
					// Only consider reasonably sized inputs that might be user prompts
					// and ignore markdown formatting
					if (change.text &&
						change.text.length > 5 &&
						change.text.length < 1000 &&
						!change.text.includes('```') &&
						!change.text.includes('Copilot Prompts Log')) {

						// Check if this appears to be an actual user input
						const isUserInput = !change.text.includes('session') &&
							!change.text.startsWith('#') &&
							!change.text.includes('context');

						if (isUserInput) {
							logger.logPrompt('User Input', '', change.text.trim());
						}
					}
				}
			}
		}
	});

	context.subscriptions.push(textDocChangeListener);
}

export function deactivate () {
	// Log session end when extension is deactivated
	if (logger) {
		logger.logSessionEnd();
	}
}