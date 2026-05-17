import type {
    CheckUpdateError,
    CheckUpdateOptions,
    CheckUpdateResult,
    DependencyEntry,
    FetchPackageMetadata,
    PackageVersionQuery,
    PackageVersionResolution,
    ProjectConfig,
    RegistryPackageMetadata,
    ResolvePackageVersions,
    UpdateCandidate,
    UpdateLevel,
} from './types'
import { resolvePackageVersions } from './npm'
import { isWildcardSpecifier, sortUpdateCandidates, toDependencyLocation } from './utils'
import {
    buildNextSpecifier,
    buildSameMajorRangeSpecifier,
    detectUpdateLevel,
    getCurrentVersionFromSpecifier,
    resolveAvailableMajorVersion,
    resolveVersionNodeRequirement,
    selectTargetVersion,
    shouldProcessSpecifier,
} from './version'

function enrichUpdateCandidate(
    candidate: UpdateCandidate,
    metadata?: RegistryPackageMetadata,
): UpdateCandidate {
    if (!metadata)
        return candidate

    const currentVersion = getCurrentVersionFromSpecifier(candidate.currentSpecifier)
    if (!currentVersion)
        return candidate

    const currentNodeRequirement = resolveVersionNodeRequirement(metadata, currentVersion)
    const targetNodeRequirement = resolveVersionNodeRequirement(metadata, candidate.newVersion)

    if (targetNodeRequirement && targetNodeRequirement !== currentNodeRequirement)
        candidate.targetNodeRequirement = targetNodeRequirement

    if (candidate.updateLevel !== 'major') {
        const availableMajorVersion = resolveAvailableMajorVersion(currentVersion, metadata)
        if (availableMajorVersion) {
            candidate.availableMajorVersion = availableMajorVersion
            candidate.availableMajorNodeRequirement = resolveVersionNodeRequirement(metadata, availableMajorVersion) ?? undefined
        }
    }

    return candidate
}

function buildUpdateCandidate(
    entry: DependencyEntry,
    newVersion: string,
    updateLevel: UpdateLevel,
    metadata?: RegistryPackageMetadata,
): UpdateCandidate {
    return enrichUpdateCandidate({
        name: entry.name,
        currentVersion: entry.version,
        currentSpecifier: entry.version,
        newVersion,
        nextSpecifier: buildNextSpecifier(entry.version, newVersion),
        updateLevel,
        source: toDependencyLocation(entry),
    }, metadata)
}

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

    return buildUpdateCandidate(entry, selection.newVersion, selection.updateLevel, metadata)
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
        return buildUpdateCandidate(
            entry,
            newVersion,
            detectUpdateLevel('0.0.0', newVersion) ?? 'patch',
            resolution.metadata,
        )
    }

    const currentVersion = getCurrentVersionFromSpecifier(entry.version)
    if (!currentVersion)
        return null

    const updateLevel = detectUpdateLevel(currentVersion, newVersion)
    if (!updateLevel)
        return null

    return buildUpdateCandidate(entry, newVersion, updateLevel, resolution.metadata)
}

function getProcessableEntries(config: ProjectConfig): DependencyEntry[] {
    return config.allDependencies.filter(entry => shouldProcessSpecifier(entry.version))
}

function getErrorReason(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback
}

function createCheckError(entry: DependencyEntry, reason: string): CheckUpdateError {
    return {
        name: entry.name,
        currentVersion: entry.version,
        reason,
        source: toDependencyLocation(entry),
    }
}

function createCheckResult(
    candidates: UpdateCandidate[],
    errors: CheckUpdateError[],
): CheckUpdateResult {
    sortUpdateCandidates(candidates)

    return {
        candidates,
        errors,
    }
}

async function checkUpdateDependenciesWithResolvedVersions(
    config: ProjectConfig,
    includeMajor: boolean,
    resolveBatch: ResolvePackageVersions,
): Promise<CheckUpdateResult> {
    const processableEntries = getProcessableEntries(config)
    const uniqueQueries = new Map<string, PackageVersionQuery>()
    const candidates: UpdateCandidate[] = []
    const errors: CheckUpdateError[] = []

    for (const entry of processableEntries) {
        const specifier = getResolutionSpecifier(entry, includeMajor)
        uniqueQueries.set(toQueryKey(entry.name, specifier), {
            name: entry.name,
            specifier,
        })
    }

    const resolutions = await resolveBatch(Array.from(uniqueQueries.values()), undefined, config.rootDir)
    const resolutionMap = new Map(
        resolutions.map(resolution => [toQueryKey(resolution.name, resolution.specifier), resolution]),
    )

    for (const entry of processableEntries) {
        const resolution = resolutionMap.get(toQueryKey(entry.name, getResolutionSpecifier(entry, includeMajor)))
        if (!resolution)
            throw new Error(`Missing version resolution for ${entry.name}@${entry.version}.`)

        if (resolution.error) {
            errors.push(createCheckError(entry, resolution.error))
            continue
        }

        const candidate = createUpdateCandidateFromResolution(entry, resolution)
        if (candidate)
            candidates.push(candidate)
    }

    return createCheckResult(candidates, errors)
}

async function checkUpdateDependenciesWithMetadata(
    config: ProjectConfig,
    includeMajor: boolean,
    fetchPackageMetadata: FetchPackageMetadata,
): Promise<CheckUpdateResult> {
    const processableEntries = getProcessableEntries(config)
    const uniquePackageNames = Array.from(new Set(processableEntries.map(entry => entry.name)))
    const candidates: UpdateCandidate[] = []
    const errors: CheckUpdateError[] = []
    const metadataResults = await Promise.all(
        uniquePackageNames.map(async (packageName) => {
            try {
                return {
                    packageName,
                    metadata: await fetchPackageMetadata(packageName, undefined, config.rootDir),
                }
            }
            catch (error) {
                return {
                    packageName,
                    error: getErrorReason(error, 'Failed to fetch package metadata'),
                }
            }
        }),
    )
    const metadataResultMap = new Map(
        metadataResults.map(result => [result.packageName, result]),
    )

    for (const entry of processableEntries) {
        const metadataResult = metadataResultMap.get(entry.name)
        if (!metadataResult)
            throw new Error(`Missing package metadata lookup for ${entry.name}.`)

        if (!metadataResult.metadata) {
            errors.push(createCheckError(entry, metadataResult.error ?? 'Failed to fetch package metadata'))
            continue
        }

        const candidate = createUpdateCandidate(entry, metadataResult.metadata, includeMajor)
        if (candidate)
            candidates.push(candidate)
    }

    return createCheckResult(candidates, errors)
}

export async function checkUpdateDependencies(
    config: ProjectConfig,
    options: CheckUpdateOptions = {},
): Promise<CheckUpdateResult> {
    const includeMajor = options.includeMajor ?? false

    if (options.resolvePackageVersions)
        return await checkUpdateDependenciesWithResolvedVersions(config, includeMajor, options.resolvePackageVersions)

    if (options.fetchPackageMetadata)
        return await checkUpdateDependenciesWithMetadata(config, includeMajor, options.fetchPackageMetadata)

    return await checkUpdateDependenciesWithResolvedVersions(config, includeMajor, resolvePackageVersions)
}
