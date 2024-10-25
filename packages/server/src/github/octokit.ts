import crypto from "node:crypto"
import { App } from "octokit"

export interface OctokitConfig {
  installationId: number
  owner: string
  repo: string
  branch: string
}

export type Octokit = App["octokit"]

export interface OctokitWithConfig extends OctokitConfig {
  octokit: Octokit
}

const createPrivateKey = () => {
  const privateKeyEnv = process.env.PRIVATE_KEY ?? ""
  const privateKeyRaw = atob(privateKeyEnv)

  const privateKey = crypto.createPrivateKey(privateKeyRaw).export({
    type: "pkcs8",
    format: "pem",
  }) as string

  return privateKey
}

export const getInstallationOctokit = async (
  installationId: number
): Promise<Octokit> => {
  const privateKey = createPrivateKey()
  const appId = process.env.GITHUB_APP_ID || ""

  const app = new App({
    appId,
    privateKey,
  })

  const octokit = await app.getInstallationOctokit(installationId)

  return octokit
}
