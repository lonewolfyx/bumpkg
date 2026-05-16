import type {
    DependencyEntry,
    DependencyType,
    ManifestFormat,
    PackageManifest,
    ProjectConfig,
    WorkspaceConfig,
} from './types'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { findUp } from 'find-up'
import { globSync } from 'glob'
import { parse, stringify } from 'yaml'
import {
    DEPENDENCY_FIELDS,
    PACKAGE_MANIFEST_NAMES,
    YAML_FILE_EXTENSIONS,
} from './constant'
import { resolveRegistryUrl } from './registry'
import { toPrettyJson } from './utils'

export function detectManifestFormat(filePath: string): ManifestFormat {
    return YAML_FILE_EXTENSIONS.includes(extname(filePath) as typeof YAML_FILE_EXTENSIONS[number]) ? 'yaml' : 'json'
}

export async function readProjectManifest(filePath: string): Promise<PackageManifest> {
    const content = await readFile(filePath, 'utf8')
    return detectManifestFormat(filePath) === 'yaml'
        ? parse(content) as PackageManifest
        : JSON.parse(content) as PackageManifest
}

export async function writeProjectManifest(filePath: string, manifest: PackageManifest | WorkspaceConfig): Promise<void> {
    const content = detectManifestFormat(filePath) === 'yaml'
        ? `${stringify(manifest)}`
        : toPrettyJson(manifest)

    await writeFile(filePath, content, 'utf8')
}

export async function findRootManifestPath(cwd: string): Promise<string> {
    const nearestManifest = await findNearestManifestPath(cwd)
    const workspaceFilePath = await findUp('pnpm-workspace.yaml', { cwd })

    if (!nearestManifest)
        throw new Error(`Unable to locate package manifest from ${cwd}`)

    if (workspaceFilePath) {
        const workspaceRoot = dirname(workspaceFilePath)
        const workspaceConfig = parse(await readFile(workspaceFilePath, 'utf8')) as WorkspaceConfig
        const workspacePackages = workspaceConfig.packages

        if ((workspacePackages?.length ?? 0) > 0) {
            for (const manifestName of PACKAGE_MANIFEST_NAMES) {
                const candidate = join(workspaceRoot, manifestName)
                try {
                    await readFile(candidate, 'utf8')
                    const workspacePackagePaths = collectWorkspacePackagePaths(
                        workspaceRoot,
                        candidate,
                        workspacePackages!,
                    )

                    if (workspacePackagePaths.includes(nearestManifest))
                        return candidate
                }
                catch {
                }
            }
        }
    }

    const ancestorWorkspaceManifest = await findAncestorWorkspaceManifest(nearestManifest)
    return ancestorWorkspaceManifest ?? nearestManifest
}

async function findManifestInDirectory(directory: string): Promise<string | undefined> {
    for (const manifestName of PACKAGE_MANIFEST_NAMES) {
        const manifestPath = join(directory, manifestName)

        try {
            await readFile(manifestPath, 'utf8')
            return manifestPath
        }
        catch {
        }
    }

    return undefined
}

async function findNearestManifestPath(cwd: string): Promise<string | undefined> {
    let currentDirectory = cwd

    while (currentDirectory !== dirname(currentDirectory)) {
        const manifestPath = await findManifestInDirectory(currentDirectory)
        if (manifestPath)
            return manifestPath

        currentDirectory = dirname(currentDirectory)
    }

    return undefined
}

export function getManifestWorkspaceConfig(manifest: PackageManifest): WorkspaceConfig | undefined {
    if (!manifest.workspaces || Array.isArray(manifest.workspaces))
        return undefined

    return manifest.workspaces
}

export function getManifestWorkspacePatterns(manifest: PackageManifest): string[] {
    if (Array.isArray(manifest.workspaces))
        return manifest.workspaces

    return [
        ...(manifest.packages ?? []),
        ...(getManifestWorkspaceConfig(manifest)?.packages ?? []),
    ]
}

async function findAncestorWorkspaceManifest(startManifestPath: string): Promise<string | undefined> {
    let currentDirectory = dirname(dirname(startManifestPath))

    while (currentDirectory !== dirname(currentDirectory)) {
        for (const manifestName of PACKAGE_MANIFEST_NAMES) {
            const manifestPath = join(currentDirectory, manifestName)

            try {
                const manifest = await readProjectManifest(manifestPath)
                if (getManifestWorkspacePatterns(manifest).length > 0)
                    return manifestPath
            }
            catch {
            }
        }

        currentDirectory = dirname(currentDirectory)
    }

    return undefined
}

export function normalizeWorkspacePatterns(patterns: string[]): { include: string[], ignore: string[] } {
    const include = patterns.filter(pattern => !pattern.startsWith('!'))
    const ignore = patterns
        .filter(pattern => pattern.startsWith('!'))
        .map(pattern => pattern.slice(1))

    return { include, ignore }
}

export function toManifestGlob(pattern: string): string {
    if (PACKAGE_MANIFEST_NAMES.some(name => pattern.endsWith(name)))
        return pattern.replace(/\\/g, '/')

    return `${pattern.replace(/\\/g, '/')}/{${PACKAGE_MANIFEST_NAMES.join(',')}}`
}

