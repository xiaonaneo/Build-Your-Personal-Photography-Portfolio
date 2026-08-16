import type { Config } from "@netlify/functions";

import {
  authStatus,
  authenticatePassword,
  clearLoginResponse,
  createLoginResponse,
} from "./_shared/auth.js";
import { jsonResponse, readJson, securityHeaders } from "./_shared/http.js";

export default async (request: Request) => {
  if (request.method === "GET") {
    return authStatus(request);
  }

  if (request.method === "POST") {
    const parsed = await readJson(request, 64 * 1024);
    if (!parsed.ok) return jsonResponse({ code: parsed.code, message: parsed.message }, parsed.status);
    const body = parsed.value && typeof parsed.value === "object"
      ? parsed.value as { password?: unknown }
      : {};

    const passwordResult = authenticatePassword(body.password);
    if (passwordResult === null) {
      return createLoginResponse();
    }
    if (!passwordResult) {
      return jsonResponse({ code: "AUTH_INVALID", message: "密码不正确。" }, 401);
    }
    return createLoginResponse();
  }

  if (request.method === "DELETE") {
    return clearLoginResponse();
  }

  return new Response("Method not allowed", { status: 405, headers: securityHeaders });
};

export const config: Config = {
  path: "/api/auth",
  method: ["GET", "POST", "DELETE"],
};
