import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sweepscoutRouter from "./sweepscout";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sweepscoutRouter);

export default router;
