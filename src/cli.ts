import type { DeepWriteable } from './types'
import { createMain, defineCommand } from 'citty'
import { description, name, version } from '../package.json'
import { args } from './args'
import { runCliWithOptions } from './cli-runner'

export const command = defineCommand<DeepWriteable<typeof args>>({
    meta: {
        name,
        version,
        description,
    },
    args,
    async run({ args }) {
        await runCliWithOptions(args)
    },
})

createMain(command)({})
