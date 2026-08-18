export const MAX_CONFIG_BODY_BYTES = 1 * 1024 * 1024;
// Netlify's buffered function payload is 6 MB, with binary uploads having a
// lower effective limit after encoding and multipart overhead.
export const MAX_UPLOAD_BODY_BYTES = 4.5 * 1024 * 1024;

export const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data: blob:; connect-src 'self'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...securityHeaders,
      ...headers,
    },
  });
}

export function requestExceedsLimit(request: Request, maxBytes: number) {
  const rawLength = request.headers.get("content-length");
  if (!rawLength) return false;
  const length = Number(rawLength);
  return !Number.isSafeInteger(length) || length < 0 || length > maxBytes;
}

export async function readJson(request: Request, maxBytes: number) {
  if (requestExceedsLimit(request, maxBytes)) {
    return { ok: false as const, status: 413, code: "REQUEST_TOO_LARGE", message: "请求过大。" };
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await request.arrayBuffer();
  } catch {
    return { ok: false as const, status: 400, code: "INVALID_REQUEST", message: "请求格式无效。" };
  }
  if (bytes.byteLength > maxBytes) {
    return { ok: false as const, status: 413, code: "REQUEST_TOO_LARGE", message: "请求过大。" };
  }

  try {
    return { ok: true as const, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: false as const, status: 400, code: "INVALID_REQUEST", message: "请求格式无效。" };
  }
}
