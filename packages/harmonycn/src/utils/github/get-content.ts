import { OctokitConfig } from "./github"

export const getContent = async (file: string, config: OctokitConfig) => {
  const decodeContent = (content: string) => {
    //We have to do this fancy decoding because some special characters do not decode right
    //with atob
    return decodeURIComponent(
      atob(content)
        .split("")
        .map(function map(c) {
          return `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`
        })
        .join("")
    )
  }
  const octokit = config.octokit

  const cleanFile = file.startsWith("/") ? file.substring(1) : file

  const { data: fileInfo } = await octokit.rest.repos.getContent({
    owner: config.owner,
    repo: config.repo,
    path: cleanFile,
    ref: config.branch,
  })

  if (Array.isArray(fileInfo)) {
    throw new Error("The given file path is a directory")
  }

  if (!("content" in fileInfo)) {
    throw new Error("File info does not have content")
  }

  const contentText = decodeContent(fileInfo.content)

  return contentText
}
