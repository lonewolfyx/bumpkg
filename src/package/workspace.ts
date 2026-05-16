import type { PackageManifest } from '../types'
import { glob } from 'glob'
import { PACKAGE_MANIFEST_NAMES } from '../constant'
import { getBunWorkspaceConfig } from './bun'
import { PACKAGE_MANIFEST_GLOB } from './manifest'

export function getManifestWorkspacePatterns(manifest: PackageManifest): string[] {
    const bunWorkspaceConfig = getBunWorkspaceConfig(manifest)

    return Array.from(new Set([
        ...(manifest.packages ?? []),
        ...(Array.isArray(manifest.workspaces) ? manifest.workspaces : []),
        ...(bunWorkspaceConfig?.packages ?? []),
    ]))
}

export function normalizeWorkspacePatterns(patterns: string[]): { include: string[], ignore: string[] } {
    return {
        include: patterns.filter(pattern => !pattern.startsWith('!')),
        ignore: patterns
            .filter(pattern => pattern.startsWith('!'))
            .map(pattern => pattern.slice(1)),
    }
}

export function toManifestGlob(pattern: string): string {
    const normalizedPattern = pattern.replace(/\\/g, '/').replace(/\/$/, '')

    return PACKAGE_MANIFEST_NAMES.some(name => normalizedPattern.endsWith(name))
        ? normalizedPattern
        : `${normalizedPattern}/${PACKAGE_MANIFEST_GLOB}`
}

export async function collectWorkspacePackagePaths(
    rootDir: string,
    rootPackagePath: string,
    patterns: string[],
): Promise<string[]> {
    const { include, ignore } = normalizeWorkspacePatterns(patterns)
    const scanPatterns = include.length > 0
        ? include.map(toManifestGlob)
        : [`**/${PACKAGE_MANIFEST_GLOB}`]

    const matches = await glob(scanPatterns, {
        absolute: true,
        cwd: rootDir,
        ignore: ignore.map(toManifestGlob),
        nodir: true,
    })

    return Array.from(new Set([rootPackagePath, ...matches])).sort()
}
