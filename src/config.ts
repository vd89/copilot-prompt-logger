// src/config.ts
import path from 'path';
import * as vscode from 'vscode';

export class ConfigManager {
  /**
   * Configuration object
   */
  private config: vscode.WorkspaceConfiguration;

  constructor() {
    this.config = vscode.workspace.getConfiguration('copilotPromptLogger');
  }

  /**
   * Reload the configuration
   */
  public reloadConfig(): void {
    this.config = vscode.workspace.getConfiguration('copilotPromptLogger');
  }

  /**
   * Check if logging is enabled
   */
  public isEnabled(): boolean {
    return this.config.get<boolean>('enabled', true);
  }

  /**
   * Set whether logging is enabled
   */
  public setEnabled(enabled: boolean): Thenable<void> {
    return this.config.update('enabled', enabled, vscode.ConfigurationTarget.Global);
  }

  /**
   * Get the path to the log file
   */
  // In config.ts - Update the getLogFilePath method
  public getLogFilePath (): string {
    // Get the base path from configuration
    const basePath = this.config.get<string>('logFilePath', 'copilot-prompts/prompt-log.md');

    // Check if we should use date-based naming
    const useDateBasedNaming = this.config.get<boolean>('useDateBasedNaming', true);

    if (useDateBasedNaming) {
      const now = new Date();
      const dateString = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;

      // Extract directory and filename parts
      const dirPart = path.dirname(basePath);
      const fileBase = path.basename(basePath, path.extname(basePath));
      const fileExt = path.extname(basePath) || '.md';

      return path.join(dirPart, `${fileBase}-${dateString}${fileExt}`);
    }

    return basePath;
  }

  /**
   * Get the timestamp format
   */
  public getTimestampFormat(): string {
    return this.config.get<string>('timestampFormat', 'YYYY-MM-DD HH:mm:ss');
  }

  /**
   * Get the number of context lines to include
   */
  public getContextLines(): number {
    return this.config.get<number>('includeContextLines', 5);
  }

  /**
   * Check if context should be included in logs
   */
  public includeContext (): boolean {
    return this.config.get<boolean>('includeContext', false);
  }

  /**
   * Get the capture mode (userInputOnly, inputAndResponse, all)
   */
  public getCaptureMode (): string {
    return this.config.get<string>('captureMode', 'userInputOnly');
  }

  // Add to config.ts class ConfigManager
  /**
   * Check if debug mode is enabled
   */
  public isDebugMode (): boolean {
    return this.config.get<boolean>('debugMode', false);
  }
}