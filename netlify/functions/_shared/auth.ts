import { createHmac, timingSafeEqual } from "node:crypto";
import { jsonResponse, securityHeaders } from "./http.js";

export const SESSION_COOKIE = "echo37_admin";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function readEnv(name: string) {
  const netlifyEnv = (globalThis as any).Netlify?.env?.get?.(name);
  if (typeof netlifyEnv === "string" && netlifyEnv) return netlifyEnv;
  return (globalThis as any).process?.env?.[name] || "";
}

function configuredSecrets() {
  return {
    password: readEnv("ADMIN_PASSWORD"),
    secret: readEnv("SESSION_SECRET"),
  };
}

function digest(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest();
}

function equalDigest(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyPassword(input: string, expected: string, secret: string) {
  if (!secret || !expected) return false;
  return equalDigest(digest(input, secret), digest(expected, secret));
}

export function createSessionToken(password: string, secret: string, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const passwordVersion = digest(password, secret).toString("hex");
  const payload = `v1.${expiresAt}.${passwordVersion}`;
  const signature = digest(payload, secret).toString("base64url");
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string, password: string, secret: string, now = Date.now()) {
  if (!token || !password || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;

  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;

  const expectedVersion = digest(password, secret).toString("hex");
  if (parts[2] !== expectedVersion) return false;

  const payload = parts.slice(0, 3).join(".");
  const expectedSignature = digest(payload, secret).toString("base64url");
  return equalDigest(Buffer.from(parts[3]), Buffer.from(expectedSignature));
}

function readCookie(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}

export function isAuthenticated(request: Request) {
  const { password, secret } = configuredSecrets();
  return Boolean(password && secret && secret.length >= 32 && verifySessionToken(readCookie(request), password, secret));
}

export function requireAdmin(request: Request) {
  const { password, secret } = configuredSecrets();
  if (!password || !secret || secret.length < 32) {
    return jsonResponse({ code: "AUTH_NOT_CONFIGURED", message: "管理员认证尚未配置。" }, 500);
  }
  if (!isAuthenticated(request)) {
    return jsonResponse({ code: "AUTH_REQUIRED", message: "请先登录管理员后台。" }, 401);
  }
  return null;
}

export function createLoginResponse() {
  const { password, secret } = configuredSecrets();
  if (!password || !secret || secret.length < 32) {
    return jsonResponse({ code: "AUTH_NOT_CONFIGURED", message: "管理员认证尚未配置。" }, 500);
  }

  const token = createSessionToken(password, secret);
  const secure = readEnv("NETLIFY_DEV") !== "true";
  const secureAttribute = secure ? "; Secure" : "";
  return jsonResponse(
    { authenticated: true },
    200,
    { "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Strict${secureAttribute}` },
  );
}

export function clearLoginResponse() {
  return jsonResponse(
    { authenticated: false },
    200,
    { "Set-Cookie": `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict` },
  );
}

export function authStatus(request: Request) {
  return jsonResponse({ authenticated: isAuthenticated(request) }, 200);
}

export function authenticatePassword(input: unknown) {
  const { password, secret } = configuredSecrets();
  if (!password || !secret || secret.length < 32) return null;
  return typeof input === "string" && verifyPassword(input, password, secret);
}
