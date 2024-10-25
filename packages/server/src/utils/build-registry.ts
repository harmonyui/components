import { z } from "zod"

import {
  registryIndexSchema,
  registryItemSchema,
  registryItemTypeSchema,
} from "./schema"

const REGISTRY_PATH = "public/r"

const REGISTRY_INDEX_WHITELIST: z.infer<typeof registryItemTypeSchema>[] = [
  "registry:ui",
  "registry:lib",
  "registry:hook",
  "registry:theme",
  "registry:block",
  "registry:example",
]

export async function buildStyles(
  registry: z.infer<typeof registryIndexSchema>,
  style: string,
  readFile: (path: string) => Promise<string>,
  writeFile: (path: string, content: string) => Promise<void>
) {
  const targetPath = `${REGISTRY_PATH}/styles/${style}`

  for (const item of registry) {
    if (!REGISTRY_INDEX_WHITELIST.includes(item.type)) {
      continue
    }

    let files
    if (item.files) {
      files = await Promise.all(
        item.files.map(async (_file) => {
          const file =
            typeof _file === "string"
              ? {
                  path: _file,
                  type: item.type,
                  content: "",
                  target: "",
                }
              : _file

          let content: string
          try {
            content = await readFile(`registry/${style}/${file.path}`)

            // Only fix imports for v0- blocks.
            // if (item.name.startsWith("v0-")) {
            //   content = fixImport(content)
            // }
          } catch (error) {
            return
          }

          let target = file.target

          return {
            path: file.path,
            type: file.type,
            content,
            target,
          }
        })
      )
    }

    const payload = registryItemSchema.safeParse({
      ...item,
      files,
    })

    if (payload.success) {
      await writeFile(
        `${targetPath}/${item.name}.json`,
        JSON.stringify(payload.data, null, 2)
      )
    }
  }
}
