import type {
    CheckUpdateError,
    CheckUpdateResult,
    CommandArgs,
    DependencyEntry,
    PackageVersionQuery,
    PackageVersionResolution,
    ProjectConfig,
    RegistryPackageMetadata,
    UpdateCandidate,
} from './types'
import { resolvePackageVersions } from '@/npm.ts'
import { isWildcardSpecifier, toDependencyLocation } from './utils'
import {
    buildNextSpecifier,
    buildSameMajorRangeSpecifier,
    detectUpdateLevel,
    getCurrentVersionFromSpecifier,
    resolveAvailableMajorVersion,
    resolveVersionNodeRequirement,
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
        return enrichUpdateCandidate({
            name: entry.name,
            currentVersion: entry.version,
            currentSpecifier: entry.version,
            newVersion,
            nextSpecifier: buildNextSpecifier(entry.version, newVersion),
            updateLevel: detectUpdateLevel('0.0.0', newVersion) ?? 'patch',
            source: toDependencyLocation(entry),
        }, resolution.metadata)
    }

    const currentVersion = getCurrentVersionFromSpecifier(entry.version)
    if (!currentVersion)
        return null

    const updateLevel = detectUpdateLevel(currentVersion, newVersion)
    if (!updateLevel)
        return null

    return enrichUpdateCandidate({
        name: entry.name,
        currentVersion: entry.version,
        currentSpecifier: entry.version,
        newVersion,
        nextSpecifier: buildNextSpecifier(entry.version, newVersion),
        updateLevel,
        source: toDependencyLocation(entry),
    }, resolution.metadata)
}

export async function checkUpdateDependencies(config: ProjectConfig, options: CommandArgs): Promise<CheckUpdateResult> {
    const { major } = options
    const processableEntries = config.allDependencies.filter(entry => shouldProcessSpecifier(entry.version))
    const uniqueQueries = new Map<string, PackageVersionQuery>()
    const candidates: UpdateCandidate[] = []
    const errors: CheckUpdateError[] = []

    for (const entry of processableEntries) {
        const specifier = getResolutionSpecifier(entry, major)
        uniqueQueries.set(toQueryKey(entry.name, specifier), {
            name: entry.name,
            specifier,
        })
    }

    const resolutions = await resolvePackageVersions(Array.from(uniqueQueries.values()), config)
    const resolutionMap = new Map(
        resolutions.map(resolution => [toQueryKey(resolution.name, resolution.specifier), resolution]),
    )

    for (const entry of processableEntries) {
        const resolution = resolutionMap.get(toQueryKey(entry.name, getResolutionSpecifier(entry, major)))
        if (!resolution)
            throw new Error(`Missing version resolution for ${entry.name}@${entry.version}.`)

        if (resolution.error) {
            errors.push({
                name: entry.name,
                currentVersion: entry.version,
                reason: resolution.error,
                source: toDependencyLocation(entry),
            })
            continue
        }

        const candidate = createUpdateCandidateFromResolution(entry, resolution)
        if (candidate)
            candidates.push(candidate)
    }

    candidates.sort((left, right) => {
        const nameCompare = left.name.localeCompare(right.name)
        if (nameCompare !== 0)
            return nameCompare

        return left.source.filePath.localeCompare(right.source.filePath)
    })

    return {
        candidates,
        errors,
    }
}
