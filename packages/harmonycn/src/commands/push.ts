import path from "path"
import { runInit } from "@/src/commands/init"
import { createProject } from "@/src/utils/create-project"
import * as ERRORS from "@/src/utils/errors"
import { handleError } from "@/src/utils/handle-error"
import { highlighter } from "@/src/utils/highlighter"
import { logger } from "@/src/utils/logger"
import { getRegistryIndex } from "@/src/utils/registry"
import { Octokit } from "@octokit/rest"
import { Command } from "commander"
import prompts from "prompts"
import { z } from "zod"

import { preFlightUpdate } from "../preflights/preflight-update"
import { getAuth } from "../utils/auth/get-auth"
import { findUpdatedComponents } from "../utils/diff-component"
import { Config } from "../utils/get-config"
import { getRepositories } from "../utils/github/get-repos"
import { OctokitConfig, getOctokit } from "../utils/github/github"
import { createPullRequestFromFiles } from "../utils/github/pull-request"
import { buildStyles } from "../utils/registry/build-registry"
import { registryIndexSchema } from "../utils/registry/schema"
import { spinner } from "../utils/spinner"

export const pushOptionsSchema = z.object({
  components: z.array(z.string()).optional(),
  force: z.boolean(),
  cwd: z.string(),
  all: z.boolean(),
  silent: z.boolean(),
  srcDir: z.boolean().optional(),
})

export const push = new Command()
  .name("push")
  .description("update your project's registry")
  .argument("[components...]", "the components to update")
  .option("-f, --force", "force overwrite of existing configuration.", false)
  .option(
    "-c, --cwd <cwd>",
    "the working directory. defaults to the current directory.",
    process.cwd()
  )
  .option("-a, --all", "update all available components", false)
  .option("-s, --silent", "mute output.", false)
  .option(
    "--src-dir",
    "use the src directory when creating a new project.",
    false
  )
  .action(async (components, opts) => {
    try {
      const options = pushOptionsSchema.parse({
        components,
        cwd: path.resolve(opts.cwd),
        ...opts,
      })

      let { errors, config } = await preFlightUpdate(options)

      // No components.json file. Prompt the user to run init.
      if (errors[ERRORS.MISSING_CONFIG]) {
        const { proceed } = await prompts({
          type: "confirm",
          name: "proceed",
          message: `You need to create a ${highlighter.info(
            "components.json"
          )} file to add components. Proceed?`,
          initial: true,
        })

        if (!proceed) {
          logger.break()
          process.exit(1)
        }

        config = await runInit({
          cwd: options.cwd,
          yes: true,
          force: true,
          defaults: false,
          skipPreflight: false,
          silent: true,
          isNewProject: false,
          srcDir: options.srcDir,
        })
      }

      if (errors[ERRORS.MISSING_DIR_OR_EMPTY_PROJECT]) {
        const { projectPath } = await createProject({
          cwd: options.cwd,
          force: options.force,
          srcDir: options.srcDir,
        })
        if (!projectPath) {
          logger.break()
          process.exit(1)
        }
        options.cwd = projectPath

        config = await runInit({
          cwd: options.cwd,
          yes: true,
          force: true,
          defaults: false,
          skipPreflight: true,
          silent: true,
          isNewProject: true,
          srcDir: options.srcDir,
        })
      }

      if (!config) {
        throw new Error(
          `Failed to read config at ${highlighter.info(options.cwd)}.`
        )
      }

      const accessToken = await getAuth(options.cwd)

      await updateComponents(accessToken, config, options)
    } catch (error) {
      logger.break()
      handleError(error)
    }
  })

async function promptRepositoryToPushTo(octokit: OctokitConfig["octokit"]) {
  const repos = await getRepositories(octokit)

  const options = await prompts({
    type: "select",
    name: "repo",
    message: "Select the repository to push to.",
    choices: repos.map((repo, i) => ({ title: repo.name, value: i })),
  })

  return repos[z.number().parse(options.repo)]
}

