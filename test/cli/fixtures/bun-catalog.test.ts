import { catalogDependencyMetadata, runFixtureScenario } from '../fixture-test-helper'

describe('bun catalog fixture', () => {
    it('matches the fixture snapshot', async () => {
        const result = await runFixtureScenario({
            fixtureEntryPath: '/test/fixtures/bun-catalog/package.json',
            metadata: catalogDependencyMetadata,
            trackedFiles: ['package.json'],
        })

        expect(result).toMatchSnapshot()
    })
})
