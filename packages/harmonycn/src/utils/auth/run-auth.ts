import { z } from "zod"

import { handleError } from "../handle-error"
import { logger } from "../logger"

const clientId = process.env.GITHUB_APP_CLIENT_ID ?? ""
export const runAuth = async (): Promise<
  z.infer<typeof accessTokenResponseSchema>
> => {
  const codeInfo = await generateDeviceCode(clientId)
  await promptEnterDeviceCode(codeInfo)
  const accessInfo = await pollForAccessToken(clientId, codeInfo)

  return accessInfo
}

const generateDeviceCodeResponseSchema = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.string().transform((uri) => decodeURIComponent(uri)),
  expires_in: z.coerce.number(),
  interval: z.coerce.number(),
})
const generateDeviceCode = async (
  clientId: string
): Promise<z.infer<typeof generateDeviceCodeResponseSchema>> => {
  try {
    const response = await fetch(
      `https://github.com/login/device/code?client_id=${clientId}`,
      {
        method: "POST",
      }
    )
    const responseData = await parseResponse(response)
    const data = generateDeviceCodeResponseSchema.parse(responseData)

    return data
  } catch (error) {
    logger.break()
    handleError(error)
  }
}

const promptEnterDeviceCode = async (
  deviceData: z.infer<typeof generateDeviceCodeResponseSchema>
) => {
  logger.info(
    `Please go to ${deviceData.verification_uri} and enter the code ${deviceData.user_code}`
  )
}

const accessTokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  refresh_token_expires_in: z.number().optional(),
  scope: z.string(),
  token_type: z.string().optional(),
})
const accessTokenErrorResponse = z.object({
  error: z.union([
    z.literal("authorization_pending"),
    z.literal("slow_down"),
    z.literal("expired_token"),
    z.literal("access_denied"),
  ]),
})
const pollForAccessToken = async (
  clientId: string,
  deviceData: z.infer<typeof generateDeviceCodeResponseSchema>
) => {
  const grantType = "urn:ietf:params:oauth:grant-type:device_code"
  let interval = deviceData.interval

  const handleResponseError = ({
    error,
  }: z.infer<typeof accessTokenErrorResponse>) => {
    if (error === "authorization_pending") {
      return startPolling()
    } else if (error === "slow_down") {
      interval += 5
      return startPolling()
    }

    throw new Error("Authorization failed with error: " + error)
  }

  const makeRequest = async () => {
    const url = new URL("https://github.com/login/oauth/access_token")
    url.searchParams.append("client_id", clientId)
    url.searchParams.append("device_code", deviceData.device_code)
    url.searchParams.append("grant_type", grantType)
    const response = await fetch(url.href, {
      method: "POST",
    })
    const data = await parseResponse(response)
    const errorResponse = accessTokenErrorResponse.safeParse(data)
    if (errorResponse.success) {
      return handleResponseError(errorResponse.data)
    }

    return accessTokenResponseSchema.parse(data)
  }

  const startPolling = () => {
    return new Promise<z.infer<typeof accessTokenResponseSchema>>(
      (resolve, reject) =>
        setTimeout(async () => {
          const data = await makeRequest()
          if (data) {
            resolve(data)
          }
        }, deviceData.interval * 1000)
    )
  }

  return startPolling()
}

const parseResponse = async (response: Response): Promise<unknown> => {
  const data = await response.text()

  return data.split("&").reduce<Record<string, unknown>>((acc, pair) => {
    const [key, value] = pair.split("=")
    acc[key] = value
    return acc
  }, {})
}
