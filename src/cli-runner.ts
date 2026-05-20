import type { CommandArgs, UpdateCandidate } from './types'
import { confirm, isCancel, log, note } from '@clack/prompts'
import { renderTable } from 'console-table-printer'
import pc from 'picocolors'
import semver from 'semver'
import { checkUpdateDependencies } from './check'
import { resolveConfig } from './config'
import { CLI_BASE_TABLE_HEADERS, CLI_CATALOG_TABLE_HEADERS, WORKSPACE_CATALOG } from './constant'
import { cleanupLockFiles } from './lock'
import { applyDependencyUpdates } from './update'
import { getDependencyTypes } from './utils'
import { getCurrentVersionFromSpecifier } from './version'

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

function highlightComparedVersion(version: string, comparedVersion: string): string {
    const parsedVersion = semver.parse(version)
    const parsedComparedVersion = semver.parse(comparedVersion)

    if (!parsedVersion || !parsedComparedVersion)
        return version

    const minor = parsedVersion.minor === parsedComparedVersion.minor
        ? `${parsedVersion.minor}`
        : pc.magenta(`${parsedVersion.minor}`)

    const patch = parsedVersion.patch === parsedComparedVersion.patch
        ? `${parsedVersion.patch}`
        : pc.green(`${parsedVersion.patch}`)

    let formattedVersion = `${parsedVersion.major}.${minor}.${patch}`

    if (parsedVersion.prerelease.length > 0)
        formattedVersion += `-${parsedVersion.prerelease.join('.')}`

    if (parsedVersion.build.length > 0)
        formattedVersion += `+${parsedVersion.build.join('.')}`

    return formattedVersion
}

function highlightDisplayedVersion(
    displayValue: string,
    version: string | null,
    comparedVersion: string | null,
): string {
    if (!version || !comparedVersion)
        return displayValue

    const highlightedVersion = highlightComparedVersion(version, comparedVersion)

    return displayValue.includes(version)
        ? displayValue.replace(version, highlightedVersion)
        : displayValue
}

function stripTableOuterBorders(table: string): string {
    return table
        .split('\n')
        .filter(line => !/^[┌└].*[┐┘]$/.test(line))
        .map((line) => {
            if (/^├.*┤$/.test(line))
                return line.slice(1, -1).replaceAll('┼', '|').replaceAll('─', '-')

            if (/^│.*│$/.test(line))
                return line.slice(1, -1).replaceAll('│', '|')

            return line
        })
        .join('\n')
}

export function renderUpdateTable(candidates: UpdateCandidate[]): string {
    const showCatalogColumns = candidates.some(candidate => WORKSPACE_CATALOG.includes(candidate.source.source))
    const rows = candidates.map((candidate) => {
        const currentVersion = getCurrentVersionFromSpecifier(candidate.currentSpecifier)
        const isCatalogCandidate = WORKSPACE_CATALOG.includes(candidate.source.source)
        const row = {
            dependencyName: candidate.name,
            currentVersion: candidate.currentSpecifier,
            newVersion: highlightDisplayedVersion(formatCandidateNextVersion(candidate), candidate.newVersion, currentVersion),
            dependencyType: getDependencyTypes(candidate.source).join(', ') || '-',
        }

        if (!showCatalogColumns)
            return row

        return {
            ...row,
            source: isCatalogCandidate ? candidate.source.source : '-',
            catalogName: isCatalogCandidate ? (candidate.source.catalogName ?? '-') : '-',
        }
    })

    return stripTableOuterBorders(
        renderTable(rows, {
            shouldDisableColors: true,
            columns: [
                ...CLI_BASE_TABLE_HEADERS.map(header => ({
                    name: header,
                    title: header,
                    alignment: header === 'dependencyName' ? 'left' : 'right',
                })),
                ...(showCatalogColumns
                    ? CLI_CATALOG_TABLE_HEADERS.map(header => ({
                            name: header,
                            title: header,
                        }))
                    : []),
            ],
        }),
    )
}

export async function runCliWithOptions(
    options: CommandArgs,
): Promise<void> {
    const config = await resolveConfig(options)
    const checkResult = await checkUpdateDependencies(config, options)

    if (checkResult.errors.length > 0) {
        log.warning(`Failed to check ${checkResult.errors.length} dependencies.`)

        for (const error of checkResult.errors) {
            log.warning(`${error.name}: ${error.reason}`)
        }
    }

    if (checkResult.candidates.length === 0) {
        if (checkResult.errors.length > 0)
            return

        log.success('No updatable dependencies found.')
        return
    }

    note(
        renderUpdateTable(checkResult.candidates),
        'dependencies',
        {
            format: (line: string) => `${line}`,
        },
    )

    const confirmedResult = await confirm({
        message: 'Apply these dependency updates?',
        initialValue: true,
    })
    const confirmed = !isCancel(confirmedResult) && Boolean(confirmedResult)
    if (!confirmed) {
        log.error('Update cancelled.')
        return
    }

    const updateResult = await applyDependencyUpdates(checkResult.candidates, {
        includeMajor: options.major,
    })
    const cleanupResult = await cleanupLockFiles(config.rootDir)

    log.success(`Updated ${updateResult.updatedCount} dependencies across ${updateResult.updatedFiles.length} files.`)

    if (cleanupResult.removed.length > 0)
        log.success(`Removed lock files: ${cleanupResult.removed.join(', ')}`)
    else if (cleanupResult.failed.length === 0)
        log.info('No supported lock files found.')

    if (cleanupResult.failed.length > 0) {
        for (const failure of cleanupResult.failed)
            log.warning(`Failed to remove lock file ${failure.filePath}: ${failure.reason}`)
    }
}