export async function updateComponents(
  accessToken: string,
  config: Config,
  options: { silent: boolean; all: boolean; components?: string[] }
) {
  const registrySpinner = spinner(`Checking registry.`, {
    silent: options.silent,
  })?.start()
  const registryIndex = await getRegistryIndex(config.registry)
  if (!registryIndex) {
    registrySpinner?.fail()
    handleError(new Error("Failed to fetch registry index."))
    return
  }
  let componentUpdates = await findUpdatedComponents(config, registryIndex)
  registrySpinner?.succeed()

  if (componentUpdates.length === 0) {
    logger.info("No updates found.")
    return
  }

  logger.info(`Found ${componentUpdates.length} update(s).`)
  if (!options.all && componentUpdates.length > 1) {
    const updateOptions = await prompts({
      type: "multiselect",
      name: "updates",
      message: "Select the components you would like to update.",
      choices: componentUpdates.map(({ name }) => ({
        title: name,
        value: name,
      })),
    })
    const selectedUpdates = z.array(z.string()).parse(updateOptions.updates)
    componentUpdates = componentUpdates.filter((update) =>
      selectedUpdates.find((name) => update.name === name)
    )
  }

  logger.info("Updating the following components:")
  const files: { content: string; path: string }[] = []
  for (const update of componentUpdates) {
    logger.info(`- ${update.name}`)
    logger.break()
    files.push(
      ...update.changes.map((change) => ({
        content: change.fileContent,
        path: change.componentRelativePath,
      }))
    )
  }

  const registryItems = componentUpdates.map(({ component }) => component)
  if (files.length === 0 || registryItems.length === 0) {
    logger.info("No updates selected.")
    return
  }

  const octokit = getOctokit(accessToken)
  const repo = await promptRepositoryToPushTo(octokit)

  await createPullRequest(
    nonEmptyFiles.parse(files),
    nonEmptyRegistryIndex.parse(registryItems),
    {
      branch: repo.default_branch,
      owner: repo.owner.login,
      repo: repo.name,
      octokit,
    },
    config.style,
    options
  )
}

const nonEmptyFiles = z
  .array(z.object({ content: z.string(), path: z.string() }))
  .nonempty()
const nonEmptyRegistryIndex = registryIndexSchema.nonempty()
async function createPullRequest(
  files: z.infer<typeof nonEmptyFiles>,
  registry: z.infer<typeof nonEmptyRegistryIndex>,
  config: OctokitConfig,
  style: string,
  options: { silent: boolean }
) {
  const pullRequestSpinner = spinner(`Creating Pull Request.`, {
    silent: options.silent,
  })?.start()
  try {
    const readFile = async (path: string) => {
      const content = files.find((file) => file.path === path)?.content

      return content ?? ""
    }

    const writeFile = async (path: string, content: string) => {
      files.push({ path, content })
    }

    await buildStyles(registry, style, readFile, writeFile)
    const pullRequestUrl = await createPullRequestFromFiles(files, config)
    pullRequestSpinner?.succeed()

    logger.success(`Pull Request created: ${highlighter.info(pullRequestUrl)}`)
  } catch (error) {
    pullRequestSpinner?.fail()
    handleError(error)
  }
}

async function promptForRegistryComponents(
  options: z.infer<typeof pushOptionsSchema>,
  registryUrl: string
) {
  const registryIndex = await getRegistryIndex(registryUrl)
  if (!registryIndex) {
    logger.break()
    handleError(new Error("Failed to fetch registry index."))
    return []
  }

  if (options.all) {
    return registryIndex.map((entry) => entry.name)
  }

  if (options.components?.length) {
    return options.components
  }

  const { components } = await prompts({
    type: "multiselect",
    name: "components",
    message: "Which components would you like to update?",
    hint: "Space to select. A to toggle all. Enter to submit.",
    instructions: false,
    choices: registryIndex
      .filter((entry) => entry.type === "registry:ui")
      .map((entry) => ({
        title: entry.name,
        value: entry.name,
        selected: options.all ? true : options.components?.includes(entry.name),
      })),
  })

  if (!components?.length) {
    logger.warn("No components selected. Exiting.")
    logger.info("")
    process.exit(1)
  }

  const result = z.array(z.string()).safeParse(components)
  if (!result.success) {
    logger.error("")
    handleError(new Error("Something went wrong. Please try again."))
    return []
  }
  return result.data
}
