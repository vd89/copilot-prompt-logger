// src/logger.ts - Updated with improved chat logging
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import moment from 'moment';
import { ConfigManager } from './config';

export class CopilotLogger {
  private configManager: ConfigManager;
  private outputChannel: vscode.OutputChannel;
  // Recent prompts cache to avoid duplicates
  private recentPrompts: string[] = [];
  private readonly MAX_RECENT_PROMPTS = 20;

  constructor (configManager: ConfigManager) {
    this.configManager = configManager;
    this.outputChannel = vscode.window.createOutputChannel('Copilot Prompt Logger');
    this.outputChannel.appendLine('Logger initialized');
  }

  // Helper method for retry logic
  private async appendWithRetry (
    filepath: string,
    content: string,
    options: { maxRetries: number, delay: number }
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      try {
        fs.appendFileSync(filepath, content, 'utf8');
        return; // Success
      } catch (error) {
        console.warn(`Append attempt ${attempt + 1} failed:`, error);
        lastError = error as Error;

        if (attempt < options.maxRetries) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, options.delay));
        }
      }
    }

    // All retries failed
    throw new Error(`Failed to append after ${options.maxRetries} retries: ${lastError?.message}`);
  }

  /**
   * Get the full path to the log file
   */
  public async getLogFilePath (): Promise<string> {
    // Try to use workspace folder first
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
        const rootPath = workspaceFolders[ 0 ].uri.fsPath;
        const now = new Date();
        const dateString = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;

        // Create consistent folder structure
        const folderPath = path.join(rootPath, 'copilot-prompts');

        // Ensure directory exists
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }

        return path.join(folderPath, `prompt-log-${dateString}.md`);
      }
    } catch (error) {
      this.outputChannel.appendLine(`Workspace folder error: ${error}`);
    }

    // Fall back to user's home directory if no workspace
    const homeDir = os.homedir();
    const now = new Date();
    const dateString = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    const folderPath = path.join(homeDir, '.vscode-copilot-logs');

    // Ensure directory exists
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    return path.join(folderPath, `prompt-log-${dateString}.md`);
  }

  /**
   * Initialize the log file if it doesn't exist
   */
  private async initLogFile (): Promise<string> {
    try {
      const logFilePath = await this.getLogFilePath();
      const dirPath = path.dirname(logFilePath);

      // Create directory with more robust error handling
      if (!fs.existsSync(dirPath)) {
        try {
          fs.mkdirSync(dirPath, { recursive: true });
          this.outputChannel.appendLine(`Created directory: ${dirPath}`);
        } catch (dirError) {
          this.outputChannel.appendLine(`Failed to create directory ${dirPath}: ${dirError}`);

          // Try an alternative location if workspace folder creation fails
          const homeDir = process.env.HOME || process.env.USERPROFILE;
          if (homeDir) {
            const altDir = path.join(homeDir, '.vscode', 'copilot-prompts');
            fs.mkdirSync(altDir, { recursive: true });
            this.outputChannel.appendLine(`Created alternative directory: ${altDir}`);
            return path.join(altDir, path.basename(logFilePath));
          }
          throw dirError;
        }
      }

      // Create log file with header if it doesn't exist
      if (!fs.existsSync(logFilePath)) {
        const header = `# GitHub Copilot Prompts Log - ${new Date().toLocaleDateString()}\nThis file contains logs of prompts sent to GitHub Copilot.\n\n`;
        try {
          fs.writeFileSync(logFilePath, header, 'utf8');
          this.outputChannel.appendLine(`Created new log file at: ${logFilePath}`);
        } catch (fileError) {
          this.outputChannel.appendLine(`Failed to create log file ${logFilePath}: ${fileError}`);
          throw fileError;
        }
      }

      return logFilePath;
    } catch (error) {
      console.error('Failed to initialize log file:', error);
      vscode.window.showErrorMessage(`Failed to initialize log file: ${error}`);
      throw error;
    }
  }

  /**
   * Append content to the log file
   */
  private async appendToLog (content: string): Promise<void> {
    if (!this.configManager.isEnabled()) {
      return;
    }

    if (!content || content.trim().length === 0) {
      this.outputChannel.appendLine('Skipping empty content');
      return;
    }

    try {
      const logFilePath = await this.initLogFile();

      try {
        // Try to append with retry logic
        await this.appendWithRetry(logFilePath, content, {
          maxRetries: 3,
          delay: 100
        });

        this.outputChannel.appendLine(`Logged content to: ${logFilePath}`);
        vscode.window.setStatusBarMessage(`Logged to ${path.basename(logFilePath)}`, 3000);
      } catch (appendError) {
        // If append fails after retries, try a different approach
        this.outputChannel.appendLine(`Append with retry failed: ${appendError}`);

        // Try to open file in write mode and append that way
        const currentContent = fs.existsSync(logFilePath) ?
          fs.readFileSync(logFilePath, 'utf8') : '';

        fs.writeFileSync(logFilePath, currentContent + content, 'utf8');
        this.outputChannel.appendLine('Logged content using write method');
      }
    } catch (error) {
      console.error('Failed to append to log file:', error);
      vscode.window.showErrorMessage(`Failed to append to log file: ${error}`);
    }
  }

  /**
   * Log a session start
   */
  public async logSessionStart (): Promise<void> {
    const timestamp = moment().format(this.configManager.getTimestampFormat());
    const content = `\n## Session Started: ${timestamp}\n\n`;
    await this.appendToLog(content);
  }

  /**
   * Log a session end
   */
  public async logSessionEnd (): Promise<void> {
    const timestamp = moment().format(this.configManager.getTimestampFormat());
    const content = `\n## Session Ended: ${timestamp}\n\n`;
    await this.appendToLog(content);
  }

  /**
   * Log a prompt to Copilot with improved filtering
   */
  public async logPrompt (fileName: string, context: string, promptText: string): Promise<void> {
    if (!promptText || promptText.trim().length === 0) {
      return; // Skip empty prompts
    }

    // Skip duplicates by keeping track of recently logged prompts
    if (this.isDuplicate(promptText)) {
      console.log('Skipping duplicate prompt');
      return;
    }

    // Clean up the prompt to exclude processing logs and metadata
    const cleanPrompt = this.cleanupPrompt(promptText);

    // Skip if still empty after cleanup or if it looks like a log entry rather than user input
    if (!cleanPrompt ||
      cleanPrompt.trim().length === 0 ||
      this.isSystemMessage(cleanPrompt)) {
      console.log('Skipping empty or system message');
      return;
    }

    const captureMode = this.configManager.getCaptureMode();

    // If capture mode is not userInputOnly, don't filter responses
    if (captureMode === 'userInputOnly' && this.looksLikeResponse(cleanPrompt)) {
      console.log('Skipping content that looks like a response');
      return;
    }

    // Save this prompt to prevent duplicates
    this.rememberPrompt(cleanPrompt);

    const timestamp = moment().format(this.configManager.getTimestampFormat());
    const relativePath = typeof fileName === 'string' ?
      vscode.workspace.asRelativePath(fileName, false) : 'Copilot Chat';

    // Format the log entry - keep it simple and focused on the actual prompt
    let content = `\n### User Prompt at ${timestamp}\n\n`;
    content += `Source: ${relativePath}\n\n`;

    // Only include context if it's meaningful and different from the prompt
    if (this.shouldIncludeContext(context, cleanPrompt)) {
      const truncatedContext = this.truncateIfNeeded(context, 500);
      content += `#### Context\n\n\`\`\`\n${truncatedContext}\n\`\`\`\n\n`;
    }

    // Add prompt section - this is the main focus
    content += `#### Input\n\n\`\`\`\n${cleanPrompt}\n\`\`\`\n\n`;

    // Add separator
    content += `---\n`;

    await this.appendToLog(content);
    this.outputChannel.appendLine(`Logged prompt: "${cleanPrompt.substring(0, 30)}..."`);
  }

  /**
   * Log a user input prompt - simplified version for chat messages
   * This method specifically targets capturing the user's original prompt
   */
  public async logUserInput (fileName: string, promptText: string): Promise<void> {
    if (!promptText || promptText.trim().length === 0) {
      return; // Skip empty prompts
    }

    // Minimal cleanup for user input
    promptText = promptText.trim();

    // Simple check to prevent obvious duplicates
    if (this.isDuplicate(promptText)) {
      this.outputChannel.appendLine('Skipping duplicate prompt');
      return;
    }

    // Add to recent prompts
    this.recentPrompts.unshift(promptText);
    if (this.recentPrompts.length > this.MAX_RECENT_PROMPTS) {
      this.recentPrompts.pop();
    }

    // Create a user-friendly log entry
    const timestamp = moment().format(this.configManager.getTimestampFormat());
    const source = typeof fileName === 'string' ?
      (fileName === 'Copilot Chat' ? 'Copilot Chat' : path.basename(fileName.toString())) :
      'Manual Entry';

    // Use a more concise format for chat messages
    let content = `\n### User Prompt at ${timestamp}\n\n`;

    // Always include the source
    content += `Source: ${source}\n\n`;

    // Just log the raw prompt text without additional formatting
    content += `\`\`\`\n${promptText}\n\`\`\`\n\n`;
    content += `---\n`;

    await this.appendToLog(content);
    this.outputChannel.appendLine(`Logged user input from ${source}: "${promptText.substring(0, 30)}${promptText.length > 30 ? '...' : ''}"`);

    // Update status bar with visual feedback
    vscode.window.setStatusBarMessage(`📝 Logged: ${promptText.substring(0, 15)}${promptText.length > 15 ? '...' : ''}`, 3000);
  }

  /**
   * Log a chat message from Copilot Chat interface
   * Special format for chat interactions
   */
  public async logChatMessage (message: string): Promise<void> {
    if (!message || message.trim().length === 0) {
      return;
    }

    // Skip if duplicate
    if (this.isDuplicate(message)) {
      return;
    }

    this.rememberPrompt(message);

    const timestamp = moment().format(this.configManager.getTimestampFormat());

    // Use a special format for chat messages
    let content = `\n### Chat Message at ${timestamp}\n\n`;
    content += `\`\`\`\n${message}\n\`\`\`\n\n`;
    content += `---\n`;

    await this.appendToLog(content);
    this.outputChannel.appendLine(`Logged chat message: "${message.substring(0, 30)}..."`);
  }

  /**
   * Add diagnostic log for debugging
   */
  public async logDiagnostic (message: string): Promise<void> {
    this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }

  // Utility methods for prompt processing

  private rememberPrompt (promptText: string): void {
    // Simple normalization for comparison
    const normalized = promptText.trim().toLowerCase();

    // Add to recent prompts and maintain max size
    this.recentPrompts.unshift(normalized);
    if (this.recentPrompts.length > this.MAX_RECENT_PROMPTS) {
      this.recentPrompts.pop();
    }
  }

  private isDuplicate (promptText: string): boolean {
    const normalized = promptText.trim().toLowerCase();
    return this.recentPrompts.includes(normalized);
  }

  private isSystemMessage (text: string): boolean {
    return text.includes('Session Started') ||
      text.includes('Session Ended') ||
      text.includes('Prompt at') ||
      text.startsWith('system:');
  }

  private shouldIncludeContext (context: string, promptText: string): boolean | string {
    return context &&
      context.trim() &&
      context !== promptText &&
      !context.includes('User Input') &&
      this.configManager.includeContext();
  }

  private truncateIfNeeded (text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '... [truncated]';
  }

  /**
   * Check if text looks like a Copilot response rather than user input
   */
  private looksLikeResponse (text: string): boolean {
    // Very specific patterns found in Copilot responses
    const responsePatterns = [
      'Updated content goes here',
      'The content has been further updated',
      'Additional content has been added',
      'This ensures that all necessary details',
      'Key takeaways and actionable insights',
      'Further enhancements have been made',
      'Here is the implementation'
    ];

    // If text matches any exact pattern from Copilot responses, skip it
    if (responsePatterns.some(pattern => text.includes(pattern))) {
      return true;
    }

    // More targeted checks for responses
    // Check length - most user prompts are short
    const isTooLong = text.length > 100;

    // Check for complete sentences that sound like responses
    const looksLikeComplete =
      (text.startsWith('The') && text.includes('.')) ||
      (text.startsWith('This') && text.includes('.')) ||
      (text.startsWith('Updates') && text.includes('.'));

    // Check for code block patterns
    const containsCodeBlocks =
      text.includes('```') ||
      (text.includes('{') && text.includes('}') && text.includes(';'));

    // Check for explanatory language
    const containsExplanatory =
      text.includes('function') ||
      text.includes('class') ||
      text.includes('method') ||
      text.includes('implements');

    // Simpler check focused on your specific use case
    return (isTooLong && looksLikeComplete) ||
      (isTooLong && containsCodeBlocks && containsExplanatory);
  }

  /**
   * Clean up prompt text to get just the user input
   */
  private cleanupPrompt (promptText: string): string {
    if (!promptText) {
      return '';
    }

    // Make a copy of the text
    let cleaned = promptText.toString();

    // Remove markdown formatting
    cleaned = cleaned.replace(/```[\w]*\n([\s\S]*?)```/g, '$1');

    // Remove common log artifacts
    const patternsToRemove = [
      /# GitHub Copilot Prompts Log.*$/gm,
      /## Session Started:.*$/gm,
      /## Session Ended:.*$/gm,
      /### .*Prompt at.*$/gm,
      /#### Context.*$/gm,
      /#### Input.*$/gm,
      /Source:.*$/gm,
      /File:.*$/gm,
      /---+/g,
      /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g
    ];

    for (const pattern of patternsToRemove) {
      cleaned = cleaned.replace(pattern, '');
    }

    // Remove empty lines and trim
    const lines = cleaned.split('\n').filter(line => line.trim() !== '');
    cleaned = lines.join('\n').trim();

    return cleaned;
  }
}