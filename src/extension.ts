import { MultiFileAnalyzer } from '@/analyzers/MultiFileAnalyzer';
import { ContextStore } from '@/services/ContextStore';
import { HuggingFaceService } from '@/services/HuggingFaceService';
import { ChatPanel } from '@/ui/ChatPanel';
import * as vscode from 'vscode';

let analyzer: MultiFileAnalyzer | undefined;
let contextStore: ContextStore | undefined;
let hfService: HuggingFaceService | undefined;

export async function activate(context: vscode.ExtensionContext) {
  console.log('Bala AI Code Analyzer is now active!');

  // 🚨 HARDCODED API KEY - FOR TESTING ONLY! 
  // TODO: Change back to proper configuration for production
  const apiKey = process.env.HF_API_KEY || '';

  // Skip API key validation since we're hardcoding it
  console.log('Using hardcoded API key for testing');

  contextStore = new ContextStore(context.globalStorageUri);
  hfService = new HuggingFaceService({ 
    apiKey: apiKey.trim(),
    timeout: 30000,  // Increased to 30s to handle model overload
    maxRetries: 2    // 2 retries to handle temporary overloading
  });
  analyzer = new MultiFileAnalyzer(contextStore, hfService);

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
      if (!hfService || !contextStore) {
        vscode.window.showErrorMessage('Bala AI: Services not properly initialized. Please restart the extension.');
        return;
      }
      ChatPanel.createOrShow(context.extensionUri, hfService, contextStore, analyzer);
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
      vscode.window.showInformationMessage('Bala AI: Cleared analysis cache.');
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

