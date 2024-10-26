import { Octokit } from "@octokit/rest"

export interface OctokitConfig {
  octokit: Octokit
  owner: string
  repo: string
  branch: string
}

export const getOctokit = (accessToken: string): Octokit => {
  return new Octokit({
    auth: accessToken,
  })
}
