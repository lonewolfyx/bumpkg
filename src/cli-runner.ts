import type { CommandArgs, UpdateCandidate } from './types'
import { confirm, isCancel } from '@clack/prompts'
import { checkUpdateDependencies } from './check'
import { resolveConfig } from './config'
import { CLI_TABLE_HEADERS } from './constant'
import { cleanupLockFiles } from './lock'
import { applyDependencyUpdates } from './update'

export function renderUpdateTable(candidates: UpdateCandidate[]): string {
    const rows = candidates.map(candidate => [
        candidate.name,
        candidate.currentSpecifier,
        candidate.nextSpecifier,
    ])

    const widths = CLI_TABLE_HEADERS.map((header, columnIndex) =>
        Math.max(header.length, ...rows.map(row => row[columnIndex]?.length ?? 0)),
    )

    const formatRow = (columns: string[]): string => columns
        .map((column, columnIndex) => column.padEnd(widths[columnIndex] ?? column.length))
        .join(' | ')

    const divider = widths.map(width => '-'.repeat(width)).join('-|-')

    return [
        formatRow([...CLI_TABLE_HEADERS]),
        divider,
        ...rows.map(formatRow),
    ].join('\n')
}

export async function confirmDependencyUpdates(): Promise<boolean> {
    const result = await confirm({
        message: 'Apply these dependency updates?',
        initialValue: true,
    })

    return !isCancel(result) && Boolean(result)
}

export async function runCliWithOptions(
    options: CommandArgs,
): Promise<void> {
    const projectConfig = await resolveConfig(options.cwd)
    const checkResult = await checkUpdateDependencies(projectConfig, {
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

    const confirmed = await confirmDependencyUpdates()
    if (!confirmed) {
        console.log('Update cancelled.')
        return
    }

    const updateResult = await applyDependencyUpdates(checkResult.candidates, {
        includeMajor: options.major,
    })
    const cleanupResult = await cleanupLockFiles(projectConfig.rootDir)

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
