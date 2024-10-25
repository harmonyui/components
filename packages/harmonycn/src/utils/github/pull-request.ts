import { OctokitConfig } from "./github"

interface FileChange {
  content: string
  path: string
}
export const createPullRequestFromFiles = async (
  files: FileChange[],
  config: OctokitConfig
): Promise<string> => {
  const branchName = `update-${new Date().getTime()}`

  await createBranch(branchName, config)
  await updateFilesAndCommit(branchName, files, config)
  const pullRequestUrl = await createPullRequest(
    "Update files",
    "Update files",
    branchName,
    config
  )

  return pullRequestUrl
}

const createPullRequest = async (
  title: string,
  body: string,
  branch: string,
  config: OctokitConfig
) => {
  const octokit = config.octokit
  const response = await octokit.rest.pulls.create({
    owner: config.owner,
    repo: config.repo,
    title,
    body,
    base: config.branch,
    head: branch,
  })

  return response.data.html_url
}

const createBranch = async (branchName: string, config: OctokitConfig) => {
  const octokit = config.octokit
  // Get the latest commit SHA from the base branch
  const { data: baseBranchInfo } = await octokit.rest.repos.getBranch({
    owner: config.owner,
    repo: config.repo,
    branch: config.branch,
  })

  // Create a new branch based on the latest commit SHA
  await octokit.rest.git.createRef({
    owner: config.owner,
    repo: config.repo,
    ref: `refs/heads/${branchName}`,
    sha: baseBranchInfo.commit.sha,
  })
}

const updateFilesAndCommit = async (
  branch: string,
  files: {
    content: string
    path: string
  }[],
  config: OctokitConfig
) => {
  const octokit = config.octokit
  // Get the latest commit SHA from the branch
  const { data: branchInfo } = await octokit.rest.repos.getBranch({
    owner: config.owner,
    repo: config.repo,
    branch,
  })

  // Get the tree SHA associated with the latest commit
  const { data: commitInfo } = await octokit.rest.git.getCommit({
    owner: config.owner,
    repo: config.repo,
    commit_sha: branchInfo.commit.sha,
  })

  // Create an array to store changes
  const treeChanges: {
    path: string
    mode: "100644"
    type: "blob"
    sha: string
  }[] = []

  // Iterate through each change and update the files
  for (const { content, path } of files) {
    const { data: updatedFileInfo } = await octokit.rest.git.createBlob({
      owner: config.owner,
      repo: config.repo,
      content,
      encoding: "utf-8",
    })

    // Push changes to the array
    treeChanges.push({
      path,
      mode: "100644", // File mode
      type: "blob",
      sha: updatedFileInfo.sha,
    })
  }

  // Create a new tree with all the changes
  const { data: newTree } = await octokit.rest.git.createTree({
    owner: config.owner,
    repo: config.repo,
    base_tree: commitInfo.tree.sha,
    tree: treeChanges,
  })

  // Create a new commit with the updated files
  const commit = await octokit.rest.git.createCommit({
    owner: config.owner,
    repo: config.repo,
    message: "Update files content",
    tree: newTree.sha,
    parents: [commitInfo.sha],
    committer: {
      name: "Your Name",
      email: "your.email@example.com",
    },
    author: { ...commitInfo.author },
  })

  // Update the branch reference to point to the new commit
  await octokit.rest.git.updateRef({
    owner: config.owner,
    repo: config.repo,
    ref: `heads/${branch}`,
    sha: commit.data.sha,
  })
}
