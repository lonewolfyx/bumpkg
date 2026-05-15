import { readJson, writeJson } from '../../helpers'
import { commonDependencyMetadata, runFixtureScenario } from '../fixture-test-helper'

describe('pnpm monorepo fixture', () => {
    it('matches the fixture snapshot', async () => {
        const result = await runFixtureScenario({
            fixtureEntryPath: '/test/fixtures/monorepo/package.json',
            metadata: commonDependencyMetadata,
            prepareFixture: async (fixtureRoot) => {
                const packageJsonPath = `${fixtureRoot}/package.json`
                const packageJson = await readJson<Record<string, unknown>>(packageJsonPath)

                packageJson.packages = ['packages/*']

                await writeJson(packageJsonPath, packageJson)
            },
            trackedFiles: [
                'package.json',
                'packages/bar/package.json',
                'packages/foo/package.json',
            ],
        })

        expect(result).toMatchSnapshot()
    })
})
