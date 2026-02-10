import { createMain, defineCommand } from 'citty'
import { resolveConfig } from '@/config.ts'
import { description, name, version } from '../package.json'

const command = defineCommand({
    meta: {
        name,
        version,
        description,
    },
    async run({ args }) {
        console.log('📦 Resolving project configuration...')
        const config = await resolveConfig()

        console.log(config)
    },
})

createMain(command)({})
