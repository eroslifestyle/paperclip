import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { forbidden } from "../errors.js";
import { spendSummaryService } from "../services/spend-summary.js";
import type { SpendGuardian } from "../services/spend-guardian.js";

function assertCanReadAdminSpend(req: Request) {
  if (req.actor.type !== "board") {
    throw forbidden("Board access required");
  }
  if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) {
    return;
  }
  throw forbidden("Instance admin access required");
}

export interface AdminSpendRoutesOptions {
  spendGuardian?: SpendGuardian;
  rateLookbackMinutes?: number;
}

export function adminSpendRoutes(db: Db, opts: AdminSpendRoutesOptions = {}) {
  const router = Router();
  const summary = spendSummaryService(db, {
    rateLookbackMinutes: opts.rateLookbackMinutes,
  });

  router.get("/admin/spend-summary", async (req, res) => {
    assertCanReadAdminSpend(req);
    res.json(await summary.getInstance());
  });

  router.get("/admin/spend-summary/companies/:companyId", async (req, res) => {
    assertCanReadAdminSpend(req);
    const companyId = req.params.companyId;
    if (!companyId) {
      res.status(400).json({ error: "companyId required" });
      return;
    }
    res.json(await summary.getForCompany(companyId));
  });

  router.get("/admin/spend-guardian/status", async (req, res) => {
    assertCanReadAdminSpend(req);
    if (!opts.spendGuardian) {
      res.json({ available: false });
      return;
    }
    res.json({ available: true, ...opts.spendGuardian.getStatus() });
  });

  router.post("/admin/spend-guardian/tick-now", async (req, res) => {
    assertCanReadAdminSpend(req);
    if (!opts.spendGuardian) {
      res.status(404).json({ error: "Spend Guardian not running" });
      return;
    }
    await opts.spendGuardian.tickNow();
    res.json({ ok: true, status: opts.spendGuardian.getStatus() });
  });

  return router;
}
