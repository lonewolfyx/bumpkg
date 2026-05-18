import type { PackageContext, WorkspaceConfig } from '../types'
import { dirname } from 'node:path'
import { findUp } from 'find-up'
import { glob } from 'glob'
import { PACKAGE_MANIFEST_GLOB } from '@/constant.ts'
import { getPackageManagement } from './manager'
import { readProjectManifest } from './manifest'
import { getManifestWorkspacePatterns } from './workspace'
import { readYarnConfig } from './yarn'

function hasWorkspacePackages(workspaceConfig: WorkspaceConfig): boolean {
    return (workspaceConfig.packages?.length ?? 0) > 0
}

export async function resolvePackageContext(cwd: string): Promise<PackageContext> {
    const [nearestManifestPath, packageManagement] = await Promise.all([
        findUp(async currentDir => (await glob(PACKAGE_MANIFEST_GLOB, {
            cwd: currentDir,
            nodir: true,
        })).sort()[0], {
            cwd,
        }),
        getPackageManagement(cwd),
    ])

    if (!nearestManifestPath)
        throw new Error(`Unable to locate package manifest from ${cwd}`)

    let rootPackagePath = nearestManifestPath
    let rootManifest = await readProjectManifest(rootPackagePath)
    let workspaceFilePath = ''
    let workspaceConfig: WorkspaceConfig = {}
    let yarnConfigPath = ''
    let yarnConfig: WorkspaceConfig = {}

    const manifestWorkspacePatterns = getManifestWorkspacePatterns(rootManifest)
    let monorepo = manifestWorkspacePatterns.length > 0

    if (!monorepo) {
        const pnpmWorkspacePath = await findUp('pnpm-workspace.yaml', {
            cwd,
            type: 'file',
        })

        if (pnpmWorkspacePath) {
            const pnpmWorkspaceConfig = await readYarnConfig(pnpmWorkspacePath)

            if (hasWorkspacePackages(pnpmWorkspaceConfig)) {
                workspaceFilePath = pnpmWorkspacePath
                workspaceConfig = pnpmWorkspaceConfig
                monorepo = true

                const workspaceRootDir = dirname(pnpmWorkspacePath)
                const workspaceRootPackagePath = await findUp(async currentDir => (await glob(PACKAGE_MANIFEST_GLOB, {
                    cwd: currentDir,
                    nodir: true,
                })).sort()[0], {
                    cwd: workspaceRootDir,
                    stopAt: workspaceRootDir,
                })

                if (workspaceRootPackagePath) {
                    rootPackagePath = workspaceRootPackagePath
                    rootManifest = workspaceRootPackagePath === nearestManifestPath
                        ? rootManifest
                        : await readProjectManifest(workspaceRootPackagePath)
                }
            }
        }
    }

    if (packageManagement === 'yarn') {
        yarnConfigPath = await findUp('.yarnrc.yml', {
            cwd,
            type: 'file',
        }) ?? ''
        yarnConfig = yarnConfigPath ? await readYarnConfig(yarnConfigPath) : {}
    }

    if (packageManagement === 'bun' && !workspaceFilePath) {
        const bunWorkspaceConfig = getManifestWorkspacePatterns(rootManifest).length > 0 && !Array.isArray(rootManifest.workspaces)
            ? rootManifest.workspaces
            : undefined

        if (bunWorkspaceConfig) {
            workspaceConfig = bunWorkspaceConfig
        }
    }

    const packages = monorepo
        ? await glob(`**/${PACKAGE_MANIFEST_GLOB}`, {
                absolute: true,
                cwd: dirname(rootPackagePath),
                ignore: ['**/node_modules/**'],
                nodir: true,
            }).then(matches => Array.from(new Set([rootPackagePath, ...matches])).sort())
        : [rootPackagePath]

    return {
        rootDir: dirname(rootPackagePath),
        rootPackagePath,
        rootManifest,
        packageManagement,
        packageManager: rootManifest.packageManager ?? '',
        monorepo,
        packages,
        workspaceFilePath,
        workspaceConfig,
        yarnConfigPath,
        yarnConfig,
    }
}
