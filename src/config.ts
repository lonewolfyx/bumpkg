import type { ProjectConfig } from './types'
import { DEPENDENCY_FIELDS } from './constant'
import { getBunWorkspaceConfig } from './package/bun'
import { extractCatalogEntries } from './package/catalog'
import { collectDependencyEntries } from './package/dependency'
import { readProjectManifest } from './package/manifest'
import { resolvePackageContext } from './package/project'

export async function resolveConfig(cwd: string = process.cwd()): Promise<ProjectConfig> {
    const packageContext = await resolvePackageContext(cwd)

    const manifests = await Promise.all(
        packageContext.packages.map(async packagePath => ({
            packagePath,
            manifest: await readProjectManifest(packagePath),
        })),
    )

    const dependencies = manifests.flatMap(({ packagePath, manifest }) =>
        collectDependencyEntries(packagePath, manifest, DEPENDENCY_FIELDS[0]),
    )
    const devDependencies = manifests.flatMap(({ packagePath, manifest }) =>
        collectDependencyEntries(packagePath, manifest, DEPENDENCY_FIELDS[1]),
    )
    const optionalDependencies = manifests.flatMap(({ packagePath, manifest }) =>
        collectDependencyEntries(packagePath, manifest, DEPENDENCY_FIELDS[2]),
    )
    const bunWorkspaceConfig = getBunWorkspaceConfig(packageContext.rootManifest)
    const catalogDependencies = [
        ...(bunWorkspaceConfig ? extractCatalogEntries(packageContext.rootPackagePath, bunWorkspaceConfig) : []),
        ...(packageContext.workspaceFilePath && packageContext.workspaceConfig
            ? extractCatalogEntries(packageContext.workspaceFilePath, packageContext.workspaceConfig)
            : []),
        ...(packageContext.yarnConfigPath && packageContext.yarnConfig
            ? extractCatalogEntries(packageContext.yarnConfigPath, packageContext.yarnConfig)
            : []),
    ]

    return {
        cwd,
        rootDir: packageContext.rootDir,
        rootPackagePath: packageContext.rootPackagePath,
        monorepo: packageContext.monorepo,
        packages: packageContext.packages,
        dependencies,
        devDependencies,
        optionalDependencies,
        catalogDependencies,
        allDependencies: [
            ...dependencies,
            ...devDependencies,
            ...optionalDependencies,
            ...catalogDependencies,
        ],
        workspaceFilePath: packageContext.workspaceFilePath,
        yarnConfigPath: packageContext.yarnConfigPath,
    }
}
