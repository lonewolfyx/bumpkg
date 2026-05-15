import { catalogDependencyMetadata, runFixtureScenario } from '../fixture-test-helper'

describe('yarn catalog fixture', () => {
    it('matches the fixture snapshot', async () => {
        const result = await runFixtureScenario({
            fixtureEntryPath: '/test/fixtures/yarn-catalog/package.json',
            metadata: catalogDependencyMetadata,
            trackedFiles: ['package.json', '.yarnrc.yml'],
        })

        expect(result).toMatchSnapshot()
    })
})
