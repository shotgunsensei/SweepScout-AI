import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import sweepscoutRouter from "./sweepscout";
import { authenticateRequest, requireCsrf, requireRequestAuth } from "@/lib/auth/session";
import { checkRateLimit, requestClientKey } from "@/lib/rate-limit";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use(authenticateRequest);
router.use((req, res, next) => {
  const configured = Number(process.env.API_RATE_LIMIT_MAX ?? 900);
  const limit = Number.isInteger(configured) && configured >= 60 && configured <= 10_000 ? configured : 900;
  const auth = requireRequestAuth(req);
  const result = checkRateLimit(`api:${auth.userId}:${requestClientKey(req)}`, limit, 15 * 60 * 1000);
  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(result.remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  if (!result.allowed) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))));
    res.status(429).json({ ok: false, error: "API rate limit exceeded. Try again later." });
    return;
  }
  next();
});
router.use(requireCsrf);
router.use(sweepscoutRouter);

export default router;
