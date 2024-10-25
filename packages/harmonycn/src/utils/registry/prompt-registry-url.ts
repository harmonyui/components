import prompts from "prompts"
import { z } from "zod"

import { REGISTRY_URL } from "./constants"

const githubUrlRegex = /https:\/\/github.com\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9-]+)/
const promptRegistryUrlSchema = z
  .custom<`https://github.com/${string}/${string}`>(
    (value) => githubUrlRegex.test(value),
    "Invalid Github Url"
  )
  .transform<string>((value) => {
    const result = githubUrlRegex.exec(value)
    if (!result) {
      throw new Error("Invalid github URL")
    }
    const [, username, repo] = result

    return `https://raw.githubusercontent.com/${username}/${repo}/refs/heads/master`
  })
export const promptRegistryUrl = async (): Promise<string> => {
  const options = await prompts({
    type: "text",
    name: "registryUrl",
    message:
      "Enter the registry github URL (https://github.com/[username]/[repo]). Leave blank for shadcn registry.",
    initial: "",
  })

  const registryUrl = z
    .union([
      promptRegistryUrlSchema,
      z
        .custom<string>((value) => value === "")
        .transform<string>((_) => REGISTRY_URL),
    ])
    .parse(options.registryUrl)

  return registryUrl
}
