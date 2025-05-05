// src/config.ts
import * as vscode from 'vscode';

export class ConfigManager {
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
  public getLogFilePath(): string {
    return this.config.get<string>('logFilePath', 'copilot-prompts/prompt-log.md');
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
}