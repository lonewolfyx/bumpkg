import type { CommandArgs, UpdateCandidate } from './types'
import { confirm, isCancel } from '@clack/prompts'
import { checkUpdateDependencies } from './check'
import { resolveConfig } from './config'
import { CLI_BASE_TABLE_HEADERS, CLI_CATALOG_TABLE_HEADERS } from './constant'
import { cleanupLockFiles } from './lock'
import { applyDependencyUpdates } from './update'
import { getDependencyTypes } from './utils'

export function formatCandidateNextVersion(candidate: Pick<UpdateCandidate, 'nextSpecifier' | 'targetNodeRequirement' | 'availableMajorVersion' | 'availableMajorNodeRequirement'>): string {
    const notes: string[] = []

    if (candidate.targetNodeRequirement)
        notes.push(`requires node ${candidate.targetNodeRequirement}`)

    if (candidate.availableMajorVersion) {
        const availableMajorSummary = candidate.availableMajorNodeRequirement
            ? `${candidate.availableMajorVersion} available, requires node ${candidate.availableMajorNodeRequirement}`
            : `${candidate.availableMajorVersion} available`
        notes.push(availableMajorSummary)
    }

    return notes.length > 0
        ? `${candidate.nextSpecifier} (${notes.join('; ')})`
        : candidate.nextSpecifier
}

export function renderUpdateTable(candidates: UpdateCandidate[]): string {
    const showCatalogColumns = candidates.some(candidate =>
        candidate.source.source === 'catalog' || candidate.source.source === 'catalogs',
    )
    const headers = showCatalogColumns
        ? [...CLI_BASE_TABLE_HEADERS, ...CLI_CATALOG_TABLE_HEADERS]
        : [...CLI_BASE_TABLE_HEADERS]
    const rows = candidates.map((candidate) => {
        const baseColumns = [
            candidate.name,
            candidate.currentSpecifier,
            formatCandidateNextVersion(candidate),
            getDependencyTypes(candidate.source).join(', ') || '-',
        ]

        if (!showCatalogColumns)
            return baseColumns

        const isCatalogCandidate = candidate.source.source === 'catalog' || candidate.source.source === 'catalogs'

        return [
            ...baseColumns,
            isCatalogCandidate ? candidate.source.source : '-',
            isCatalogCandidate ? (candidate.source.catalogName ?? '-') : '-',
        ]
    })

    const widths = headers.map((header, columnIndex) =>
        Math.max(header.length, ...rows.map(row => row[columnIndex]?.length ?? 0)),
    )

    const formatRow = (columns: string[]): string => columns
        .map((column, columnIndex) => column.padEnd(widths[columnIndex] ?? column.length))
        .join(' | ')

    const divider = widths.map(width => '-'.repeat(width)).join('-|-')

    return [
        formatRow(headers),
        divider,
        ...rows.map(formatRow),
    ].join('\n')
}

export async function runCliWithOptions(
    options: CommandArgs,
): Promise<void> {
    const config = await resolveConfig(options)
    const checkResult = await checkUpdateDependencies(config, {
        includeMajor: options.major,
    })

    if (checkResult.errors.length > 0) {
        console.error(`Failed to check ${checkResult.errors.length} dependencies.`)

        for (const error of checkResult.errors.slice(0, 5))
            console.error(`${error.name}: ${error.reason}`)

        if (checkResult.errors.length > 5)
            console.error(`...and ${checkResult.errors.length - 5} more errors.`)
    }

    if (checkResult.candidates.length === 0) {
        if (checkResult.errors.length > 0)
            return

        console.log('No updatable dependencies found.')
        return
    }

    console.log(renderUpdateTable(checkResult.candidates))

    const confirmedResult = await confirm({
        message: 'Apply these dependency updates?',
        initialValue: true,
    })
    const confirmed = !isCancel(confirmedResult) && Boolean(confirmedResult)
    if (!confirmed) {
        console.log('Update cancelled.')
        return
    }

    const updateResult = await applyDependencyUpdates(checkResult.candidates, {
        includeMajor: options.major,
    })
    const cleanupResult = await cleanupLockFiles(config.rootDir)

    console.log(`Updated ${updateResult.updatedCount} dependencies across ${updateResult.updatedFiles.length} files.`)

    if (cleanupResult.removed.length > 0)
        console.log(`Removed lock files: ${cleanupResult.removed.join(', ')}`)
    else if (cleanupResult.failed.length === 0)
        console.log('No supported lock files found.')

    if (cleanupResult.failed.length > 0) {
        for (const failure of cleanupResult.failed)
            console.error(`Failed to remove lock file ${failure.filePath}: ${failure.reason}`)
    }
}
