/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */

import { initTRPC } from "@trpc/server"
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express"
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch"
import type { Request } from "express"
import superjson from "superjson"
import { ZodError, z } from "zod"

import { Octokit, getInstallationOctokit } from "./github/octokit"

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 */

interface CreateContextOptions {
  installationId: number
}

export interface CreateContext extends CreateContextOptions {
  octokit: Octokit
}

/**
 * This helper generates the "internals" for a tRPC context. If you need to use it, you can export
 * it from here.
 *
 * Examples of things you may need it for:
 * - testing, so we don't have to mock Next.js' req/res
 * - tRPC's `createSSGHelpers`, where we don't have req/res
 *
 * @see https://create.t3.gg/en/usage/trpc#-serverapitrpcts
 */
const createInnerTRPCContext = async (
  opts: CreateContextOptions
): Promise<CreateContext> => {
  const octokit = await getInstallationOctokit(opts.installationId)
  return {
    ...opts,
    octokit,
  }
}

// export const createAuthContext = (session: Session) => {
//   return createInnerTRPCContext({
//     session
//   })
// }

const createTRPCContext = async (
  headers: Record<string, string | string[] | undefined>
) => {
  const installationId = z.coerce
    .number()
    .parse(headers["x-github-installation-id"])
  return createInnerTRPCContext({
    installationId,
  })
}

// /**
//  * This is the actual context you will use in your router. It will be used to process every request
//  * that goes through your tRPC endpoint.
//  *
//  * @see https://trpc.io/docs/context
//  */
// export const createTRPCContextFetch = async ({
//   req,
// }: FetchCreateContextFnOptions) => {
//   return createTRPCContext(req.headers)
// }

export const createTRPCContextExpress = async ({
  req,
}: {
  res: CreateExpressContextOptions["res"]
  req: Request
}) => {
  return createTRPCContext(req.headers)
}

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */

const t = initTRPC.context<typeof createTRPCContextExpress>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure
