import { existsSync, promises as fs } from "fs"
import path from "path"
import { Config, getConfig } from "@/src/utils/get-config"
import { handleError } from "@/src/utils/handle-error"
import { highlighter } from "@/src/utils/highlighter"
import { logger } from "@/src/utils/logger"
import {
  fetchTree,
  getItemTargetPath,
  getRegistryBaseColor,
  getRegistryIndex,
} from "@/src/utils/registry"
import { registryIndexSchema } from "@/src/utils/registry/schema"
import { transform } from "@/src/utils/transformers"
import { Command } from "commander"
import { diffLines, type Change } from "diff"
import { z } from "zod"

import { diffComponent, findUpdatedComponents } from "../utils/diff-component"

const updateOptionsSchema = z.object({
  component: z.string().optional(),
  yes: z.boolean(),
  cwd: z.string(),
  path: z.string().optional(),
})

export const diff = new Command()
  .name("diff")
  .description("check for updates against the registry")
  .argument("[component]", "the component name")
  .option("-y, --yes", "skip confirmation prompt.", false)
  .option(
    "-c, --cwd <cwd>",
    "the working directory. defaults to the current directory.",
    process.cwd()
  )
  .action(async (name, opts) => {
    try {
      const options = updateOptionsSchema.parse({
        component: name,
        ...opts,
      })

      const cwd = path.resolve(options.cwd)

      if (!existsSync(cwd)) {
        logger.error(`The path ${cwd} does not exist. Please try again.`)
        process.exit(1)
      }

      const config = await getConfig(cwd)
      if (!config) {
        logger.warn(
          `Configuration is missing. Please run ${highlighter.success(
            `init`
          )} to create a components.json file.`
        )
        process.exit(1)
      }

      const registryIndex = await getRegistryIndex(config.registry)

      if (!registryIndex) {
        handleError(new Error("Failed to fetch registry index."))
        process.exit(1)
      }

      if (!options.component) {
        const componentsWithUpdates = await findUpdatedComponents(
          config,
          registryIndex
        )

        if (!componentsWithUpdates.length) {
          logger.info("No updates found.")
          process.exit(0)
        }

        logger.info("The following components have updates available:")
        for (const component of componentsWithUpdates) {
          logger.info(`- ${component.name}`)
          for (const change of component.changes) {
            logger.info(`  - ${change.filePath}`)
          }
        }
        logger.break()
        logger.info(
          `Run ${highlighter.success(`diff <component>`)} to see the changes.`
        )
        process.exit(0)
      }

      // Show diff for a single component.
      const component = registryIndex.find(
        (item) => item.name === options.component
      )

      if (!component) {
        logger.error(
          `The component ${highlighter.success(
            options.component
          )} does not exist.`
        )
        process.exit(1)
      }

      const changes = await diffComponent(component, config)

      if (!changes.length) {
        logger.info(`No updates found for ${options.component}.`)
        process.exit(0)
      }

      for (const change of changes) {
        logger.info(`- ${change.filePath}`)
        await printDiff(change.patch)
        logger.info("")
      }
    } catch (error) {
      handleError(error)
    }
  })

async function printDiff(diff: Change[]) {
  diff.forEach((part) => {
    if (part) {
      if (part.added) {
        return process.stdout.write(highlighter.success(part.value))
      }
      if (part.removed) {
        return process.stdout.write(highlighter.error(part.value))
      }

      return process.stdout.write(part.value)
    }
  })
}
