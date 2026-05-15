import type {
    CheckUpdateOptions,
    CheckUpdateResult,
    ProjectConfig,
    RegistryPackageMetadata,
    UpdateCandidate,
} from './types'
import { getPackageMetadata } from './npm'
import { selectTargetVersion, shouldProcessSpecifier } from './version'

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
        source: {
            filePath: entry.filePath,
            source: entry.source,
            manifestFormat: entry.manifestFormat,
            catalogName: entry.catalogName,
        },
    }
}

export async function checkUpdateDependencies(
    config: ProjectConfig,
    options: CheckUpdateOptions = {},
): Promise<CheckUpdateResult> {
    const fetchPackageMetadata = options.fetchPackageMetadata ?? getPackageMetadata
    const includeMajor = options.includeMajor ?? false
    const metadataCache = new Map<string, RegistryPackageMetadata>()
    const candidates: UpdateCandidate[] = []
    const errors: CheckUpdateResult['errors'] = []

    for (const entry of config.allDependencies) {
        if (!shouldProcessSpecifier(entry.version))
            continue

        let metadata = metadataCache.get(entry.name)

        if (!metadata) {
            try {
                metadata = await fetchPackageMetadata(entry.name)
                metadataCache.set(entry.name, metadata)
            }
            catch (error) {
                errors.push({
                    name: entry.name,
                    currentVersion: entry.version,
                    reason: error instanceof Error ? error.message : 'Failed to fetch package metadata',
                    source: {
                        filePath: entry.filePath,
                        source: entry.source,
                        manifestFormat: entry.manifestFormat,
                        catalogName: entry.catalogName,
                    },
                })
                continue
            }
        }

        const candidate = createUpdateCandidate(entry, metadata, includeMajor)
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
