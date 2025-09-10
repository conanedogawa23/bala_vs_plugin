// Jest setup file for VSCode extension tests

// Mock VSCode API for tests
const mockVSCode = {
  window: {
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showQuickPick: jest.fn(),
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn(),
    createOutputChannel: jest.fn(() => ({
      clear: jest.fn(),
      appendLine: jest.fn(),
      show: jest.fn(),
      dispose: jest.fn()
    })),
    withProgress: jest.fn((options, task) => task({ report: jest.fn() })),
    activeTextEditor: null,
    showTextDocument: jest.fn()
  },
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn()
    })),
    getWorkspaceFolder: jest.fn(),
    workspaceFolders: [],
    openTextDocument: jest.fn(),
    findFiles: jest.fn(),
    fs: {
      stat: jest.fn(),
      readFile: jest.fn(),
      writeFile: jest.fn()
    }
  },
  commands: {
    registerCommand: jest.fn(),
    executeCommand: jest.fn()
  },
  Uri: {
    file: jest.fn((path: string) => ({ fsPath: path, path })),
    joinPath: jest.fn(),
    parse: jest.fn()
  },
  Range: jest.fn(),
  Position: jest.fn(),
  ProgressLocation: {
    Notification: 15,
    Window: 10,
    SourceControl: 1
  },
  ExtensionContext: jest.fn(),
  ViewColumn: {
    One: 1,
    Two: 2,
    Three: 3,
    Active: -1,
    Beside: -2
  }
};

// Make vscode available globally for tests
(global as any).vscode = mockVSCode;

// Setup console spying
(global as any).console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

// Setup fetch mock if needed
(global as any).fetch = jest.fn();

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
