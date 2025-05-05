# Copilot Prompt Logger

A Visual Studio Code extension that logs all prompts sent to GitHub Copilot to a Markdown file.

## Features

- Logs every prompt sent to GitHub Copilot during your coding session
- Creates a nicely formatted Markdown file with timestamps, file context, and prompt text
- Tracks session start and end times
- Configurable options for logging preferences

![Example Screenshot](images/screenshot.png)

## Requirements

- Visual Studio Code v1.60.0 or higher
- GitHub Copilot extension installed and activated

## Installation

You can install this extension in several ways:

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "Copilot Prompt Logger"
4. Click Install

### From VSIX File

1. Download the .vsix file from the [releases page](https://github.com/yourusername/copilot-prompt-logger/releases)
2. Open VS Code
3. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
4. Click on the "..." menu in the top right of the Extensions view
5. Select "Install from VSIX..." and choose the downloaded file

## How It Works

Once activated, the extension will:

1. Create a `copilot-prompts.md` file in your workspace root directory
2. Log session start and end times
3. Monitor for potential Copilot prompts based on text changes
4. Save the context, timestamp, and prompt text to the log file

Note: Since GitHub Copilot does not provide an official API for extensions to access prompts directly, this extension uses heuristics to identify likely Copilot suggestions. It may not capture all prompts with 100% accuracy.

## Extension Settings

This extension provides the following settings:

* `copilotPromptLogger.enabled`: Enable or disable Copilot prompt logging
* `copilotPromptLogger.logFilePath`: Path to the Copilot prompts log file (relative to workspace root)
* `copilotPromptLogger.timestampFormat`: Format for timestamps in the log file
* `copilotPromptLogger.includeContextLines`: Number of code context lines to include in the log

## Commands

This extension provides several commands in the Command Palette:

* `Copilot Prompt Logger: Enable Logging`: Enables prompt logging
* `Copilot Prompt Logger: Disable Logging`: Disables prompt logging
* `Copilot Prompt Logger: Open Log File`: Opens the log file in the editor

## Local Development and Testing

To set up and test this extension locally:

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/copilot-prompt-logger.git
   cd copilot-prompt-logger
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the extension:
   ```bash
   npm run compile
   ```

4. Launch the extension in a new VS Code window:
   - Press F5 or select "Run and Debug" from the activity bar, then choose "Launch Extension"

## Publishing the Extension

To publish your extension to the VS Code Marketplace:

1. Install the VSCE tool:
   ```bash
   npm install -g vsce
   ```

2. Package the extension:
   ```bash
   vsce package
   ```
   This creates a .vsix file in your project directory.

3. Create a publisher account on the [VS Code Marketplace](https://marketplace.visualstudio.com/manage).

4. Publish your extension:
   ```bash
   vsce publish
   ```
   You will need a Personal Access Token with appropriate permissions. See [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) for more details.

## Privacy Considerations

This extension logs prompts that may contain code snippets and comments from your workspace. The logs are saved locally in your workspace and are not transmitted anywhere. Users should be aware of the contents of the log file when sharing their workspace or repositories.

## License

This extension is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Release Notes

See the [CHANGELOG](CHANGELOG.md) for detailed release notes.