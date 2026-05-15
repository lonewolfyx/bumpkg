import type {
    ApplyUpdatesOptions,
    ApplyUpdatesResult,
    PackageManifest,
    UpdateCandidate,
    UpdatedFileResult,
    WorkspaceConfig,
} from './types'
import { readProjectManifest, writeProjectManifest } from './config'

function canApplyCandidate(candidate: UpdateCandidate, includeMajor: boolean): boolean {
    return includeMajor || candidate.updateLevel !== 'major'
}

export function groupCandidatesByFile(
    candidates: UpdateCandidate[],
    includeMajor: boolean,
): Map<string, UpdateCandidate[]> {
    const grouped = new Map<string, UpdateCandidate[]>()

    for (const candidate of candidates) {
        if (!canApplyCandidate(candidate, includeMajor))
            continue

        const current = grouped.get(candidate.source.filePath) ?? []
        current.push(candidate)
        grouped.set(candidate.source.filePath, current)
    }

    return grouped
}

function applyManifestDependencyUpdates(
    manifest: Record<string, any>,
    candidates: UpdateCandidate[],
): string[] {
    const updatedDependencies: string[] = []

    for (const candidate of candidates) {
        if (
            candidate.source.source === 'dependencies'
            || candidate.source.source === 'devDependencies'
            || candidate.source.source === 'optionalDependencies'
        ) {
            manifest[candidate.source.source] ??= {}
            manifest[candidate.source.source][candidate.name] = candidate.nextSpecifier
            updatedDependencies.push(candidate.name)
        }
    }

    return updatedDependencies
}

function applyWorkspaceCatalogUpdates(
    workspaceConfig: WorkspaceConfig,
    candidates: UpdateCandidate[],
): string[] {
    const updatedDependencies: string[] = []

    for (const candidate of candidates) {
        if (candidate.source.source === 'catalog') {
            workspaceConfig.catalog ??= {}
            workspaceConfig.catalog[candidate.name] = candidate.nextSpecifier
            updatedDependencies.push(candidate.name)
            continue
        }

        if (candidate.source.source === 'catalogs' && candidate.source.catalogName) {
            const catalogName = candidate.source.catalogName
            workspaceConfig.catalogs ??= {}
            workspaceConfig.catalogs[catalogName] ??= {}
            workspaceConfig.catalogs[catalogName]![candidate.name] = candidate.nextSpecifier
            updatedDependencies.push(`${catalogName}:${candidate.name}`)
        }
    }

    return updatedDependencies
}

function resolveWorkspaceConfigTarget(manifest: PackageManifest | WorkspaceConfig): WorkspaceConfig {
    if ('workspaces' in manifest && manifest.workspaces && !Array.isArray(manifest.workspaces))
        return manifest.workspaces

    return manifest as WorkspaceConfig
}

export async function applyUpdatesToFile(
    filePath: string,
    candidates: UpdateCandidate[],
): Promise<UpdatedFileResult> {
    const catalogCandidates = candidates.filter(candidate => candidate.source.source === 'catalog' || candidate.source.source === 'catalogs')
    const manifest = await readProjectManifest(filePath)
    const updatedDependencies = applyManifestDependencyUpdates(manifest as Record<string, any>, candidates)

    if (catalogCandidates.length > 0) {
        const workspaceConfig = resolveWorkspaceConfigTarget(manifest)
        updatedDependencies.push(...applyWorkspaceCatalogUpdates(workspaceConfig, catalogCandidates))
    }

    await writeProjectManifest(filePath, manifest)

    return {
        filePath,
        updatedDependencies,
    }
}

export async function applyDependencyUpdates(
    candidates: UpdateCandidate[],
    options: ApplyUpdatesOptions = {},
): Promise<ApplyUpdatesResult> {
    const includeMajor = options.includeMajor ?? false
    const grouped = groupCandidatesByFile(candidates, includeMajor)
    const updatedFiles: UpdatedFileResult[] = []

    for (const [filePath, fileCandidates] of grouped.entries()) {
        updatedFiles.push(await applyUpdatesToFile(filePath, fileCandidates))
    }

    return {
        updatedFiles,
        updatedCount: updatedFiles.reduce((count, item) => count + item.updatedDependencies.length, 0),
    }
}
