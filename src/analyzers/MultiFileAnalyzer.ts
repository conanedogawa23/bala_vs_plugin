import { ContextStore } from '@/services/ContextStore';
import { OllamaService } from '@/services/OllamaService';
import { AnalysisResult, FileContext, WorkspaceSummary } from '@/types';
import pLimit from 'p-limit';
import * as vscode from 'vscode';

export class MultiFileAnalyzer {
  private contextStore: ContextStore;
  private ollamaService: OllamaService;

  constructor(contextStore: ContextStore, ollamaService: OllamaService) {
    this.contextStore = contextStore;
    this.ollamaService = ollamaService;
  }

  public async analyzeWorkspace(): Promise<void> {
    const config = vscode.workspace.getConfiguration('balaAnalyzer');
    const include = config.get<string[]>('analysis.includeFileTypes') || [];
    const exclude = config.get<string[]>('analysis.excludePatterns') || [];
    const maxConcurrent = config.get<number>('analysis.maxConcurrentFiles') || 5;

    const files = await this.findFiles(include, exclude);
    await this.analyzeFiles(files, maxConcurrent);
  }

  public async analyzeFiles(uris: vscode.Uri[] | undefined, maxConcurrent?: number): Promise<void> {
    if (!uris || uris.length === 0) {
      vscode.window.showWarningMessage('Bala AI: No files selected for analysis.');
      return;
    }

    const limit = pLimit(maxConcurrent || 5);

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Analyzing ${uris.length} file(s) with AI...`,
      cancellable: false
    }, async (progress) => {
      let processed = 0;
      const results: AnalysisResult[] = [];

      await Promise.all(uris.map(uri => limit(async () => {
        const fileResult = await this.analyzeFile(uri);
        if (fileResult) {
          results.push(fileResult);
        }
        processed++;
        progress.report({ message: `${processed}/${uris.length} analyzed` });
      })));

      // Save workspace summary
      const summary: WorkspaceSummary = {
        totalFiles: uris.length,
        analysisResults: results,
        overallMetrics: this.computeOverallMetrics(results),
        relationships: await this.contextStore.getAllRelationships(),
        suggestions: results.flatMap(r => r.suggestions),
        timestamp: new Date()
      } as WorkspaceSummary;

      await this.contextStore.storeWorkspaceSummary(summary);
      vscode.window.showInformationMessage('Bala AI: Analysis complete.');
    });
  }

  public async generateWorkspaceSummary(): Promise<void> {
    const summary = await this.contextStore.getWorkspaceSummary();
    if (!summary) {
      vscode.window.showWarningMessage('Bala AI: No workspace summary available. Run an analysis first.');
      return;
    }

    // Create a convenient view in output channel for now
    const channel = vscode.window.createOutputChannel('Bala AI Summary');
    channel.clear();
    channel.appendLine('Bala AI Workspace Summary');
    channel.appendLine('==========================');
    channel.appendLine(`Files analyzed: ${summary.totalFiles}`);
    channel.appendLine(`Suggestions: ${summary.suggestions.length}`);
    channel.appendLine('');
    channel.appendLine('Top-level summary:');

    // Ask Ollama to generate a combined summary across files
    const fileContexts: FileContext[] = [];
    for (const result of summary.analysisResults) {
      const ctx = await this.contextStore.getFileContext(result.fileUri);
      if (ctx) fileContexts.push(ctx);
    }

    const aiSummary = await this.ollamaService.generateSummary(fileContexts);
    channel.appendLine(aiSummary);
    channel.show(true);
  }

  public async applyAISuggestions(): Promise<void> {
    const summary = await this.contextStore.getWorkspaceSummary();
    if (!summary) {
      vscode.window.showWarningMessage('Bala AI: No suggestions available to apply.');
      return;
    }

    // For now, just show a quick pick to select a file to apply suggestions
    const pick = await vscode.window.showQuickPick(
      summary.analysisResults.map(r => ({
        label: r.fileUri.fsPath.split('/').pop() || r.fileUri.fsPath,
        description: r.fileUri.fsPath,
        uri: r.fileUri
      })),
      { placeHolder: 'Select a file to apply AI suggestions' }
    );

    if (!pick) return;

    const doc = await vscode.workspace.openTextDocument(pick.uri);
    const editor = await vscode.window.showTextDocument(doc);

    // Apply first suggestion as a placeholder
    const result = await this.contextStore.getAnalysisResult(pick.uri);
    const suggestion = result?.suggestions[0];
    if (suggestion) {
      await editor.edit(editBuilder => {
        editBuilder.replace(suggestion.range, suggestion.suggestedCode || suggestion.originalCode);
      });
      vscode.window.showInformationMessage('Bala AI: Applied first suggestion to the document.');
    } else {
      vscode.window.showWarningMessage('Bala AI: No suggestions to apply for the selected file.');
    }
  }

  private async analyzeFile(uri: vscode.Uri): Promise<AnalysisResult | undefined> {
    try {
      const fileContext = await this.contextStore.createFileContext(uri);
      if (!fileContext) return undefined;

      // Update relationships based on current content
      const relationships = await this.contextStore.analyzeFileRelationships(uri, fileContext.content, fileContext.language);

      // Ask Ollama AI for analysis and suggestions
      const ai = await this.ollamaService.analyzeCode(fileContext);
      const suggestions = await this.ollamaService.getSuggestions(fileContext, ai.summary);

      const result: AnalysisResult = {
        fileUri: uri,
        language: fileContext.language,
        summary: ai.summary,
        suggestions: suggestions,
        relationships: relationships,
        metrics: this.computeFileMetrics(fileContext.content),
        timestamp: new Date(),
        confidence: ai.confidence
      };

      await this.contextStore.storeAnalysisResult(result);
      return result;
    } catch (error) {
      console.error(`Failed to analyze ${uri.fsPath}:`, error);
      return undefined;
    }
  }

  private async findFiles(include: string[], exclude: string[]): Promise<vscode.Uri[]> {
    const uris: vscode.Uri[] = [];

    for (const pattern of include) {
      const files = await vscode.workspace.findFiles(pattern, `{${exclude.join(',')}}`);
      uris.push(...files);
    }

    return uris;
  }

  private computeFileMetrics(content: string) {
    const lines = content.split(/\r?\n/).length;
    const complexity = Math.max(1, Math.floor((content.match(/if\s*\(|for\s*\(|while\s*\(|case\s|catch\s*\(/g) || []).length / 3));

    return {
      linesOfCode: lines,
      complexity,
      maintainabilityIndex: Math.max(0, 100 - complexity * 2),
      technicalDebt: Math.max(0, complexity - 10)
    };
  }

  private computeOverallMetrics(results: AnalysisResult[]) {
    const totalLines = results.reduce((sum, r) => sum + r.metrics.linesOfCode, 0);
    const avgComplexity = results.length ? results.reduce((sum, r) => sum + r.metrics.complexity, 0) / results.length : 0;

    return {
      linesOfCode: totalLines,
      complexity: avgComplexity,
      maintainabilityIndex: Math.max(0, 100 - avgComplexity * 2),
      technicalDebt: Math.max(0, avgComplexity - 10)
    };
  }
}

