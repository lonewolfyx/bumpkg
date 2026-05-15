import { catalogDependencyMetadata, runFixtureScenario } from '../fixture-test-helper'

describe('pnpm catalog fixture', () => {
    it('matches the fixture snapshot', async () => {
        const result = await runFixtureScenario({
            fixtureEntryPath: '/test/fixtures/pnpm-catalog/package.json',
            metadata: catalogDependencyMetadata,
            trackedFiles: ['package.json', 'pnpm-workspace.yaml'],
        })

        expect(result).toMatchSnapshot()
    })
})
