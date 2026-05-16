import type { PackageContext } from '../types'
import { dirname } from 'node:path'
import { findUp, findUpMultiple } from 'find-up'
import { PACKAGE_MANIFEST_NAMES } from '../constant'
import { readProjectManifest } from './manifest'
import { resolvePnpmWorkspaceContext } from './pnpm'
import { collectWorkspacePackagePaths, getManifestWorkspacePatterns } from './workspace'
import { readYarnConfig, YARN_CONFIG_FILE } from './yarn'

export async function resolvePackageContext(cwd: string): Promise<PackageContext> {
    const [manifestPaths, pnpmWorkspaceContext, yarnConfigPath] = await Promise.all([
        findUpMultiple(PACKAGE_MANIFEST_NAMES, {
            cwd,
            type: 'file',
        }),
        resolvePnpmWorkspaceContext(cwd),
        findUp(YARN_CONFIG_FILE, {
            cwd,
            type: 'file',
        }),
    ])
    const nearestManifestPath = manifestPaths[0]

    if (!nearestManifestPath)
        throw new Error(`Unable to locate package manifest from ${cwd}`)

    const [manifestEntries, yarnConfig] = await Promise.all([
        Promise.all(
            manifestPaths.map(async manifestPath => [manifestPath, await readProjectManifest(manifestPath)] as const),
        ),
        yarnConfigPath ? readYarnConfig(yarnConfigPath) : Promise.resolve(undefined),
    ])

    const pnpmWorkspaceRoot = pnpmWorkspaceContext?.rootPackagePath && pnpmWorkspaceContext.packagePaths.includes(nearestManifestPath)
        ? pnpmWorkspaceContext.rootPackagePath
        : undefined
    let rootPackagePath = pnpmWorkspaceRoot ?? nearestManifestPath

    if (!pnpmWorkspaceRoot) {
        const workspaceOwners = await Promise.all(
            manifestEntries.map(async ([manifestPath, manifest]) => {
                const workspacePatterns = getManifestWorkspacePatterns(manifest)

                if (workspacePatterns.length === 0)
                    return undefined

                const packagePaths = await collectWorkspacePackagePaths(
                    dirname(manifestPath),
                    manifestPath,
                    workspacePatterns,
                )

                return packagePaths.includes(nearestManifestPath) ? manifestPath : undefined
            }),
        )

        rootPackagePath = workspaceOwners.find(Boolean) ?? nearestManifestPath
    }

    const rootManifest = manifestEntries.find(([manifestPath]) => manifestPath === rootPackagePath)?.[1]
        ?? await readProjectManifest(rootPackagePath)
    const activePnpmWorkspace = pnpmWorkspaceRoot === rootPackagePath
        ? pnpmWorkspaceContext
        : undefined
    const workspacePatterns = [
        ...getManifestWorkspacePatterns(rootManifest),
        ...(activePnpmWorkspace?.workspaceConfig.packages ?? []),
    ]
    const monorepo = workspacePatterns.length > 0
    const packages = monorepo
        ? await collectWorkspacePackagePaths(dirname(rootPackagePath), rootPackagePath, workspacePatterns)
        : [rootPackagePath]

    return {
        rootDir: dirname(rootPackagePath),
        rootPackagePath,
        rootManifest,
        monorepo,
        packages,
        workspaceFilePath: activePnpmWorkspace?.filePath,
        workspaceConfig: activePnpmWorkspace?.workspaceConfig,
        yarnConfigPath,
        yarnConfig,
    }
}
