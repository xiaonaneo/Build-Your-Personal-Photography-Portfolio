import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async (_request: Request, context: Context) => {
  const key = context.params.key;
  const store = getStore({ name: "portfolio-uploads", consistency: "strong" });
  const result = await store.getWithMetadata(key, { type: "arrayBuffer" });

  if (!result) {
    return new Response("Not found", { status: 404 });
  }

  const metadata = result.metadata as { contentType?: string } | null;
  return new Response(result.data, {
    headers: {
      "Content-Type": metadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};

export const config: Config = {
  path: "/uploads/:key",
  method: ["GET"],
};
