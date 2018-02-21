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
  // Known `create-react-app` `scripts-version`s:
  const packageNames = ['react-scripts', 'react-native-scripts', 'react-scripts-ts']
  // If possible, try to parse `package.json` and look for known packages
  try {
    const packagePath = join(rootPath, 'package.json')
    const packageJSON = JSON.parse(readFileSync(packagePath, 'utf8'))
    if (!packageJSON || !packageJSON.dependencies) {
      return false
    }
    const dependencies = packageJSON.dependencies as { [id: string]: string }
    return packageNames.some(pkg => !!dependencies[pkg])
  } catch {}
  // In case parsing `package.json` failed or was unconclusive,
  // check for the presence of binaries from known packages
  return packageNames.some(pkg => hasNodeExecutable(rootPath, pkg))
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