export function collectDependencyEntries(
    filePath: string,
    manifest: PackageManifest,
    field: DependencyType,
): DependencyEntry[] {
    return Object.entries(manifest[field] ?? {}).map(([name, version]) => ({
        name,
        version,
        filePath,
        source: field,
        manifestFormat: detectManifestFormat(filePath),
    }))
}

export function extractCatalogEntries(
    filePath: string,
    workspaceConfig: WorkspaceConfig,
): DependencyEntry[] {
    const entries: DependencyEntry[] = []
    const manifestFormat = detectManifestFormat(filePath)

    if (workspaceConfig.catalog) {
        for (const [name, version] of Object.entries(workspaceConfig.catalog)) {
            entries.push({
                name,
                version,
                filePath,
                source: 'catalog',
                manifestFormat,
            })
        }
    }

    if (workspaceConfig.catalogs) {
        for (const [catalogName, catalog] of Object.entries(workspaceConfig.catalogs)) {
            for (const [name, version] of Object.entries(catalog)) {
                entries.push({
                    name,
                    version,
                    filePath,
                    source: 'catalogs',
                    manifestFormat,
                    catalogName,
                })
            }
        }
    }

    return entries
}

export function collectWorkspacePackagePaths(
    rootDir: string,
    rootPackagePath: string,
    patterns: string[],
): string[] {
    const { include, ignore } = normalizeWorkspacePatterns(patterns)
    const packagePaths = new Set<string>([rootPackagePath])

    for (const pattern of include) {
        const matches = globSync(toManifestGlob(pattern), {
            absolute: true,
            cwd: rootDir,
            ignore: ignore.map(toManifestGlob),
            nodir: true,
        })

        for (const match of matches)
            packagePaths.add(match)
    }

    return Array.from(packagePaths).sort()
}

export async function resolveConfig(cwd: string = process.cwd()): Promise<ProjectConfig> {
    const rootPackagePath = await findRootManifestPath(cwd)
    const rootDir = dirname(rootPackagePath)
    const registryUrl = await resolveRegistryUrl()
    const rootManifest = await readProjectManifest(rootPackagePath)
    const manifestWorkspaceConfig = getManifestWorkspaceConfig(rootManifest)
    const workspaceFilePath = await findUp('pnpm-workspace.yaml', { cwd })
    const yarnConfigPath = await findUp('.yarnrc.yml', { cwd })

    const workspaceConfig = workspaceFilePath
        ? parse(await readFile(workspaceFilePath, 'utf8')) as WorkspaceConfig
        : undefined

    const yarnConfig = yarnConfigPath
        ? parse(await readFile(yarnConfigPath, 'utf8')) as WorkspaceConfig
        : undefined

    let activeWorkspaceFilePath = workspaceFilePath
    let activeWorkspaceConfig = workspaceConfig

    if (workspaceFilePath && workspaceConfig?.packages?.length) {
        const workspaceRoot = dirname(workspaceFilePath)
        const workspaceRootManifestPath = await findManifestInDirectory(workspaceRoot)

        if (workspaceRootManifestPath) {
            const workspacePackagePaths = collectWorkspacePackagePaths(
                workspaceRoot,
                workspaceRootManifestPath,
                workspaceConfig.packages,
            )

            if (!workspacePackagePaths.includes(rootPackagePath)) {
                activeWorkspaceFilePath = undefined
                activeWorkspaceConfig = undefined
            }
        }
    }

    const workspacePatterns = [
        ...getManifestWorkspacePatterns(rootManifest),
        ...(activeWorkspaceConfig?.packages ?? []),
    ]

    const monorepo = workspacePatterns.length > 0
    const packages = monorepo
        ? collectWorkspacePackagePaths(rootDir, rootPackagePath, workspacePatterns)
        : [rootPackagePath]

    const manifests = await Promise.all(
        packages.map(async (packagePath) => {
            const manifest = await readProjectManifest(packagePath)
            return { packagePath, manifest }
        }),
    )

    const dependencies = manifests.flatMap(({ packagePath, manifest }) => collectDependencyEntries(packagePath, manifest, DEPENDENCY_FIELDS[0]))
    const devDependencies = manifests.flatMap(({ packagePath, manifest }) => collectDependencyEntries(packagePath, manifest, DEPENDENCY_FIELDS[1]))
    const optionalDependencies = manifests.flatMap(({ packagePath, manifest }) => collectDependencyEntries(packagePath, manifest, DEPENDENCY_FIELDS[2]))

    const catalogDependencies = [
        ...(manifestWorkspaceConfig ? extractCatalogEntries(rootPackagePath, manifestWorkspaceConfig) : []),
        ...(activeWorkspaceFilePath && activeWorkspaceConfig ? extractCatalogEntries(activeWorkspaceFilePath, activeWorkspaceConfig) : []),
        ...(yarnConfigPath && yarnConfig ? extractCatalogEntries(yarnConfigPath, yarnConfig) : []),
    ]

    return {
        cwd,
        rootDir,
        registryUrl,
        rootPackagePath,
        monorepo,
        packages,
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
        workspaceFilePath: activeWorkspaceFilePath,
        yarnConfigPath,
    }
}
