import type { DependencyLocation, UpdateCandidate } from './types'

export function normalizeRegistryUrl(registryUrl: string): string {
    return registryUrl.endsWith('/') ? registryUrl : `${registryUrl}/`
}

export function isWildcardSpecifier(specifier: string): boolean {
    return specifier.trim() === '*'
}

export function toPrettyJson(value: unknown): string {
    return `${JSON.stringify(value, null, 4)}\n`
}

export function toDependencyLocation(location: DependencyLocation): DependencyLocation {
    return {
        filePath: location.filePath,
        source: location.source,
        manifestFormat: location.manifestFormat,
        catalogName: location.catalogName,
    }
}

export function sortUpdateCandidates(candidates: UpdateCandidate[]): void {
    candidates.sort((left, right) => {
        const nameCompare = left.name.localeCompare(right.name)
        if (nameCompare !== 0)
            return nameCompare

        return left.source.filePath.localeCompare(right.source.filePath)
    })
}
