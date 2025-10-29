import * as path from 'path';
import * as vscode from 'vscode';

export function getLanguageFromFilePath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  
  const languageMap: { [key: string]: string } = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.py': 'python',
    '.java': 'java',
    '.cs': 'csharp',
    '.cpp': 'cpp',
    '.c': 'c',
    '.php': 'php',
    '.go': 'go',
    '.rs': 'rust',
    '.rb': 'ruby',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.sh': 'shellscript',
    '.bat': 'bat',
    '.ps1': 'powershell',
    '.sql': 'sql',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.json': 'json',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown'
  };

  return languageMap[ext] || 'plaintext';
}

export function isCodeFile(filePath: string): boolean {
  const codeExtensions = [
    '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cs', '.cpp', '.c',
    '.php', '.go', '.rs', '.rb', '.swift', '.kt', '.scala', '.sh', '.bat',
    '.ps1', '.sql', '.html', '.css', '.scss'
  ];
  
  const ext = path.extname(filePath).toLowerCase();
  return codeExtensions.includes(ext);
}

export function shouldExcludeFile(filePath: string, excludePatterns: string[]): boolean {
  for (const pattern of excludePatterns) {
    // Convert glob pattern to regex for basic matching
    const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
    if (regex.test(filePath)) {
      return true;
    }
  }
  return false;
}

export function getRelativePathFromWorkspace(uri: vscode.Uri): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (workspaceFolder) {
    return path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
  }
  return uri.fsPath;
}

export function formatFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

export function getFileIcon(language: string): string {
  const iconMap: { [key: string]: string } = {
    'typescript': '$(symbol-namespace)',
    'javascript': '$(symbol-function)',
    'python': '$(symbol-class)',
    'java': '$(symbol-class)',
    'csharp': '$(symbol-class)',
    'cpp': '$(symbol-struct)',
    'c': '$(symbol-struct)', 
    'php': '$(symbol-function)',
    'go': '$(symbol-package)',
    'rust': '$(symbol-struct)',
    'ruby': '$(symbol-class)',
    'swift': '$(symbol-class)',
    'kotlin': '$(symbol-class)',
    'html': '$(symbol-tag)',
    'css': '$(symbol-color)',
    'json': '$(symbol-object)',
    'markdown': '$(symbol-text)',
    'sql': '$(symbol-database)',
    'yaml': '$(symbol-key)'
  };

  return iconMap[language] || '$(symbol-file)';
}

export async function readFileContent(uri: vscode.Uri, maxSize: number = 2 * 1024 * 1024): Promise<string | null> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.size > maxSize) {
      vscode.window.showWarningMessage(`File ${uri.fsPath} is too large (${formatFileSize(stat.size)}). Skipping analysis.`);
      return null;
    }

    const content = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(content);
  } catch (error) {
    console.error(`Failed to read file ${uri.fsPath}:`, error);
    return null;
  }
}

/**
 * Enhanced file content reader that prioritizes active editor content over file system
 * This ensures we analyze what the user is currently seeing/editing, including unsaved changes
 */
