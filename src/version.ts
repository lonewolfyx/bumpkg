import type { RegistryPackageMetadata, UpdateLevel } from './types'
import semver from 'semver'
import { isSkippedRange, isSupportedRange } from './constant'

export function stripVersionPrefix(specifier: string): string {
    const value = specifier.trim()
    if (value === '*')
        return value
    return value.replace(/^[~^]/, '')
}

export function getCurrentVersionFromSpecifier(specifier: string): string | null {
    if (specifier.trim() === '*')
        return null

    return semver.valid(stripVersionPrefix(specifier)) ?? semver.clean(stripVersionPrefix(specifier))
}

export function normalizeUpdateLevel(diff: semver.ReleaseType | null): UpdateLevel | null {
    switch (diff) {
        case 'premajor':
        case 'major':
            return 'major'
        case 'preminor':
        case 'minor':
            return 'minor'
        case 'prepatch':
        case 'patch':
        case 'prerelease':
            return 'patch'
        default:
            return null
    }
}

export function detectUpdateLevel(currentVersion: string, newVersion: string): UpdateLevel | null {
    return normalizeUpdateLevel(semver.diff(currentVersion, newVersion))
}

export function getSortedStableVersions(versions: string[]): string[] {
    return versions
        .filter(version => semver.valid(version) && semver.prerelease(version) === null)
        .sort(semver.compare)
}

export function resolveLatestVersion(metadata: RegistryPackageMetadata): string | null {
    const latest = metadata.distTags.latest
    if (latest && semver.valid(latest) && semver.prerelease(latest) === null)
        return latest

    return getSortedStableVersions(metadata.versions).at(-1) ?? null
}

export function buildNextSpecifier(currentSpecifier: string, newVersion: string): string {
    const trimmed = currentSpecifier.trim()

    if (trimmed === '*')
        return newVersion

    if (trimmed.startsWith('^'))
        return `^${newVersion}`

    if (trimmed.startsWith('~'))
        return `~${newVersion}`

    return newVersion
}

export function shouldProcessSpecifier(specifier: string): boolean {
    return isSupportedRange(specifier) && !isSkippedRange(specifier)
}

export function selectTargetVersion(
    currentSpecifier: string,
    metadata: RegistryPackageMetadata,
    includeMajor: boolean,
): { newVersion: string, updateLevel: UpdateLevel, nextSpecifier: string } | null {
    if (!shouldProcessSpecifier(currentSpecifier))
        return null

    const latestVersion = resolveLatestVersion(metadata)
    if (!latestVersion)
        return null

    if (currentSpecifier.trim() === '*') {
        return {
            newVersion: latestVersion,
            updateLevel: detectUpdateLevel('0.0.0', latestVersion) ?? 'patch',
            nextSpecifier: buildNextSpecifier(currentSpecifier, latestVersion),
        }
    }

    const currentVersion = getCurrentVersionFromSpecifier(currentSpecifier)
    if (!currentVersion)
        return null

    const stableVersions = getSortedStableVersions(metadata.versions)
    const targetVersion = includeMajor
        ? stableVersions.filter(version => semver.gt(version, currentVersion)).at(-1) ?? null
        : stableVersions
            .filter(version => semver.gt(version, currentVersion) && semver.major(version) === semver.major(currentVersion))
            .at(-1) ?? null

    if (!targetVersion)
        return null

    const updateLevel = detectUpdateLevel(currentVersion, targetVersion)
    if (!updateLevel)
        return null

    if (!includeMajor && updateLevel === 'major')
        return null

    return {
        newVersion: targetVersion,
        updateLevel,
        nextSpecifier: buildNextSpecifier(currentSpecifier, targetVersion),
    }
}
