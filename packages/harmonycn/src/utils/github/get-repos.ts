import { handleError } from "../handle-error"
import { logger } from "../logger"
import { OctokitConfig } from "./github"

export const getRepositories = async (octokit: OctokitConfig["octokit"]) => {
  try {
    const reposData = await octokit.request("GET /user/repos", {
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    })

    return reposData.data
  } catch (error) {
    logger.break()
    handleError(error)
  }
}
