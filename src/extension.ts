import { MultiFileAnalyzer } from '@/analyzers/MultiFileAnalyzer';
import { ContextStore } from '@/services/ContextStore';
import { OllamaService } from '@/services/OllamaService';
import { ChatPanel } from '@/ui/ChatPanel';
import { DEFAULT_CONFIG } from '@/constants/defaults';
import * as vscode from 'vscode';

let analyzer: MultiFileAnalyzer | undefined;
let contextStore: ContextStore | undefined;
let ollamaService: OllamaService | undefined;

export async function activate(context: vscode.ExtensionContext) {
  console.log('BuildAI Code Analyzer is now active!');

  // Get Ollama configuration from VSCode settings
  const config = vscode.workspace.getConfiguration('balaAnalyzer');
  const baseURL = config.get<string>('ollama.baseURL') || DEFAULT_CONFIG.OLLAMA.BASE_URL;
  const username = config.get<string>('ollama.username') || DEFAULT_CONFIG.OLLAMA.USERNAME;
  const password = config.get<string>('ollama.password') || DEFAULT_CONFIG.OLLAMA.PASSWORD;
  const model = config.get<string>('ollama.model') || DEFAULT_CONFIG.OLLAMA.MODEL;
  const timeout = config.get<number>('ollama.timeout') || DEFAULT_CONFIG.OLLAMA.TIMEOUT;
  const maxRetries = config.get<number>('ollama.maxRetries') || DEFAULT_CONFIG.OLLAMA.MAX_RETRIES;

  console.log(`Using Ollama server: ${baseURL} with model: ${model}`);

  contextStore = new ContextStore(context.globalStorageUri);
  
  // Build config object with conditional properties
  const ollamaConfig: any = {
    baseURL,
    model,
    timeout,
    maxRetries
  };
  
  if (username) {
    ollamaConfig.username = username;
  }
  if (password) {
    ollamaConfig.password = password;
  }
  
  ollamaService = new OllamaService(ollamaConfig);
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
      const summary = await analyzer.analyzeFiles(uris);
      
      // Show results in chat if available
      if (summary && ChatPanel.currentPanel) {
        const summaryText = await analyzer.generateWorkspaceSummary();
        ChatPanel.currentPanel.displayAnalysisResults(summaryText);
      } else if (summary) {
        // If chat panel is not open, suggest opening it
        const action = await vscode.window.showInformationMessage(
          'Analysis complete! View results in AI Chat?',
          'Open Chat',
          'Dismiss'
        );
        if (action === 'Open Chat' && ollamaService && contextStore) {
          ChatPanel.createOrShow(context.extensionUri, ollamaService, contextStore, analyzer);
          const summaryText = await analyzer.generateWorkspaceSummary();
          ChatPanel.currentPanel?.displayAnalysisResults(summaryText);
        }
      }
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
      const summaryText = await analyzer.generateWorkspaceSummary();
      
      // Offer to show in chat
      if (summaryText && summaryText !== 'No workspace summary available. Please run an analysis first.') {
        const action = await vscode.window.showInformationMessage(
          'View analysis summary in AI Chat?',
          'Open in Chat',
          'Output Channel Only'
        );
        if (action === 'Open in Chat' && ollamaService && contextStore) {
          ChatPanel.createOrShow(context.extensionUri, ollamaService, contextStore, analyzer);
          ChatPanel.currentPanel?.displayAnalysisResults(summaryText);
        }
      }
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

