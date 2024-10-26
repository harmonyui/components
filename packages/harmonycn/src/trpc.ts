// import type { AppRouter } from "@harmonycn/server/src/root"
// import {
//   CreateTRPCProxyClient,
//   createTRPCProxyClient,
//   httpBatchLink,
// } from "@trpc/client"
// import superjson from "superjson"

// export const PORT = 4200

// const getBaseUrl = (): string => {
//   return process.env.NODE_ENV === "production"
//     ? "https://cn.harmonyui.app:4200"
//     : "http://localhost:4200"
// }

// export const client: CreateTRPCProxyClient<AppRouter> =
//   createTRPCProxyClient<AppRouter>({
//     transformer: superjson,
//     links: [
//       httpBatchLink({
//         url: `${getBaseUrl()}/trpc`,
//         fetch(input, init) {
//           return fetch(input, {
//             ...init,
//             headers: {
//               ...init?.headers,
//               //TODO: This is temporary. Should come from device authentication
//               "x-github-installation-id":
//                 process.env.GITHUB_INSTALLATION_ID ?? "",
//             },
//           })
//         },
//       }),
//     ],
//   })
