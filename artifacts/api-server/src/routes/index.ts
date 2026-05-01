import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ediRouter from "./edi";
import transactionsRouter from "./transactions";
import purchaseOrdersRouter from "./purchaseOrders";
import inventoryRouter from "./inventory";
import partnersRouter from "./partners";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ediRouter);
router.use(transactionsRouter);
router.use(purchaseOrdersRouter);
router.use(inventoryRouter);
router.use(partnersRouter);
router.use(dashboardRouter);

export default router;
