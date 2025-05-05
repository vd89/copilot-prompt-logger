// src/logger.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import moment from 'moment';
import { ConfigManager } from './config';

export class CopilotLogger {
  private configManager: ConfigManager;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  /**
   * Get the full path to the log file
   */
  public async getLogFilePath(): Promise<string> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder is open');
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
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

  /**
   * Initialize the log file if it doesn't exist
   */
  private async initLogFile(): Promise<string> {
    try {
      const logFilePath = await this.getLogFilePath();
      const dirPath = path.dirname(logFilePath);

      // Create directory if it doesn't exist
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // Create log file with header if it doesn't exist
      if (!fs.existsSync(logFilePath)) {
        const header = `# GitHub Copilot Prompts Log - ${new Date().toLocaleDateString()}\n\nThis file contains logs of prompts sent to GitHub Copilot.\n\n`;
        fs.writeFileSync(logFilePath, header, 'utf8');
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
  private async appendToLog(content: string): Promise<void> {
    if (!this.configManager.isEnabled()) {return;};

    try {
      const logFilePath = await this.initLogFile();

      fs.appendFileSync(logFilePath, content, 'utf8');
      console.log(`Logged content to: ${logFilePath}`);
    } catch (error) {
      console.error('Failed to append to log file:', error);
      vscode.window.showErrorMessage(`Failed to append to log file: ${error}`);
    }
  }

  /**
   * Log a session start
   */
  public async logSessionStart(): Promise<void> {
    const timestamp = moment().format(this.configManager.getTimestampFormat());
    const content = `\n## Session Started: ${timestamp}\n\n`;

    await this.appendToLog(content);
  }

  /**
   * Log a session end
   */
  public async logSessionEnd(): Promise<void> {
    const timestamp = moment().format(this.configManager.getTimestampFormat());
    const content = `\n## Session Ended: ${timestamp}\n\n`;

    await this.appendToLog(content);
  }

  /**
   * Log a prompt to Copilot
   */
  public async logPrompt(fileName: string, context: string, promptText: string): Promise<void> {
    if (!promptText || promptText.trim().length === 0) {
      return; // Skip empty prompts
    }

    // Clean up the prompt to exclude processing logs and metadata
    promptText = this.cleanupPrompt(promptText);

    // Skip if still empty after cleanup or if it looks like a log entry rather than user input
    if (!promptText ||
        promptText.trim().length === 0 ||
        promptText.includes('Session Started') ||
        promptText.includes('Prompt at')) {
      return;
    }

    const timestamp = moment().format(this.configManager.getTimestampFormat());
    const relativePath = typeof fileName === 'string' ?
      vscode.workspace.asRelativePath(fileName, false) : 'Copilot Chat';

    // Format the log entry - keep it simple and focused on the actual prompt
    let content = `\n### User Prompt at ${timestamp}\n\n`;

    // Only include context if it's meaningful and different from the prompt
    if (context &&
        context.trim() &&
        context !== promptText &&
        !context.includes('User Input')) {
      content += `#### Context\n\n\`\`\`\n${context}\n\`\`\`\n\n`;
    }

    // Add prompt section - this is the main focus
    content += `#### Input\n\n\`\`\`\n${promptText}\n\`\`\`\n\n`;

    // Add separator
    content += `---\n`;

    await this.appendToLog(content);
  }

  /**
   * Clean up prompt text by removing unwanted elements
   * Focus on extracting only the user input
   */
  private cleanupPrompt(promptText: string): string {
    if (!promptText) {
      return '';
    }

    // Remove markdown code blocks
    promptText = promptText.replace(/```[\s\S]*?```/g, ' ');

    // Remove common headers and log artifacts
    promptText = promptText.replace(/# GitHub Copilot Prompts Log.*$/gm, '');
    promptText = promptText.replace(/## Session Started:.*$/gm, '');
    promptText = promptText.replace(/### Prompt at.*$/gm, '');
    promptText = promptText.replace(/#### Context.*$/gm, '');
    promptText = promptText.replace(/#### Prompt\/Generated Content.*$/gm, '');

    // Remove timestamps and log formatting
    promptText = promptText.replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g, '');

    // Remove common markdown artifacts
    promptText = promptText.replace(/---+/g, '');

    // Remove lines that look like processing metadata
    const lines = promptText.split('\n').filter(line => {
      return !line.match(/^(Processing|Thinking|Analyzing|Context:|Received:)/i) &&
             !line.match(/^(```|---|###|####)/) &&
             line.trim() !== '';
    });

    // Join and clean up the remaining lines
    promptText = lines.join('\n').trim();

    // Remove duplicate whitespace
    promptText = promptText.replace(/\s+/g, ' ').trim();

    return promptText;
  }
}