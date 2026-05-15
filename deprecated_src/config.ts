import type { ICatalogItem, IConfig, IPackageJson, IPnpmWorkspaceConfig } from '@/types.ts'
import { readFile } from 'node:fs/promises'
import { findUp } from 'find-up'
import { parse } from 'yaml'
import { formatDependencies } from '@/utils.ts'

export const extractCatalogData = (workspaceConfig: IPnpmWorkspaceConfig): ICatalogItem[] => {
    const catalogDependencies: ICatalogItem[] = []

    if (workspaceConfig.catalog) {
        Object.entries(workspaceConfig.catalog)
            .forEach(([dependency, version]) => {
                catalogDependencies.push({
                    dependency,
                    version,
                    type: 'catalog',
                    category: '*',
                })
            })
    }

    if (workspaceConfig.catalogs) {
        Object.entries(workspaceConfig.catalogs)
            .forEach(([catalogName, catalog]) => {
                Object.entries(catalog).forEach(([dependency, version]) => {
                    catalogDependencies.push({
                        dependency,
                        version,
                        type: 'catalogs',
                        category: catalogName,
                    })
                })
            })
    }

    return catalogDependencies
}

export const resolveConfig = async (): Promise<IConfig> => {
    const cwd = process.cwd()

    const npmLockFile = await findUp('package-lock.json', { cwd })
    const pnpmLockFile = await findUp('pnpm-lock.yaml', { cwd })

    const npm = !!npmLockFile
    const pnpm = !!pnpmLockFile

    let monorepo: boolean = false
    let catalog: ICatalogItem[] = []

    const workspaceFile = await findUp('pnpm-workspace.yaml', { cwd })

    if (workspaceFile && pnpm) {
        const workspaceContent = await readFile(workspaceFile, 'utf-8')
        const workspaceConfig = parse(workspaceContent) as IPnpmWorkspaceConfig

        monorepo = !!workspaceConfig.packages && workspaceConfig.packages.length > 0

        catalog = extractCatalogData(workspaceConfig)
    }

    const packageJsonPath = await findUp('package.json', {
        cwd,
    })
    const packageJson: IPackageJson = packageJsonPath ? JSON.parse(await readFile(packageJsonPath, 'utf-8')) : {}

    const dependencies = formatDependencies(packageJson.dependencies || {})
    const devDependencies = formatDependencies(packageJson.devDependencies || {})
    const optionalDependencies = formatDependencies(packageJson.optionalDependencies || {})

    return {
        cwd,
        npm,
        pnpm,
        monorepo,
        catalog,
        dependencies,
        devDependencies,
        optionalDependencies,
    }
}
