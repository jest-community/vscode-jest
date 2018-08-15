'use strict'
import * as child_process from 'child_process'

import { ProjectWorkspace, Options } from '../../node_modules/jest-editor-support'

/**
 * Spawns and returns a Jest process with specific args
 *
 * @param {string[]} args
 * @returns {ChildProcess}
 */
/**
 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 *
 */
import { win32, posix } from 'path'

export const createProcessInWSL = (workspace: ProjectWorkspace, args, options: Options = { shell: true }) => {
  // A command could look like `npm run test`, which we cannot use as a command
  // as they can only be the first command, so take out the command, and add
  // any other bits into the args
  const runtimeExecutable = workspace.pathToJest
  const parameters = runtimeExecutable.split(' ')
  const command = parameters[0]
  const initialArgs = parameters.slice(1)
  let runtimeArgs = [].concat(initialArgs, args)

  // If a path to configuration file was defined, push it to runtimeArgs
  if (workspace.pathToConfig) {
    runtimeArgs.push('--config')
    runtimeArgs.push(workspace.pathToConfig)
  }

  runtimeArgs = runtimeArgs.map(windowsPathToWSL)

  // To use our own commands in create-react, we need to tell the command that
  // we're in a CI environment, or it will always append --watch
  const env = process.env
  env['CI'] = 'true'

  const spawnOptions = {
    cwd: workspace.rootPath,
    env: env,
    shell: options.shell,
  }

  if (workspace.debug) {
    console.log(`spawning process with command=${command}, args=${runtimeArgs.toString()}`)
  }

  return child_process.spawn(command, runtimeArgs, spawnOptions)
}

function windowsPathToWSL(maybePath: string): string {
  const isPath = win32.parse(maybePath).dir
  if (!isPath) {
    return maybePath
  }
  const windowsPath = maybePath[0].toLocaleLowerCase() + maybePath.substr(1)
  const path = windowsPath
    .split(win32.sep)
    .join(posix.sep)
    .replace(/^(\w):/, '/mnt/$1')

  return path
}
