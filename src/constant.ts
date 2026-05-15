import type { DependencyType } from './types'

export const DEPENDENCY_FIELDS = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
] as const satisfies readonly DependencyType[]

export const SUPPORTED_VERSION_PREFIXES = ['^', '~', '*'] as const

export const SKIPPED_RANGE_PREFIXES = ['<=', '>=', '<', '>'] as const

export const LOCK_FILE_NAMES = [
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lockb',
] as const

export const CLI_TABLE_HEADERS = [
    'dependencyName',
    'current_Version',
    'new_Version',
] as const

export const PACKAGE_MANIFEST_NAMES = ['package.json', 'package.yaml'] as const

export const YAML_FILE_EXTENSIONS = ['.yaml', '.yml'] as const

export function getRangePrefix(range: string): string | null {
    const value = range.trim()

    if (value === '*')
        return '*'

    for (const prefix of SKIPPED_RANGE_PREFIXES) {
        if (value.startsWith(prefix))
            return prefix
    }

    for (const prefix of SUPPORTED_VERSION_PREFIXES) {
        if (prefix !== '*' && value.startsWith(prefix))
            return prefix
    }

    return null
}

export function isSupportedRange(range: string): boolean {
    return SUPPORTED_VERSION_PREFIXES.includes(getRangePrefix(range) as typeof SUPPORTED_VERSION_PREFIXES[number])
}

export function isSkippedRange(range: string): boolean {
    return SKIPPED_RANGE_PREFIXES.includes(getRangePrefix(range) as typeof SKIPPED_RANGE_PREFIXES[number])
}
