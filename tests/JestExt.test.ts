jest.unmock('../src/JestExt');

import { JestExt } from '../src/JestExt';
import { ProjectWorkspace, Settings } from 'jest-editor-support';
import { window, workspace } from 'vscode';

describe('JestExt', () => {
    const settingsMock = Settings as any as jest.Mock<any>;
    const getConfiguration = workspace.getConfiguration as jest.Mock<any>;
    let projectWorkspace: ProjectWorkspace;

    beforeEach(() => {
        jest.resetAllMocks();

        projectWorkspace = new ProjectWorkspace(null, null, null, null);
        getConfiguration.mockReturnValue({});
    });

    it('should show error message if jest version i < 18', () => {
        settingsMock.mockImplementation(() => ({
            getConfig: callback => callback(),
            jestVersionMajor: 17
        }));
        new JestExt(projectWorkspace, { appendLine: () => {} } as any);
        expect(window.showErrorMessage).toBeCalledWith('This extension relies on Jest 18+ features, it will work, but the highlighting may not work correctly.');
    });

    it('should not show error message if jest version is 18', () => {
        settingsMock.mockImplementation(() => ({
            getConfig: callback => callback(),
            jestVersionMajor: 18
        }));
        new JestExt(projectWorkspace, { appendLine: () => {} } as any);
        expect(window.showErrorMessage).not.toBeCalled();
    });
});