import type { CheckUpdateResult, CliDeps, ProjectConfig, UpdateCandidate } from '@/types'
import { parseCliArgs, renderUpdateTable, runCli } from '@/cli'

function createProjectConfig(): ProjectConfig {
    return {
        cwd: '/project',
        rootDir: '/project',
        rootPackagePath: '/project/package.json',
        monorepo: false,
        packages: ['/project/package.json'],
        dependencies: [],
        devDependencies: [],
        optionalDependencies: [],
        catalogDependencies: [],
        allDependencies: [],
    }
}

function createCandidate(): UpdateCandidate {
    return {
        name: 'lodash',
        currentVersion: '^4.17.0',
        currentSpecifier: '^4.17.0',
        newVersion: '4.17.21',
        nextSpecifier: '^4.17.21',
        updateLevel: 'minor',
        source: {
            filePath: '/project/package.json',
            source: 'dependencies',
            manifestFormat: 'json',
        },
    }
}

function createDeps(result: CheckUpdateResult, output: string[] = []): CliDeps {
    return {
        resolveConfig: vi.fn().mockResolvedValue(createProjectConfig()),
        checkUpdateDependencies: vi.fn().mockResolvedValue(result),
        confirmUpdates: vi.fn().mockResolvedValue(true),
        applyDependencyUpdates: vi.fn().mockResolvedValue({
            updatedFiles: [{ filePath: '/project/package.json', updatedDependencies: ['lodash'] }],
            updatedCount: 1,
        }),
        cleanupLockFiles: vi.fn().mockResolvedValue({
            removed: ['/project/pnpm-lock.yaml'],
            missing: [],
        }),
        stdout: {
            log: (message: string) => output.push(message),
        },
        stderr: {
            error: vi.fn(),
        },
    }
}

describe('cli helpers', () => {
    test('parses --cwd and --major arguments', () => {
        expect(parseCliArgs(['--cwd', '/tmp/demo', '--major'])).toEqual({
            cwd: '/tmp/demo',
            major: true,
        })
    })

    test('renders the fixed table headers', () => {
        expect(renderUpdateTable([createCandidate()])).toContain('dependencyName')
        expect(renderUpdateTable([createCandidate()])).toContain('current_Version')
        expect(renderUpdateTable([createCandidate()])).toContain('new_Version')
    })

    test('prints a clear message when there are no updates', async () => {
        const output: string[] = []
        const deps = createDeps({ candidates: [], errors: [] }, output)

        await runCli([], deps)

        expect(output).toEqual(['No updatable dependencies found.'])
    })

    test('prints check errors instead of pretending there are no updates', async () => {
        const output: string[] = []
        const errors: string[] = []
        const deps = createDeps({
            candidates: [],
            errors: [{
                name: 'lodash',
                currentVersion: '^1.0.0',
                reason: 'registry timeout',
                source: {
                    filePath: '/project/package.json',
                    source: 'dependencies',
                    manifestFormat: 'json',
                },
            }],
        }, output)

        deps.stderr = {
            error: (message: string) => errors.push(message),
        }

        await runCli([], deps)

        expect(output).toEqual([])
        expect(errors).toEqual([
            'Failed to check 1 dependencies.',
            'lodash: registry timeout',
        ])
    })

    test('passes the major flag into dependency checks', async () => {
        const output: string[] = []
        const deps = createDeps({ candidates: [], errors: [] }, output)

        await runCli(['--major'], deps)

        expect(deps.checkUpdateDependencies).toHaveBeenCalledWith(expect.anything(), {
            includeMajor: true,
        })
    })

    test('stops when the user cancels', async () => {
        const output: string[] = []
        const deps = createDeps({ candidates: [createCandidate()], errors: [] }, output)
        deps.confirmUpdates = vi.fn().mockResolvedValue(false)

        await runCli([], deps)

        expect(output.at(-1)).toBe('Update cancelled.')
        expect(deps.applyDependencyUpdates).not.toHaveBeenCalled()
    })

    test('runs the update flow after confirmation', async () => {
        const output: string[] = []
        const deps = createDeps({ candidates: [createCandidate()], errors: [] }, output)

        await runCli([], deps)

        expect(deps.applyDependencyUpdates).toHaveBeenCalled()
        expect(deps.cleanupLockFiles).toHaveBeenCalledWith('/project')
        expect(output.at(-1)).toContain('Removed lock files:')
    })
})
