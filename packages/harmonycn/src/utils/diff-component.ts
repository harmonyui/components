import { existsSync, promises as fs } from "fs"
import path from "path"
import { diffLines } from "diff"
import { z } from "zod"

import { Config } from "./get-config"
import {
  fetchTree,
  getComponentUrl,
  getItemTargetPath,
  getRegistryBaseColor,
} from "./registry"
import { registryIndexSchema } from "./registry/schema"
import { transform } from "./transformers"

export const findUpdatedComponents = async (
  config: Config,
  registryIndex: z.infer<typeof registryIndexSchema>
) => {
  const targetDir = config.resolvedPaths.components

  // Find all components that exist in the project.
  const projectComponents = registryIndex.filter((item) => {
    for (const file of item.files ?? []) {
      const filePath = path.resolve(
        targetDir,
        typeof file === "string" ? file : file.path
      )
      if (existsSync(filePath)) {
        return true
      }
    }

    return false
  })

  // Check for updates.
  const componentsWithUpdates = []
  for (const component of projectComponents) {
    const changes = await diffComponent(component, config)
    if (changes.length) {
      componentsWithUpdates.push({
        name: component.name,
        changes,
        component,
      })
    }
  }

  return componentsWithUpdates
}

export async function diffComponent(
  component: z.infer<typeof registryIndexSchema>[number],
  config: Config
) {
  const payload = await fetchTree(config.style, [component], config.registry)
  const baseColor = await getRegistryBaseColor(
    config.tailwind.baseColor,
    config.registry
  )

  if (!payload) {
    return []
  }

  const changes = []

  for (const item of payload) {
    const targetDir = config.resolvedPaths.components //await getItemTargetPath(config, item)

    if (!targetDir) {
      continue
    }

    for (const file of item.files ?? []) {
      const filePath = path.resolve(
        targetDir,
        typeof file === "string" ? file : file.path
      )

      if (!existsSync(filePath)) {
        continue
      }

      const fileContent = await fs.readFile(filePath, "utf8")

      if (typeof file === "string" || !file.content) {
        continue
      }

      const componentRelativePath = getComponentUrl(
        `${config.style}/${file.path}`,
        ""
      ).slice(1)

      const registryContent = await transform({
        filename: file.path,
        raw: file.content,
        config,
        baseColor,
      })

      const patch = diffLines(registryContent as string, fileContent)
      if (patch.length > 1) {
        changes.push({
          filePath,
          componentRelativePath,
          patch,
          registryContent,
          fileContent,
        })
      }
    }
  }

  return changes
}
