// Bekem on Cloudflare: one Worker serves the frontend (static assets) and forwards /api/* to the
// Python backend running as a Cloudflare Container (built from backend/Dockerfile).
import { Container, getContainer } from "@cloudflare/containers";

interface Env {
  BEKEM_API: DurableObjectNamespace<BekemApi>;
  ASSETS: Fetcher;
  // Plain vars (wrangler.jsonc)
  BEKEM_PROVIDER: string;
  BEKEM_EE_PROJECT: string;
  BEKEM_CORS_ORIGINS: string;
  // Secrets (Cloudflare dashboard → Worker → Settings → Variables and Secrets)
  BEKEM_EE_SERVICE_ACCOUNT_KEY_JSON: string;
  BEKEM_EARTHDATA_USERNAME?: string;
  BEKEM_EARTHDATA_PASSWORD?: string;
}

export class BekemApi extends Container<Env> {
  defaultPort = 8000;
  // Stay warm for 30 min after the last request, then sleep (no cost while asleep).
  sleepAfter = "30m";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.envVars = {
      BEKEM_PROVIDER: env.BEKEM_PROVIDER,
      BEKEM_EE_PROJECT: env.BEKEM_EE_PROJECT,
      BEKEM_CORS_ORIGINS: env.BEKEM_CORS_ORIGINS,
      BEKEM_EE_SERVICE_ACCOUNT_KEY_JSON: env.BEKEM_EE_SERVICE_ACCOUNT_KEY_JSON,
      BEKEM_EARTHDATA_USERNAME: env.BEKEM_EARTHDATA_USERNAME ?? "",
      BEKEM_EARTHDATA_PASSWORD: env.BEKEM_EARTHDATA_PASSWORD ?? "",
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname === "/docs" || url.pathname === "/openapi.json") {
      // One instance keeps the report cache in one place.
      return getContainer(env.BEKEM_API).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
