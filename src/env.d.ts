/// <reference types="vite/client" />
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

declare global {
	namespace Cloudflare {
		// OAuthProvider adds this to env before calling the site handler.
		interface Env {
			OAUTH_PROVIDER: OAuthHelpers;
		}
	}
}
