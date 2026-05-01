import { Router } from "express";
import { db } from "@workspace/db";
import { partnersTable } from "@workspace/db";

const router = Router();

router.get("/partners", async (req, res) => {
  const partners = await db.select().from(partnersTable).orderBy(partnersTable.name);
  return res.json({ partners });
});

export default router;
