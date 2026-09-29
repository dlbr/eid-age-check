import { defineConfig, type Plugin } from "vite";

let status: { status: string; age_over_18?: boolean } = { status: "PENDING" };

function e2eApi(): Plugin {
  return {
    name: "age-check-e2e-api",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (url.pathname === "/__test__/reset" && request.method === "POST") {
          status = { status: "PENDING" };
          response.statusCode = 204;
          response.end();
          return;
        }
        if (url.pathname === "/__test__/complete" && request.method === "POST") {
          const ageOver18 = url.searchParams.get("age_over_18");
          status = ageOver18 === "true"
            ? { status: "VERIFIED", age_over_18: true }
            : ageOver18 === "false"
              ? { status: "VERIFIED", age_over_18: false }
              : { status: "EXPIRED" };
          response.statusCode = 204;
          response.end();
          return;
        }
        if (url.pathname === "/mock-api/sessions" && request.method === "POST") {
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({
            session_id: "e2e-session-1",
            qr_code_url: "openid4vp://authorize?request_uri=https%3A%2F%2Fwallet.example%2Frequest",
          }));
          return;
        }
        if (url.pathname === "/mock-api/sessions/e2e-session-1" && request.method === "GET") {
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify(status));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: "e2e",
  plugins: [e2eApi()],
  server: {
    strictPort: true,
  },
});
