import { z } from "zod"

import { OctokitWithConfig } from "../github/octokit"
import { createPullRequestFromFiles } from "../github/pull-request"
import { createTRPCRouter, publicProcedure } from "../trpc"
import { buildStyles } from "../utils/build-registry"
import { registryIndexSchema } from "../utils/schema"

const updateSchema = z.object({
  files: z
    .array(z.object({ content: z.string(), path: z.string() }))
    .nonempty(),
  style: z.string(),
  registry: registryIndexSchema.nonempty(),
})
export const registryRouter = createTRPCRouter({
  update: publicProcedure
    .input(updateSchema)
    .mutation(async ({ input, ctx: { octokit, installationId } }) => {
      const config: OctokitWithConfig = {
        installationId,
        branch: "master",
        owner: "bradofrado",
        repo: "component-registry",
        octokit,
      }
      const readFile = async (path: string) => {
        const content = input.files.find((file) => file.path === path)?.content

        return content ?? ""
      }
      const files = input.files.slice()

      const writeFile = async (path: string, content: string) => {
        files.push({ path, content })
      }

      await buildStyles(input.registry, input.style, readFile, writeFile)
      const pullRequestUrl = await createPullRequestFromFiles(files, config)

      return pullRequestUrl
    }),
})
