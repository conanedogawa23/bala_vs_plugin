import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { 
  FileContext, 
  FileRelationship, 
  AnalysisResult, 
  RelationshipType,
  WorkspaceSummary 
} from '@/types';

export class ContextStore {
  private storageUri: vscode.Uri;
  private contextCache: Map<string, FileContext> = new Map();
  private relationshipCache: Map<string, FileRelationship[]> = new Map();

  constructor(storageUri: vscode.Uri) {
    this.storageUri = storageUri;
    this.ensureStorageDirectory();
  }

  public async storeFileContext(fileContext: FileContext): Promise<void> {
    const key = this.getFileKey(fileContext.uri);
    this.contextCache.set(key, fileContext);
    
    const filePath = path.join(this.storageUri.fsPath, `${key}.json`);
    await fs.writeFile(filePath, JSON.stringify(fileContext, null, 2));
  }

  public async getFileContext(uri: vscode.Uri): Promise<FileContext | undefined> {
    const key = this.getFileKey(uri);
    
    // Check cache first
    if (this.contextCache.has(key)) {
      return this.contextCache.get(key);
    }

    // Try to load from disk
    try {
      const filePath = path.join(this.storageUri.fsPath, `${key}.json`);
      const content = await fs.readFile(filePath, 'utf8');
      const context = JSON.parse(content) as FileContext;
      this.contextCache.set(key, context);
      return context;
    } catch {
      return undefined;
    }
  }

  public async storeAnalysisResult(result: AnalysisResult): Promise<void> {
    const key = this.getFileKey(result.fileUri);
    const filePath = path.join(this.storageUri.fsPath, `analysis_${key}.json`);
    await fs.writeFile(filePath, JSON.stringify(result, null, 2));
  }

