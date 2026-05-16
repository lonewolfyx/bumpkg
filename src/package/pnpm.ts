import type { PnpmWorkspaceContext, WorkspaceConfig } from '../types'
import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { findUp } from 'find-up'
import { parse } from 'yaml'
import { PACKAGE_MANIFEST_NAMES } from '../constant'
import { collectWorkspacePackagePaths } from './workspace'

export const PNPM_WORKSPACE_FILE = 'pnpm-workspace.yaml'

export async function resolvePnpmWorkspaceContext(cwd: string): Promise<PnpmWorkspaceContext | undefined> {
    const filePath = await findUp(PNPM_WORKSPACE_FILE, {
        cwd,
        type: 'file',
    })

    if (!filePath)
        return undefined

    const rootDir = dirname(filePath)
    const [workspaceConfig, rootPackagePath] = await Promise.all([
        readFile(filePath, 'utf8').then(content => parse(content) as WorkspaceConfig),
        findUp(PACKAGE_MANIFEST_NAMES, {
            cwd: rootDir,
            stopAt: rootDir,
            type: 'file',
        }),
    ])

    const packagePaths = rootPackagePath
        ? await collectWorkspacePackagePaths(rootDir, rootPackagePath, workspaceConfig.packages ?? [])
        : []

    return {
        filePath,
        rootPackagePath,
        workspaceConfig,
        packagePaths,
    }
}
