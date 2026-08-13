// Vercel serverless entry point.
//
// Vercel's Node runtime accepts an Express app as the request handler, so we
// just build the app and export it. All routes (defined under /api in app.js)
// are reached via the rewrite in vercel.json.
import { createApp } from "../src/app.js";

const app = createApp();

export default app;
