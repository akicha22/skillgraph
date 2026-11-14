import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./db";

const app = express();
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  const users = await prisma.user.count();
  res.json({
    status: "ok",
    database: "connected",
    users,
    aiProvider: process.env.AI_PROVIDER ?? "template",
  });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`API running on http://localhost:${port}`));