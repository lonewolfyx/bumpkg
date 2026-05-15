import type { CliDeps, CliOptions, UpdateCandidate } from './types'
import { pathToFileURL } from 'node:url'
import { confirm, isCancel } from '@clack/prompts'
import { checkUpdateDependencies } from './check'
import { resolveConfig } from './config'
import { CLI_TABLE_HEADERS } from './constant'
import { cleanupLockFiles } from './lock'
import { applyDependencyUpdates } from './update'

export function parseCliArgs(argv: string[], defaultCwd: string = process.cwd()): CliOptions {
    const options: CliOptions = {
        cwd: defaultCwd,
        major: false,
    }

    for (let index = 0; index < argv.length; index++) {
        const value = argv[index]

        if (value === '--major') {
            options.major = true
            continue
        }

        if (value === '--cwd' || value === '-c') {
            const cwd = argv[index + 1]
            if (!cwd)
                throw new Error('Missing value for --cwd')
            options.cwd = cwd
            index++
            continue
        }

        throw new Error(`Unknown argument: ${value}`)
    }

    return options
}

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

export function createCliDeps(): CliDeps {
    return {
        resolveConfig,
        checkUpdateDependencies,
        confirmUpdates: confirmDependencyUpdates,
        applyDependencyUpdates,
        cleanupLockFiles,
        stdout: console,
        stderr: console,
    }
}

export async function runCli(argv: string[] = process.argv.slice(2), deps: CliDeps = createCliDeps()): Promise<void> {
    const options = parseCliArgs(argv)
    const projectConfig = await deps.resolveConfig(options.cwd)
    const checkResult = await deps.checkUpdateDependencies(projectConfig, {
        includeMajor: options.major,
    })

    if (checkResult.candidates.length === 0) {
        if (checkResult.errors.length > 0) {
            deps.stderr.error(`Failed to check ${checkResult.errors.length} dependencies.`)

            for (const error of checkResult.errors.slice(0, 5))
                deps.stderr.error(`${error.name}: ${error.reason}`)

            if (checkResult.errors.length > 5)
                deps.stderr.error(`...and ${checkResult.errors.length - 5} more errors.`)

            return
        }

        deps.stdout.log('No updatable dependencies found.')
        return
    }

    deps.stdout.log(renderUpdateTable(checkResult.candidates))

    const confirmed = await deps.confirmUpdates()
    if (!confirmed) {
        deps.stdout.log('Update cancelled.')
        return
    }

    const updateResult = await deps.applyDependencyUpdates(checkResult.candidates, {
        includeMajor: options.major,
    })
    const cleanupResult = await deps.cleanupLockFiles(projectConfig.rootDir)

    deps.stdout.log(`Updated ${updateResult.updatedCount} dependencies across ${updateResult.updatedFiles.length} files.`)

    if (cleanupResult.removed.length > 0)
        deps.stdout.log(`Removed lock files: ${cleanupResult.removed.join(', ')}`)
    else
        deps.stdout.log('No supported lock files found.')
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
    try {
        await runCli(argv)
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    await main()