  public async getAnalysisResult(uri: vscode.Uri): Promise<AnalysisResult | undefined> {
    try {
      const key = this.getFileKey(uri);
      const filePath = path.join(this.storageUri.fsPath, `analysis_${key}.json`);
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content) as AnalysisResult;
    } catch {
      return undefined;
    }
  }

  public async storeWorkspaceSummary(summary: WorkspaceSummary): Promise<void> {
    const filePath = path.join(this.storageUri.fsPath, 'workspace_summary.json');
    await fs.writeFile(filePath, JSON.stringify(summary, null, 2));
  }

  public async getWorkspaceSummary(): Promise<WorkspaceSummary | undefined> {
    try {
      const filePath = path.join(this.storageUri.fsPath, 'workspace_summary.json');
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content) as WorkspaceSummary;
    } catch {
      return undefined;
    }
  }

  public async addRelationship(relationship: FileRelationship): Promise<void> {
    const fromKey = this.getFileKey(relationship.fromFile);
    const toKey = this.getFileKey(relationship.toFile);
    
    // Store bidirectional relationships
    await this.addRelationshipForFile(fromKey, relationship);
    
    const reverseRelationship: FileRelationship = {
      ...relationship,
      fromFile: relationship.toFile,
      toFile: relationship.fromFile
    };
    await this.addRelationshipForFile(toKey, reverseRelationship);
  }

  public async getRelationships(uri: vscode.Uri): Promise<FileRelationship[]> {
    const key = this.getFileKey(uri);
    
    if (this.relationshipCache.has(key)) {
      return this.relationshipCache.get(key) || [];
    }

    try {
      const filePath = path.join(this.storageUri.fsPath, `relationships_${key}.json`);
      const content = await fs.readFile(filePath, 'utf8');
      const relationships = JSON.parse(content) as FileRelationship[];
      this.relationshipCache.set(key, relationships);
      return relationships;
    } catch {
      return [];
    }
  }

  public async getAllRelationships(): Promise<FileRelationship[]> {
    const relationshipFiles = await this.getRelationshipFiles();
    const allRelationships: FileRelationship[] = [];
    
    for (const file of relationshipFiles) {
      try {
        const content = await fs.readFile(file, 'utf8');
        const relationships = JSON.parse(content) as FileRelationship[];
        allRelationships.push(...relationships);
      } catch (error) {
        console.error(`Failed to read relationships from ${file}:`, error);
      }
    }
    
    // Remove duplicates
    return this.deduplicateRelationships(allRelationships);
  }

  public async analyzeFileRelationships(uri: vscode.Uri, content: string, language: string): Promise<FileRelationship[]> {
    const relationships: FileRelationship[] = [];
    
    // Analyze imports/requires
    const importRelationships = await this.analyzeImports(uri, content, language);
    relationships.push(...importRelationships);
    
    // Analyze function calls
    const callRelationships = await this.analyzeFunctionCalls(uri, content, language);
    relationships.push(...callRelationships);
    
    // Store relationships
    for (const relationship of relationships) {
      await this.addRelationship(relationship);
    }
    
    return relationships;
  }

  public async createFileContext(uri: vscode.Uri): Promise<FileContext | undefined> {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const content = document.getText();
      const stat = await fs.stat(uri.fsPath);
      
      const fileContext: FileContext = {
        uri,
        content,
        language: document.languageId,
        lastModified: stat.mtime,
        size: stat.size,
        hash: this.calculateHash(content),
        relationships: await this.getRelationships(uri)
      };

      await this.storeFileContext(fileContext);
      return fileContext;
    } catch (error) {
      console.error(`Failed to create file context for ${uri.fsPath}:`, error);
      return undefined;
    }
  }

  public async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.storageUri.fsPath);
      await Promise.all(files.map(file => 
        fs.unlink(path.join(this.storageUri.fsPath, file))
      ));
      this.contextCache.clear();
      this.relationshipCache.clear();
    } catch (error) {
      console.error('Failed to clear context store:', error);
    }
  }

  public async cleanup(retentionDays: number): Promise<void> {
    try {
      const files = await fs.readdir(this.storageUri.fsPath);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      for (const file of files) {
        const filePath = path.join(this.storageUri.fsPath, file);
        const stat = await fs.stat(filePath);
        
        if (stat.mtime < cutoffDate) {
          await fs.unlink(filePath);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup context store:', error);
    }
  }

  private async ensureStorageDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.storageUri.fsPath, { recursive: true });
    } catch (error) {
      console.error('Failed to create storage directory:', error);
    }
  }

  private getFileKey(uri: vscode.Uri): string {
    return crypto.createHash('md5').update(uri.fsPath).digest('hex');
  }

  private calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async addRelationshipForFile(fileKey: string, relationship: FileRelationship): Promise<void> {
    const filePath = path.join(this.storageUri.fsPath, `relationships_${fileKey}.json`);
    
    let relationships: FileRelationship[] = [];
    try {
      const content = await fs.readFile(filePath, 'utf8');
      relationships = JSON.parse(content) as FileRelationship[];
    } catch {
      // File doesn't exist yet, that's fine
    }

    // Avoid duplicates
    const exists = relationships.some(r => 
      r.fromFile.fsPath === relationship.fromFile.fsPath &&
      r.toFile.fsPath === relationship.toFile.fsPath &&
      r.type === relationship.type
    );

    if (!exists) {
      relationships.push(relationship);
      await fs.writeFile(filePath, JSON.stringify(relationships, null, 2));
      this.relationshipCache.set(fileKey, relationships);
    }
  }

  private async getRelationshipFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.storageUri.fsPath);
      return files
        .filter(file => file.startsWith('relationships_') && file.endsWith('.json'))
        .map(file => path.join(this.storageUri.fsPath, file));
    } catch {
      return [];
    }
  }

  private deduplicateRelationships(relationships: FileRelationship[]): FileRelationship[] {
    const seen = new Set<string>();
    return relationships.filter(relationship => {
      const key = `${relationship.fromFile.fsPath}-${relationship.toFile.fsPath}-${relationship.type}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private async analyzeImports(uri: vscode.Uri, content: string, language: string): Promise<FileRelationship[]> {
    const relationships: FileRelationship[] = [];
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    
    if (!workspaceFolder) {
      return relationships;
    }

    const importRegexes = this.getImportRegexesForLanguage(language);
    
    for (const regex of importRegexes) {
      let match;
      while ((match = regex.exec(content)) !== null) {
        const importPath = match[1] || match[2]; // Different capture groups for different patterns
        if (importPath && !importPath.startsWith('.') && !importPath.includes('node_modules')) {
          try {
            const resolvedPath = await this.resolveImportPath(workspaceFolder.uri, importPath, language);
            if (resolvedPath) {
              relationships.push({
                fromFile: uri,
                toFile: resolvedPath,
                type: RelationshipType.IMPORTS,
                strength: 1.0,
                description: `Imports from ${importPath}`
              });
            }
          } catch {
            // Failed to resolve import, skip it
          }
        }
      }
    }

    return relationships;
  }

  private async analyzeFunctionCalls(uri: vscode.Uri, content: string, language: string): Promise<FileRelationship[]> {
    // This is a simplified implementation
    // In a real implementation, you'd use proper AST parsing
    const relationships: FileRelationship[] = [];
    
    // This would require more sophisticated analysis
    // For now, we return empty array
    return relationships;
  }

  private getImportRegexesForLanguage(language: string): RegExp[] {
    switch (language.toLowerCase()) {
      case 'typescript':
      case 'javascript':
        return [
          /import.*from\s+['"]([^'"]+)['"]/g,
          /require\(['"]([^'"]+)['"]\)/g,
          /import\(['"]([^'"]+)['"]\)/g
        ];
      case 'python':
        return [
          /from\s+([^\s]+)\s+import/g,
          /import\s+([^\s]+)/g
        ];
      case 'java':
        return [
          /import\s+([^;]+);/g
        ];
      case 'csharp':
        return [
          /using\s+([^;]+);/g
        ];
      default:
        return [];
    }
  }

  private async resolveImportPath(workspaceUri: vscode.Uri, importPath: string, language: string): Promise<vscode.Uri | undefined> {
    const extensions = this.getExtensionsForLanguage(language);
    
    for (const ext of extensions) {
      const fullPath = vscode.Uri.joinPath(workspaceUri, `${importPath}${ext}`);
      try {
        await fs.access(fullPath.fsPath);
        return fullPath;
      } catch {
        continue;
      }
    }
    
    return undefined;
  }

  private getExtensionsForLanguage(language: string): string[] {
    switch (language.toLowerCase()) {
      case 'typescript':
        return ['.ts', '.tsx'];
      case 'javascript':
        return ['.js', '.jsx'];
      case 'python':
        return ['.py'];
      case 'java':
        return ['.java'];
      case 'csharp':
        return ['.cs'];
      default:
        return [''];
    }
  }
}
