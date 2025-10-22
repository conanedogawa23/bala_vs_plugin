import { MultiFileAnalyzer } from '@/analyzers/MultiFileAnalyzer';
import { ContextStore } from '@/services/ContextStore';
import { OllamaService } from '@/services/OllamaService';
import { ChatPanel } from '@/ui/ChatPanel';
import * as vscode from 'vscode';

let analyzer: MultiFileAnalyzer | undefined;
let contextStore: ContextStore | undefined;
let ollamaService: OllamaService | undefined;

export async function activate(context: vscode.ExtensionContext) {
  console.log('BuildAI Code Analyzer is now active!');

  // Get Ollama configuration from VSCode settings
  const config = vscode.workspace.getConfiguration('balaAnalyzer');
  const baseURL = config.get<string>('ollama.baseURL') || 'http://localhost:11434/v1';
  const model = config.get<string>('ollama.model') || 'llama3.2:3b';
  const timeout = config.get<number>('ollama.timeout') || 30000;
  const maxRetries = config.get<number>('ollama.maxRetries') || 3;

  console.log(`Using Ollama server: ${baseURL} with model: ${model}`);

  contextStore = new ContextStore(context.globalStorageUri);
  ollamaService = new OllamaService({ 
    baseURL,
    model,
    timeout,
    maxRetries
  });
  analyzer = new MultiFileAnalyzer(contextStore, ollamaService);

  context.subscriptions.push(
    vscode.commands.registerCommand('balaAnalyzer.analyzeWorkspace', async () => {
      if (!analyzer) { return; }
      await analyzer.analyzeWorkspace();
    }),
    vscode.commands.registerCommand('balaAnalyzer.analyzeSelectedFiles', async (uri?: vscode.Uri, selectedUris?: vscode.Uri[]) => {
      if (!analyzer) { return; }
      // When invoked from Explorer context menu, selectedUris is provided
      const uris = (Array.isArray(selectedUris) && selectedUris.length > 0)
        ? selectedUris
        : await pickFiles();
      await analyzer.analyzeFiles(uris);
    }),
    vscode.commands.registerCommand('balaAnalyzer.openAIChat', async () => {
      if (!ollamaService || !contextStore) {
        vscode.window.showErrorMessage('BuildAI: Services not properly initialized. Please restart the extension.');
        return;
      }
      ChatPanel.createOrShow(context.extensionUri, ollamaService, contextStore, analyzer);
    }),
    vscode.commands.registerCommand('balaAnalyzer.generateSummary', async () => {
      if (!analyzer) { return; }
      await analyzer.generateWorkspaceSummary();
    }),
    vscode.commands.registerCommand('balaAnalyzer.applyAISuggestions', async () => {
      if (!analyzer) { return; }
      await analyzer.applyAISuggestions();
    }),
    vscode.commands.registerCommand('balaAnalyzer.clearCache', async () => {
      if (!contextStore) { return; }
      await contextStore.clear();
      vscode.window.showInformationMessage('BuildAI: Cleared analysis cache.');
    }),
    vscode.commands.registerCommand('balaAnalyzer.configure', async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'balaAnalyzer');
    }),
  );
}

export function deactivate() {
  // Clean up the chat panel
  ChatPanel.kill();
}

async function pickFiles(): Promise<vscode.Uri[]> {
  const files = await vscode.window.showOpenDialog({
    canSelectMany: true,
    canSelectFolders: false,
    canSelectFiles: true,
    openLabel: 'Analyze',
    filters: {
      'Code Files': ['js','ts','jsx','tsx','py','java','cs','cpp','c','php','go','rs','rb','swift','kt']
    }
  });
  return files || [];
}

