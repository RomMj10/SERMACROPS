import { Router } from "express";
import { getDb } from "@workspace/db";

const router = Router();

router.get("/partners", async (req, res) => {
  const db = await getDb();
  const col = db.collection("partners");
  const partners = await col.find({}).sort({ name: 1 }).toArray();
  return res.json({ partners: partners.map(({ _id, ...rest }) => rest) });
});

router.patch("/partners/:id", async (req, res) => {
  const db = await getDb();
  const col = db.collection("partners");

  const allowed = ["name", "email", "ediId", "as2Id", "isActive"];
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const result = await col.findOneAndUpdate(
    { id: req.params.id },
    { $set: updates },
    { returnDocument: "after" }
  );

  if (!result) {
    return res.status(404).json({ error: "not_found", message: "Partner not found" });
  }

  const { _id, ...rest } = result as any;
  return res.json(rest);
});

export default router;
