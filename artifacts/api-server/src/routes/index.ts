import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import sweepscoutRouter from "./sweepscout";
import { authenticateRequest, requireCsrf } from "@/lib/auth/session";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use(authenticateRequest);
router.use(requireCsrf);
router.use(sweepscoutRouter);

export default router;
