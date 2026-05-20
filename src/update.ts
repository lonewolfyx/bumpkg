import type {
    ApplyUpdatesOptions,
    ApplyUpdatesResult,
    DependencyType,
    PackageManifest,
    UpdateCandidate,
    UpdatedFileResult,
    WorkspaceConfig,
} from './types'
import { readFile, writeFile } from 'node:fs/promises'
import { DEPENDENCY_FIELDS } from '@/constant.ts'
import { isYamlManifestPath, readProjectManifest, writeProjectManifest } from './package/manifest'
import { isWildcardSpecifier } from './utils'

function canApplyCandidate(candidate: UpdateCandidate, includeMajor: boolean): boolean {
    if (isWildcardSpecifier(candidate.currentSpecifier))
        return true

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
    manifest: PackageManifest,
    candidates: UpdateCandidate[],
): string[] {
    const updatedDependencies: string[] = []

    for (const candidate of candidates) {
        const source = candidate.source.source as DependencyType

        if (!DEPENDENCY_FIELDS.includes(source)) {
            continue
        }

        manifest[source] ??= {}
        manifest[source]![candidate.name] = candidate.nextSpecifier
        updatedDependencies.push(candidate.name)
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

function replaceYamlValue(
    lines: string[],
    sectionPath: string[],
    dependencyName: string,
    nextSpecifier: string,
): boolean {
    const pathStack: string[] = []

    for (const [index, line] of lines.entries()) {
        const trimmedLine = line.trimStart()
        if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith('-'))
            continue

        const indent = line.length - trimmedLine.length
        const colonIndex = line.indexOf(':')
        if (colonIndex <= indent)
            continue

        const rawKey = line.slice(indent, colonIndex).trim()
        if (!rawKey)
            continue

        const level = Math.floor(indent / 2)
        const key = rawKey.trim().replace(/^['"]|['"]$/g, '')
        pathStack.length = level
        pathStack[level] = key

        if (
            key !== dependencyName
            || pathStack.length !== sectionPath.length + 1
            || !sectionPath.every((section, sectionIndex) => pathStack[sectionIndex] === section)
        ) {
            continue
        }

        const suffix = line.slice(colonIndex + 1)
        const commentIndex = suffix.indexOf('#')
        const contentBeforeComment = commentIndex >= 0 ? suffix.slice(0, commentIndex) : suffix
        const leadingSpaceLength = contentBeforeComment.length - contentBeforeComment.trimStart().length
        const leadingSpace = contentBeforeComment.slice(0, leadingSpaceLength) || ' '
        const trailingWhitespaceLength = contentBeforeComment.length - contentBeforeComment.trimEnd().length
        const trailingComment = commentIndex >= 0
            ? `${contentBeforeComment.slice(contentBeforeComment.length - trailingWhitespaceLength)}${suffix.slice(commentIndex)}`
            : ''
        lines[index] = `${line.slice(0, colonIndex + 1)}${leadingSpace}${nextSpecifier}${trailingComment}`
        return true
    }

    return false
}

async function applyYamlManifestUpdates(
    filePath: string,
    candidates: UpdateCandidate[],
): Promise<string[]> {
    const lines = (await readFile(filePath, 'utf8')).split('\n')
    const updatedDependencies: string[] = []

    for (const candidate of candidates) {
        const updatedDependencyLabel = candidate.source.source === 'catalogs' && candidate.source.catalogName
            ? `${candidate.source.catalogName}:${candidate.name}`
            : candidate.name
        const sectionPaths
            = DEPENDENCY_FIELDS.includes(candidate.source.source as DependencyType)
                ? [[candidate.source.source]]
                : candidate.source.source === 'catalog'
                    ? [['catalog'], ['workspaces', 'catalog']]
                    : candidate.source.source === 'catalogs' && candidate.source.catalogName
                        ? [
                                ['catalogs', candidate.source.catalogName],
                                ['workspaces', 'catalogs', candidate.source.catalogName],
                            ]
                        : []
        const replaced = sectionPaths.some(sectionPath =>
            replaceYamlValue(lines, sectionPath, candidate.name, candidate.nextSpecifier),
        )
        if (!replaced)
            throw new Error(`Unable to update YAML entry for ${updatedDependencyLabel} in ${filePath}.`)

        updatedDependencies.push(updatedDependencyLabel)
    }

    await writeFile(filePath, lines.join('\n'), 'utf8')
    return updatedDependencies
}

export async function applyUpdatesToFile(
    filePath: string,
    candidates: UpdateCandidate[],
): Promise<UpdatedFileResult> {
    if (isYamlManifestPath(filePath)) {
        return {
            filePath,
            updatedDependencies: await applyYamlManifestUpdates(filePath, candidates),
        }
    }

    const catalogCandidates = candidates.filter(candidate => candidate.source.source === 'catalog' || candidate.source.source === 'catalogs')
    const manifest = await readProjectManifest(filePath)
    const updatedDependencies = applyManifestDependencyUpdates(manifest, candidates)

    if (catalogCandidates.length > 0) {
        const workspaceConfig
            = 'workspaces' in manifest && manifest.workspaces && !Array.isArray(manifest.workspaces)
                ? manifest.workspaces
                : manifest as WorkspaceConfig
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
