/**
 * help tests to mock the platform related node modules, such as path, os.platform().
 *
 * Important: you need to import this module before the module you want to test.
 */

import * as os from 'os';

// Determine the current platform
export const actualPlatform = os.platform();

let mockPlatform = actualPlatform;
const platformSpy = jest.spyOn(os, 'platform');

jest.mock('path', () => {
  const actualPath = jest.requireActual('path');

  // Return a mock object that dynamically adjusts based on `mockPlatform`
  // Create a new object to hold the mock implementation
  const pathMock = {
    get sep() {
      return mockPlatform === 'win32' ? '\\' : '/';
    },
  };

  // Dynamically add all other methods from the correct platform version
  for (const key of Object.keys(actualPath.posix)) {
    if (typeof actualPath.posix[key] === 'function') {
      pathMock[key] = (...args: any[]) => {
        const platformPath = mockPlatform === 'win32' ? actualPath.win32 : actualPath.posix;
        return platformPath[key](...args);
      };
    }
  }

  return pathMock;
});

// Utility function to switch the platform in tests
export const setPlatform = (platform: NodeJS.Platform) => {
  platformSpy.mockReturnValue(platform);
  mockPlatform = platform;
};

/* restore the the native platform's path module */
export const restorePlatform = () => {
  setPlatform(actualPlatform);
};

//=== original ===

// let mockPlatform = actualPlatform;
// const getMockPlatform = jest.fn().mockReturnValue(actualPlatform);
// const mockSep = jest.fn().mockReturnValue(actualPlatform === 'win32' ? '\\' : '/');

// jest.mock('path', () => {
//   const actualPath = jest.requireActual('path');

//   // Return a mock object that dynamically adjusts based on `mockPlatform`
//   // Create a new object to hold the mock implementation
//   const pathMock = {
//     get sep() {
//       return mockSep();
//     },
//   };

//   // Dynamically add all other methods from the correct platform version
//   for (const key of Object.keys(actualPath.posix)) {
//     if (typeof actualPath.posix[key] === 'function') {
//       pathMock[key] = (...args: any[]) => {
//         const platformPath = getMockPlatform() === 'win32' ? actualPath.win32 : actualPath.posix;
//         return platformPath[key](...args);
//       };
//     }
//   }

//   return pathMock;
// });

// // Utility function to switch the platform in tests
// export const setPlatform = (platform: NodeJS.Platform) => {
//   jest.spyOn(os, 'platform').mockReturnValue(platform);

//   getMockPlatform.mockReturnValue(platform);
//   mockSep.mockReturnValue(platform === 'win32' ? '\\' : '/');
// };

// /* restore the the native platform's path module */
// export const restorePlatformPath = () => {
//   mockSep.mockReset();
//   setPlatform(actualPlatform);
//   mockSep.mockReturnValue(actualPlatform === 'win32' ? '\\' : '/');
// };
