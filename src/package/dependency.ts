import type { DependencyEntry, DependencyType, PackageManifest } from '../types'
import { resolveManifestFormat } from './manifest'

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
        manifestFormat: resolveManifestFormat(filePath),
    }))
}
