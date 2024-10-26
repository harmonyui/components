import { existsSync, promises as fs } from "fs"
import path from "path"

import { runAuth } from "./run-auth"

export const getAuth = async (cwd: string) => {
  const filePath = path.resolve(cwd, ".token")
  if (!existsSync(filePath)) {
    const accessData = await runAuth()
    await writeAuth(cwd, accessData.access_token)

    return accessData.access_token
  }

  const accessToken = await fs.readFile(filePath, "utf-8")

  return atob(accessToken)
}

const writeAuth = async (cwd: string, accessToken: string) => {
  const filePath = path.resolve(cwd, ".token")
  await fs.writeFile(filePath, btoa(accessToken))
  await fs.chmod(filePath, "600")
}
