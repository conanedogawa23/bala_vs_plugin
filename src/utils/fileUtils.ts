import * as vscode from 'vscode';
import * as path from 'path';

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

export function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[<>:"/\\|?*]/g, '_');
}
