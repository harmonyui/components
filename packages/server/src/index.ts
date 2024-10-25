import { createExpressMiddleware } from "@trpc/server/adapters/express"
import express from "express"
import morgan from "morgan"

import { appRouter } from "./root"
import { createTRPCContextExpress } from "./trpc"

const app = express()

app.use(morgan("short"))

// Define API routes
app.use(
  "/trpc",

  createExpressMiddleware({
    router: appRouter,
    createContext: createTRPCContextExpress,
    onError({ error }) {
      console.error(error)
    },
  })
)

// Start the server
app.listen(4200, () => {
  console.log(`Server is running on port ${4200}`)
})
