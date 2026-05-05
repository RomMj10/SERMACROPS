import { Router } from "express";
import { getDb } from "@workspace/db";

const router = Router();

router.get("/partners", async (req, res) => {
  const db = await getDb();
  const col = db.collection("partners");
  const partners = await col.find({}).sort({ name: 1 }).toArray();
  return res.json({ partners: partners.map(({ _id, ...rest }) => rest) });
});

export default router;
