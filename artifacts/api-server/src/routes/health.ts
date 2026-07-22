import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { publicCatalog } from "@/lib/billing";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/billing/catalog", (_req, res) => {
  res.json({ ok: true, data: publicCatalog() });
});

export default router;
