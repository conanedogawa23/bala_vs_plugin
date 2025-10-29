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

  public async analyzeFiles(uris: vscode.Uri[] | undefined, maxConcurrent?: number): Promise<WorkspaceSummary | undefined> {
    if (!uris || uris.length === 0) {
      vscode.window.showWarningMessage('BuildAI: No files selected for analysis.');
      return undefined;
    }

    const limit = pLimit(maxConcurrent || 5);

    return await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Analyzing ${uris.length} file(s) with AI...`,
      cancellable: false
    }, async (progress) => {
      let processed = 0;
      const results: AnalysisResult[] = [];
      const errors: string[] = [];

      await Promise.all(uris.map(uri => limit(async () => {
        try {
          const fileResult = await this.analyzeFile(uri);
          if (fileResult) {
            results.push(fileResult);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`${uri.fsPath}: ${errorMsg}`);
          console.error(`Failed to analyze ${uri.fsPath}:`, error);
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
      
      // Show completion message with stats
      const successCount = results.length;
      const failCount = errors.length;
      let message = `BuildAI: Analysis complete. ${successCount} file(s) analyzed successfully`;
      if (failCount > 0) {
        message += `, ${failCount} failed`;
      }
      vscode.window.showInformationMessage(message);
      
      return summary;
    });
  }

  public async generateWorkspaceSummary(): Promise<string> {
    const summary = await this.contextStore.getWorkspaceSummary();
    if (!summary) {
      vscode.window.showWarningMessage('BuildAI: No workspace summary available. Run an analysis first.');
      return 'No workspace summary available. Please run an analysis first.';
    }

    // Ask Ollama to generate a combined summary across files
    const fileContexts: FileContext[] = [];
    for (const result of summary.analysisResults) {
      const ctx = await this.contextStore.getFileContext(result.fileUri);
      if (ctx) fileContexts.push(ctx);
    }

    const aiSummary = await this.ollamaService.generateSummary(fileContexts);
    
    // Format the complete summary
    const formattedSummary = `# BuildAI Workspace Analysis Summary

## Overview
- **Files Analyzed:** ${summary.totalFiles}
- **Suggestions:** ${summary.suggestions.length}
- **Analysis Date:** ${summary.timestamp.toLocaleString()}

## Metrics
- **Total Lines of Code:** ${summary.overallMetrics.linesOfCode}
- **Average Complexity:** ${summary.overallMetrics.complexity.toFixed(2)}
- **Maintainability Index:** ${summary.overallMetrics.maintainabilityIndex.toFixed(2)}

## AI Summary
${aiSummary}

## Top Suggestions
${summary.suggestions.slice(0, 5).map((s, i) => `${i + 1}. **${s.title}**: ${s.description}`).join('\n')}

---
*Analyze complete. Use the chat to ask specific questions about your codebase.*`;

    // Also show in output channel
    const channel = vscode.window.createOutputChannel('BuildAI Summary');
    channel.clear();
    channel.appendLine(formattedSummary.replace(/[#*]/g, ''));
    channel.show(true);
    
    return formattedSummary;
  }

  public async applyAISuggestions(): Promise<void> {
    const summary = await this.contextStore.getWorkspaceSummary();
    if (!summary) {
      vscode.window.showWarningMessage('BuildAI: No suggestions available to apply.');
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
      vscode.window.showInformationMessage('BuildAI: Applied first suggestion to the document.');
    } else {
      vscode.window.showWarningMessage('BuildAI: No suggestions to apply for the selected file.');
    }
  }

  private async analyzeFile(uri: vscode.Uri): Promise<AnalysisResult | undefined> {
    try {
      const fileName = uri.fsPath.split('/').pop() || uri.fsPath;
      console.log(`🔍 Starting analysis of ${fileName}...`);
      
      const fileContext = await this.contextStore.createFileContext(uri);
      if (!fileContext) {
        console.log(`❌ Failed to create context for ${fileName}`);
        return undefined;
      }

      console.log(`📊 Analyzing relationships for ${fileName}...`);
      // Update relationships based on current content
      const relationships = await this.contextStore.analyzeFileRelationships(uri, fileContext.content, fileContext.language);

      console.log(`🤖 Running AI analysis on ${fileName}...`);
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
      console.log(`✅ Completed analysis of ${fileName}`);
      return result;
    } catch (error) {
      const fileName = uri.fsPath.split('/').pop() || uri.fsPath;
      console.error(`❌ Failed to analyze ${fileName}:`, error);
      throw error; // Re-throw to be caught by the caller
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

