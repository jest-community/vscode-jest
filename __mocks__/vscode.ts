const languages = {
    createDiagnosticCollection: jest.fn()
};

const StatusBarAlignment = {};

const window = {
    createStatusBarItem: jest.fn(),
    showErrorMessage: jest.fn()
};

const workspace = {
    getConfiguration: jest.fn()
};

export {
    languages,
    StatusBarAlignment,
    window,
    workspace
};