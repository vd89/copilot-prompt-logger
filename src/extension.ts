// src/extension.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import { CopilotLogger } from './logger';
import { ConfigManager } from './config';
import { CopilotApiInterceptor } from './copilot-api';

let logger: CopilotLogger;
let configManager: ConfigManager;
let statusBarItem: vscode.StatusBarItem;
let copilotListenersDisposable: vscode.Disposable | null = null;

export function activate (context: vscode.ExtensionContext) {
	// Initialize the configuration manager
	configManager = new ConfigManager();

	// Initialize the logger
	logger = new CopilotLogger(configManager);

	// Log diagnostic info
	logger.logDiagnostic('Extension activated');

	// Register commands
	const enableLoggingCmd = vscode.commands.registerCommand('copilot-prompt-logger.enableLogging', () => {
		configManager.setEnabled(true);
		vscode.window.showInformationMessage('Copilot Prompt Logging is now enabled.');
		updateStatusBar();

		// Set up Copilot listeners when logging is enabled
		if (!copilotListenersDisposable) {
			logger.logDiagnostic('Setting up Copilot listeners');
			copilotListenersDisposable = setupCopilotListeners(context);
		}

		// Set up webview listener for chat interface

	});

	const disableLoggingCmd = vscode.commands.registerCommand('copilot-prompt-logger.disableLogging', () => {
		configManager.setEnabled(false);
		vscode.window.showInformationMessage('Copilot Prompt Logging is now disabled.');
		updateStatusBar();

		// Dispose of Copilot listeners when logging is disabled
		if (copilotListenersDisposable) {
			copilotListenersDisposable.dispose();
			copilotListenersDisposable = null;
		}

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

	// Register a session start in the log file
	logger.logSessionStart();

	// Setup both text editor and webview listeners
	if (configManager.isEnabled()) {
		// Setup editor text change monitoring
		copilotListenersDisposable = setupCopilotListeners(context);



		// Add the monitor DOM command for additional capture method

		context.subscriptions.push(
			copilotListenersDisposable,

		);
	}

	// Add Copilot API interceptor for alternative capture methods
	const apiInterceptor = new CopilotApiInterceptor(logger);
	const hookSuccess = apiInterceptor.tryHookCopilotApi();

	if (hookSuccess) {
		logger.logDiagnostic('Copilot API hook successful');
	} else {
		logger.logDiagnostic('Could not hook into Copilot API directly, using fallback methods');
		// Start polling as a fallback
		const pollingDisposable = apiInterceptor.startPollingForChatInput();
		context.subscriptions.push(pollingDisposable);
	}

	// Register a command to capture input from clipboard
	const captureClipboardCmd = vscode.commands.registerCommand('copilot-prompt-logger.captureFromClipboard', async () => {
		try {
			const clipboardText = await vscode.env.clipboard.readText();
			if (clipboardText && clipboardText.length > 5) {
				await logger.logUserInput('Clipboard', clipboardText);
				vscode.window.showInformationMessage('Captured prompt from clipboard');
			} else {
				vscode.window.showInformationMessage('Clipboard is empty or too short');
			}
		} catch (error) {
			console.error('Failed to read clipboard:', error);
			vscode.window.showErrorMessage('Failed to read from clipboard');
		}
	});

	// Add configs, commands, and handlers to context subscriptions
	context.subscriptions.push(
		enableLoggingCmd,
		disableLoggingCmd,
		openLogFileCmd,
		checkLogPathCmd,
		captureClipboardCmd
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

	// Create a status bar item with context menu
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	updateStatusBar();
	statusBarItem.command = 'copilot-prompt-logger.statusBarClick';
	statusBarItem.tooltip = 'Copilot Prompt Logger (click for options)';
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	// Register status bar click command to show quick menu
	const statusBarClickCmd = vscode.commands.registerCommand('copilot-prompt-logger.statusBarClick', () => {
		// Show quick menu with common operations
		vscode.window.showQuickPick([
			'Toggle Logging',
			'Open Log File',
			'Capture from Clipboard',
			'Reconnect to Chat'
		], {
			placeHolder: 'Copilot Prompt Logger Options'
		}).then(selected => {
			if (selected === 'Toggle Logging') {
				const newValue = !configManager.isEnabled();
				configManager.setEnabled(newValue);
				updateStatusBar();
				vscode.window.showInformationMessage(`Copilot Prompt Logging is now ${newValue ? 'enabled' : 'disabled'}`);
			} else if (selected === 'Open Log File') {
				vscode.commands.executeCommand('copilot-prompt-logger.openLogFile');
			} else if (selected === 'Capture from Clipboard') {
				vscode.commands.executeCommand('copilot-prompt-logger.captureFromClipboard');
			} else if (selected === 'Reconnect to Chat') {
				vscode.commands.executeCommand('copilot-prompt-logger.reconnectWebsocket');
			}
		});
	});

	context.subscriptions.push(statusBarClickCmd);

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

	// Add the 'logUserPrompt' command - simplified version for user-triggered logging
	const logUserPromptCmd = vscode.commands.registerCommand('copilot-prompt-logger.logUserPrompt', async () => {
		const prompt = await vscode.window.showInputBox({
			placeHolder: 'Enter your Copilot prompt',
			prompt: 'Log a prompt to the prompt log file'
		});

		if (prompt) {
			const editor = vscode.window.activeTextEditor;
			const fileName = editor ? editor.document.fileName : 'Manual Entry';

			// Use the simplified method for user inputs
			await logger.logUserInput(fileName, prompt);
			vscode.window.showInformationMessage('User prompt logged successfully!');
		}
	});

	context.subscriptions.push(logUserPromptCmd);
}

function updateStatusBar () {
	if (!statusBarItem) { return; }

	if (configManager.isEnabled()) {
		statusBarItem.text = "$(github-copilot) Logger: On";
		statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
	} else {
		statusBarItem.text = "$(github-copilot) Logger: Off";
		statusBarItem.backgroundColor = undefined;
	}
}

export function deactivate () {
	// Log session end when extension is deactivated
	if (logger) {
		logger.logSessionEnd();
	}
}

// Improved function for monitoring editor changes that might be Copilot prompts
function setupCopilotListeners (_context: vscode.ExtensionContext): vscode.Disposable {
	const disposables: vscode.Disposable[] = [];

	// Listen for text document changes
	const textChangeListener = vscode.workspace.onDidChangeTextDocument(event => {
		if (!configManager.isEnabled()) { return; }

		const editor = vscode.window.activeTextEditor;
		if (!editor || event.document !== editor.document) { return; }

		// Skip log files and non-code files
		if (editor.document.fileName.includes('prompt-log') ||
			editor.document.fileName.endsWith('.md')) {
			return;
		}

		// Process each change
		for (const change of event.contentChanges) {
			// Look for likely human-authored prompts
			if (change.text &&
				change.text.trim().length > 5 &&
				change.text.trim().length < 200) {

				// Check for typical prompt patterns
				const isLikelyPrompt =
					// Questions are often prompts
					change.text.includes('?') ||
					// Command-like starts
					/^(add|create|update|write|generate|fix|implement|refactor|optimize|show)/i.test(change.text) ||
					// Single line inputs that look like instructions
					(change.text.split('\n').length <= 2 && /^[A-Z].*[.!?]$/.test(change.text));

				if (isLikelyPrompt) {
					logger.logUserInput(editor.document.fileName, change.text);
				}
			}
		}
	});

	disposables.push(textChangeListener);

	// Also listen for selection changes to capture multi-line selections
	const selectionChangeListener = vscode.window.onDidChangeTextEditorSelection(event => {
		if (!configManager.isEnabled()) { return; }

		const editor = event.textEditor;

		// Check if selection is significant and looks like it might be a prompt
		if (editor && editor.selection && !editor.selection.isEmpty) {
			const selectedText = editor.document.getText(editor.selection);

			// Only consider selections that are reasonably sized and look like prompts
			if (selectedText &&
				selectedText.length > 15 &&
				selectedText.length < 500 &&
				// Look for likely comment starts or question marks
				(selectedText.includes('?') ||
					selectedText.trim().startsWith('//') ||
					selectedText.trim().startsWith('/*') ||
					selectedText.trim().startsWith('#'))) {

				// We don't log immediately to avoid spam
				// Instead, we could add selection to a candidate list
				// and log if the user does something like press Enter or Ctrl+Enter
				// This would require more complex key binding tracking
			}
		}
	});

	// Listen for Copilot chat panels if possible
	const chatPanelListener = vscode.window.onDidChangeActiveTextEditor(editor => {
		if (!configManager.isEnabled()) { return; }

		if (editor && editor.document.languageId === 'copilot-chat') {
			// This is a Copilot chat panel, we can monitor it
			// For now, we just log the active editor change
			logger.logDiagnostic('Active editor changed to Copilot chat panel');
		}
	});
	disposables.push(selectionChangeListener);
	disposables.push(chatPanelListener);

	return vscode.Disposable.from(...disposables);
}