export async function readFileContentSmart(uri: vscode.Uri, maxSize: number = 10 * 1024 * 1024): Promise<{ content: string; language: string; isFromEditor: boolean; isChunked?: boolean } | null> {
  try {
    // First priority: Check if file is open in any visible editor
    const visibleEditors = vscode.window.visibleTextEditors;
    for (const editor of visibleEditors) {
      if (editor.document.uri.toString() === uri.toString()) {
        console.log(`📝 Reading from active editor: ${uri.fsPath}`);
        const content = editor.document.getText();
        return {
          content: content.length > maxSize ? content.substring(0, maxSize) : content,
          language: editor.document.languageId,
          isFromEditor: true,
          isChunked: content.length > maxSize
        };
      }
    }

    // Second priority: Check if file is open in any tab (even if not visible)
    const openDocuments = vscode.workspace.textDocuments;
    for (const document of openDocuments) {
      if (document.uri.toString() === uri.toString()) {
        console.log(`📄 Reading from open document: ${uri.fsPath}`);
        const content = document.getText();
        return {
          content: content.length > maxSize ? content.substring(0, maxSize) : content,
          language: document.languageId,
          isFromEditor: true,
          isChunked: content.length > maxSize
        };
      }
    }

    // Third priority: Try to open the document (this loads it into memory)
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      console.log(`💾 Reading from opened document: ${uri.fsPath}`);
      const content = document.getText();
      return {
        content: content.length > maxSize ? content.substring(0, maxSize) : content,
        language: document.languageId,
        isFromEditor: false,
        isChunked: content.length > maxSize
      };
    } catch (openError) {
      console.log(`⚠️ Could not open document, falling back to file system: ${uri.fsPath}`);
    }

    // Final fallback: Read from file system with chunking support
    const stat = await vscode.workspace.fs.stat(uri);
    const isLargeFile = stat.size > maxSize;
    
    if (isLargeFile) {
      console.log(`📦 Large file detected (${formatFileSize(stat.size)}). Reading first ${formatFileSize(maxSize)}...`);
    }

    const content = await vscode.workspace.fs.readFile(uri);
    const contentStr = new TextDecoder().decode(content);
    const truncatedContent = isLargeFile ? contentStr.substring(0, maxSize) : contentStr;
    
    // Try to detect language from file extension
    const language = detectLanguageFromPath(uri.fsPath);
    
    console.log(`📁 Reading from file system: ${uri.fsPath}`);
    return {
      content: truncatedContent,
      language,
      isFromEditor: false,
      isChunked: isLargeFile
    };
  } catch (error) {
    console.error(`Failed to read file ${uri.fsPath}:`, error);
    return null;
  }
}

/**
 * Get file content prioritizing active editor, with support for absolute paths
 */
export async function getFileContentForAnalysis(
  filePathOrUri: string | vscode.Uri, 
  maxSize: number = 2 * 1024 * 1024
): Promise<{ content: string; language: string; uri: vscode.Uri; isFromEditor: boolean } | null> {
  try {
    let uri: vscode.Uri;
    
    // Handle string paths (including absolute paths)
    if (typeof filePathOrUri === 'string') {
      // Check if it's an absolute path
      if (path.isAbsolute(filePathOrUri)) {
        uri = vscode.Uri.file(filePathOrUri);
        console.log(`🔗 Converting absolute path to URI: ${filePathOrUri}`);
      } else {
        // Try to resolve relative to workspace
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          const workspacePath = workspaceFolders[0]!.uri.fsPath;
          const fullPath = path.resolve(workspacePath, filePathOrUri);
          uri = vscode.Uri.file(fullPath);
          console.log(`📂 Resolving relative path: ${filePathOrUri} -> ${fullPath}`);
        } else {
          console.error(`Cannot resolve relative path without workspace: ${filePathOrUri}`);
          return null;
        }
      }
    } else {
      uri = filePathOrUri;
    }

    const result = await readFileContentSmart(uri, maxSize);
    if (!result) {
      return null;
    }

    return {
      content: result.content,
      language: result.language,
      uri,
      isFromEditor: result.isFromEditor
    };
  } catch (error) {
    console.error(`Failed to get file content for analysis:`, error);
    return null;
  }
}

/**
 * Detect programming language from file path
 */
function detectLanguageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const languageMap: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascriptreact', 
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.py': 'python',
    '.java': 'java',
    '.cs': 'csharp',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.c': 'c',
    '.h': 'c',
    '.hpp': 'cpp',
    '.php': 'php',
    '.go': 'go',
    '.rs': 'rust',
    '.rb': 'ruby',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.json': 'json',
    '.xml': 'xml',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.less': 'less',
    '.md': 'markdown',
    '.sql': 'sql',
    '.sh': 'shellscript',
    '.bash': 'shellscript',
    '.zsh': 'shellscript',
    '.yml': 'yaml',
    '.yaml': 'yaml'
  };
  
  return languageMap[ext] || 'plaintext';
}

export function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[<>:"/\\|?*]/g, '_');
}
