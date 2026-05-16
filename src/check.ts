import type {
    CheckUpdateOptions,
    CheckUpdateResult,
    DependencyEntry,
    PackageVersionQuery,
    PackageVersionResolution,
    ProjectConfig,
    RegistryPackageMetadata,
    UpdateCandidate,
} from './types'
import { getNpmRegistryMetaData, resolvePackageVersions } from './npm'
import { isWildcardSpecifier, sortUpdateCandidates, toDependencyLocation } from './utils'
import {
    buildNextSpecifier,
    buildSameMajorRangeSpecifier,
    detectUpdateLevel,
    getCurrentVersionFromSpecifier,
    selectTargetVersion,
    shouldProcessSpecifier,
} from './version'

export function createUpdateCandidate(
    entry: ProjectConfig['allDependencies'][number],
    metadata: RegistryPackageMetadata,
    includeMajor: boolean,
): UpdateCandidate | null {
    if (!shouldProcessSpecifier(entry.version))
        return null

    const selection = selectTargetVersion(entry.version, metadata, includeMajor)
    if (!selection)
        return null

    return {
        name: entry.name,
        currentVersion: entry.version,
        currentSpecifier: entry.version,
        newVersion: selection.newVersion,
        nextSpecifier: selection.nextSpecifier,
        updateLevel: selection.updateLevel,
        source: toDependencyLocation(entry),
    }
}

function toQueryKey(name: string, specifier: string): string {
    return `${name}\u0000${specifier}`
}

function getResolutionSpecifier(entry: DependencyEntry, includeMajor: boolean): string {
    if (includeMajor || isWildcardSpecifier(entry.version))
        return '*'

    return buildSameMajorRangeSpecifier(entry.version) ?? entry.version.trim()
}

function createUpdateCandidateFromResolution(
    entry: DependencyEntry,
    resolution: PackageVersionResolution,
): UpdateCandidate | null {
    const newVersion = resolution.version?.trim()
    if (!newVersion)
        return null

    if (isWildcardSpecifier(entry.version)) {
        return {
            name: entry.name,
            currentVersion: entry.version,
            currentSpecifier: entry.version,
            newVersion,
            nextSpecifier: buildNextSpecifier(entry.version, newVersion),
            updateLevel: detectUpdateLevel('0.0.0', newVersion) ?? 'patch',
            source: toDependencyLocation(entry),
        }
    }

    const currentVersion = getCurrentVersionFromSpecifier(entry.version)
    if (!currentVersion)
        return null

    const updateLevel = detectUpdateLevel(currentVersion, newVersion)
    if (!updateLevel)
        return null

    return {
        name: entry.name,
        currentVersion: entry.version,
        currentSpecifier: entry.version,
        newVersion,
        nextSpecifier: buildNextSpecifier(entry.version, newVersion),
        updateLevel,
        source: toDependencyLocation(entry),
    }
}

async function checkUpdateDependenciesWithResolvedVersions(
    config: ProjectConfig,
    includeMajor: boolean,
    resolveBatch: (queries: readonly PackageVersionQuery[], registryUrl?: string, rootDir?: string) => Promise<PackageVersionResolution[]>,
): Promise<CheckUpdateResult> {
    const processableEntries = config.allDependencies.filter(entry => shouldProcessSpecifier(entry.version))
    const uniqueQueries = new Map<string, PackageVersionQuery>()

    for (const entry of processableEntries) {
        const specifier = getResolutionSpecifier(entry, includeMajor)
        uniqueQueries.set(toQueryKey(entry.name, specifier), {
            name: entry.name,
            specifier,
        })
    }

    const resolutions = await resolveBatch(Array.from(uniqueQueries.values()), config.registryUrl, config.rootDir)
    const resolutionMap = new Map(
        resolutions.map(resolution => [toQueryKey(resolution.name, resolution.specifier), resolution]),
    )
    const candidates: UpdateCandidate[] = []

    for (const entry of processableEntries) {
        const resolution = resolutionMap.get(toQueryKey(entry.name, getResolutionSpecifier(entry, includeMajor)))
        if (!resolution)
            throw new Error(`Missing version resolution for ${entry.name}@${entry.version}.`)

        const candidate = createUpdateCandidateFromResolution(entry, resolution)
        if (candidate)
            candidates.push(candidate)
    }

    sortUpdateCandidates(candidates)

    return {
        candidates,
        errors: [],
    }
}

async function checkUpdateDependenciesWithMetadata(
    config: ProjectConfig,
    includeMajor: boolean,
    fetchPackageMetadata: (packageName: string, registryUrl?: string, rootDir?: string) => Promise<RegistryPackageMetadata>,
): Promise<CheckUpdateResult> {
    const processableEntries = config.allDependencies.filter(entry => shouldProcessSpecifier(entry.version))
    const uniquePackageNames = Array.from(new Set(processableEntries.map(entry => entry.name)))
    const metadataCache = new Map<string, RegistryPackageMetadata>()
    const candidates: UpdateCandidate[] = []
    const errors: CheckUpdateResult['errors'] = []

    const metadataResults = await Promise.allSettled(
        uniquePackageNames.map(async packageName => [packageName, await fetchPackageMetadata(packageName, config.registryUrl, config.rootDir)] as const),
    )

    for (const result of metadataResults) {
        if (result.status === 'fulfilled') {
            const [packageName, metadata] = result.value
            metadataCache.set(packageName, metadata)
        }
    }

    for (const entry of processableEntries) {
        const metadata = metadataCache.get(entry.name)
        if (!metadata) {
            const failedResult = metadataResults[uniquePackageNames.indexOf(entry.name)]
            const reason = failedResult?.status === 'rejected'
                ? failedResult.reason instanceof Error
                    ? failedResult.reason.message
                    : 'Failed to fetch package metadata'
                : 'Failed to fetch package metadata'

            errors.push({
                name: entry.name,
                currentVersion: entry.version,
                reason,
                source: toDependencyLocation(entry),
            })
            continue
        }

        const candidate = createUpdateCandidate(entry, metadata, includeMajor)
        if (candidate)
            candidates.push(candidate)
    }

    sortUpdateCandidates(candidates)

    return {
        candidates,
        errors,
    }
}

export async function checkUpdateDependencies(
    config: ProjectConfig,
    options: CheckUpdateOptions = {},
): Promise<CheckUpdateResult> {
    const includeMajor = options.includeMajor ?? false
    const hasCustomResolver = options.resolvePackageVersions !== undefined
    const fetchPackageMetadata = options.fetchPackageMetadata ?? getNpmRegistryMetaData
    const resolveBatch = options.resolvePackageVersions ?? resolvePackageVersions

    try {
        return await checkUpdateDependenciesWithResolvedVersions(config, includeMajor, resolveBatch)
    }
    catch (error) {
        if (hasCustomResolver || !fetchPackageMetadata)
            throw error
    }

    return await checkUpdateDependenciesWithMetadata(config, includeMajor, fetchPackageMetadata)
}
