import { platform } from 'os'
import { existsSync, readFileSync } from 'fs'
import { normalize, join } from 'path'

import { IPluginSettings } from './IPluginSettings'

/**
 *  Handles getting the jest runner, handling the OS and project specific work too
 *
 * @returns {string}
 */
export function pathToJest(pluginSettings: IPluginSettings) {
  const path = normalize(pluginSettings.pathToJest)

  const defaultPath = normalize('node_modules/.bin/jest')
  if (path === defaultPath && isBootstrappedWithCreateReactApp(pluginSettings.rootPath)) {
    // If it's the default, run the script instead
    return 'npm test --'
  }

  return path
}

function isBootstrappedWithCreateReactApp(rootPath: string): boolean {
  // Known binary names of `react-scripts` forks:
  const packageBinaryNames = ['react-scripts', 'react-native-scripts', 'react-scripts-ts', 'react-app-rewired']
  // If possible, try to parse `package.json` and look for known binary beeing called in `scripts.test`
  try {
    const packagePath = join(rootPath, 'package.json')
    const packageJSON = JSON.parse(readFileSync(packagePath, 'utf8'))
    if (!packageJSON || !packageJSON.scripts || !packageJSON.scripts.test) {
      return false
    }
    const testCommand = packageJSON.scripts.test as string
    return packageBinaryNames.some(binary => testCommand.indexOf(binary + ' test ') === 0)
  } catch {}
  // In case parsing `package.json` failed or was unconclusive,
  // fallback to checking for the presence of the binaries in `./node_modules/.bin`
  return packageBinaryNames.some(binary => hasNodeExecutable(rootPath, binary))
}

function hasNodeExecutable(rootPath: string, executable: string): boolean {
  const ext = platform() === 'win32' ? '.cmd' : ''
  const absolutePath = join(rootPath, 'node_modules', '.bin', executable + ext)
  return existsSync(absolutePath)
}

/**
 * Handles getting the path to config file
 *
 * @returns {string}
 */
export function pathToConfig(pluginSettings: IPluginSettings) {
  if (pluginSettings.pathToConfig !== '') {
    return normalize(pluginSettings.pathToConfig)
  }

  return ''
}

export function pathToJestPackageJSON(pluginSettings: IPluginSettings): string | null {
  let pathToNodeModules = join(pluginSettings.rootPath, 'node_modules')

  if (pluginSettings.pathToJest) {
    const relativeJestCmd = removeSurroundingQuotes(pluginSettings.pathToJest.split(' ')[0])
    const relativePathToNodeModules = relativeJestCmd.replace(/node_modules.+$/i, 'node_modules')

    pathToNodeModules = join(pluginSettings.rootPath, relativePathToNodeModules)
  }

  const defaultPath = normalize(join(pathToNodeModules, 'jest/package.json'))
  const cliPath = normalize(join(pathToNodeModules, 'jest-cli/package.json'))
  const craPath = normalize(join(pathToNodeModules, 'react-scripts/node_modules/jest/package.json'))
  const paths = [defaultPath, cliPath, craPath]

  for (const i in paths) {
    if (existsSync(paths[i])) {
      return paths[i]
    }
  }

  return null
}

function removeSurroundingQuotes(str) {
  return str.replace(/^['"`]/, '').replace(/['"`]$/, '')
}

/**
 *  Taken From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // $& means the whole matched string
}
