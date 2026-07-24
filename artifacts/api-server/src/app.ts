import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { AdminAccessError } from "@/lib/admin";
import { AppConfigError } from "@/lib/env";
import { AuthenticationError, AuthenticationUnavailableError } from "@/lib/auth/session";
import { InsufficientCreditsError } from "@/lib/billing";
import { OperationsRepository } from "@/lib/operations";

const app: Express = express();
if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins().has(origin)) return callback(null, true);
      callback(new Error("Origin is not allowed."));
    },
  }),
);
app.use(cookieParser());
app.use((req, res, next) => {
  const contentLength = Number(req.headers["content-length"] ?? 0);
  const hasBody =
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    ((Number.isFinite(contentLength) && contentLength > 0) || req.headers["transfer-encoding"] !== undefined);
  if (hasBody && !req.is("application/json") && req.path !== "/api/billing/webhook") {
    res.status(415).json({ ok: false, error: "Request body must use application/json." });
    return;
  }
  next();
});
app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use("/api", router);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Unexpected server error.";
  let status = process.env.NODE_ENV === "production" ? 500 : 400;
  if (err instanceof AdminAccessError) status = 403;
  else if (err instanceof AuthenticationUnavailableError) status = 503;
  else if (err instanceof AuthenticationError) status = 401;
  else if (err instanceof AppConfigError) status = 422;
  else if (err instanceof InsufficientCreditsError) status = 402;
  const diagnostic = {
    errorName: err instanceof Error ? err.name : "UnknownError",
    correlationId: String((req as Request & { id?: string }).id ?? "unknown"),
    route: req.path,
    method: req.method,
  };
  if (process.env.NODE_ENV === "production") logger.error(diagnostic, "request failed");
  else logger.error({ ...diagnostic, err }, "request failed");
  if (status >= 500 && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    void new OperationsRepository().recordError({
      correlationId: String((req as Request & { id?: string }).id ?? "unknown"),
      route: req.path,
      method: req.method,
      errorName: err instanceof Error ? err.name : "UnknownError",
      safeMessage: "Unexpected server error.",
    });
  }
  const userSafe =
    err instanceof AdminAccessError ||
    err instanceof AuthenticationUnavailableError ||
    err instanceof AuthenticationError ||
    err instanceof AppConfigError ||
    err instanceof InsufficientCreditsError;
  res.status(status).json({
    ok: false,
    error: status >= 500 && !userSafe ? "Unexpected server error." : message,
  });
});

export default app;

function allowedOrigins() {
  return new Set(
    (process.env.APP_BASE_URL ?? "http://localhost:5173")
      .split(",")
      .map((value) => value.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}
