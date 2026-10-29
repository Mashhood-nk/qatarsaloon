// Cloudflare Worker entry: /api/* is handled here, everything else is the React app (static assets).
import { Hono } from "hono";
import type { AppEnv } from "./env";
import { HttpError } from "./lib/util";
import { publicRoutes } from "./routes/public";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";

const app = new Hono<AppEnv>();

app.use("/api/*", async (c, next) => {
  await next();
  if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", "no-store");
});

app.route("/api", publicRoutes);
app.route("/api/auth", authRoutes);
app.route("/api/admin", adminRoutes);

// Shop images from R2. Keys contain a random part, so they can be cached forever.
app.get("/api/img/*", async (c) => {
  const key = c.req.path.replace(/^\/api\/img\//, "");
  if (!/^shops\/\d+\/[a-z]+-[A-Za-z0-9_-]+\.(webp|jpg|png)$/.test(key)) return c.notFound();
  const obj = await c.env.IMAGES.get(key);
  if (!obj) return c.notFound();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("ETag", obj.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
});

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Something went wrong. Please try again." }, 500);
});

export default app;
