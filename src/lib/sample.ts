import type {RefactorItem} from "../types";
import {blockedFrom, uid} from "../types";

const now = Date.now();
const h = 3600_000;
const d = 24 * h;

function make(partial: Partial<RefactorItem> & Pick<RefactorItem, "title">): RefactorItem {
  const item = {
    id: uid(),
    description: "",
    files: [],
    risk: "medium",
    effort: "medium",
    category: "other",
    tags: [],
    stage: "queued",
    blocked: false,
    blockReason: "",
    notes: [],
    createdAt: now - 72 * h,
    updatedAt: now - 24 * h,
    ...partial,
  } as RefactorItem;
  return {...item, ...blockedFrom(item.notes)};
}

export function sampleItems(): RefactorItem[] {
  return [
    make({
      title: "Extract payment retry logic into PaymentRetryService",
      description: "Retry/backoff logic is duplicated across three checkout handlers with subtle differences. Consolidate into a single service with a configurable policy so future changes happen in one place.",
      files: ["src/checkout/card_handler.py", "src/checkout/wallet_handler.py", "src/checkout/invoice_handler.py"],
      risk: "high",
      effort: "high",
      category: "extract",
      tags: ["payments", "duplication"],
      stage: "active",
      notes: [{id: uid(), text: "Card + wallet handlers unified. Invoice handler still has the legacy path behind a flag.", createdAt: now - 5 * h}],
    }),
    make({
      title: "Delete legacy CSV export pipeline",
      description: "Superseded by the async export worker in Q1. No traffic in 90 days per access logs.",
      files: ["src/exports/legacy_csv.py", "src/exports/csv_templates/"],
      risk: "low",
      effort: "low",
      category: "dead-code",
      tags: ["exports"],
      stage: "queued",
    }),
    make({
      title: "Rename UserManager → AccountService",
      description: 'The class manages accounts, orgs, and billing profiles — "UserManager" misleads every new hire. Rename plus update ~140 call sites.',
      files: ["src/accounts/user_manager.py"],
      risk: "medium",
      effort: "medium",
      category: "rename",
      tags: ["naming", "accounts"],
      stage: "queued",
    }),
    make({
      title: "Upgrade SQLAlchemy 1.4 → 2.0",
      description: "Blocking async session support and pinning us to Python 3.11. Query API changes touch most of the data layer.",
      files: ["src/db/", "requirements.txt"],
      risk: "high",
      effort: "high",
      category: "dependency",
      tags: ["database", "upgrade"],
      stage: "deferred",
      notes: [{id: uid(), text: "Waiting on ORM query audit from the data team — ETA Friday.", createdAt: now - 6 * h, blocked: true}],
    }),
    make({
      title: "Replace N+1 queries in dashboard summary endpoint",
      description: "The /summary endpoint issues one query per project. P95 latency is 2.3s for large orgs; a single aggregate query brings it under 200ms in testing.",
      files: ["src/api/dashboard.py", "src/db/queries/projects.py"],
      risk: "medium",
      effort: "medium",
      category: "performance",
      tags: ["latency", "database"],
      stage: "reviewing",
      notes: [{id: uid(), text: "Load test passed. Waiting on staging canary before merge.", createdAt: now - 2 * h}],
    }),
    make({
      title: "Add characterization tests around TaxCalculator before rewrite",
      description: "Zero coverage on the module we most want to rewrite. Pin current behavior (including the rounding quirks) before touching it.",
      files: ["src/billing/tax_calculator.py"],
      risk: "low",
      effort: "medium",
      category: "test",
      tags: ["billing", "safety-net"],
      stage: "active",
    }),
    make({
      title: "Split monolithic settings module by domain",
      description: "settings.py is 1,900 lines and every team merges into it. Split into per-domain config modules with a compatibility shim.",
      files: ["src/config/settings.py"],
      risk: "medium",
      effort: "high",
      category: "architecture",
      tags: ["config", "ownership"],
      stage: "queued",
    }),
    make({
      title: "Remove deprecated v1 webhook signatures",
      description: "v1 HMAC scheme deprecated 18 months ago. Two external partners still on it — confirm migration, then delete.",
      files: ["src/webhooks/signing.py"],
      risk: "high",
      effort: "low",
      category: "dead-code",
      tags: ["webhooks", "security"],
      stage: "queued",
      notes: [{id: uid(), text: 'Partner "Acme Logistics" has not confirmed v2 migration.', createdAt: now - 8 * h, blocked: true}],
    }),
    make({
      title: "Normalize error responses across public API",
      description: "Four different error envelope shapes in the public API. Standardize on RFC 7807 problem+json with a translation layer for old clients.",
      files: ["src/api/errors.py", "src/api/middleware.py"],
      risk: "medium",
      effort: "high",
      category: "architecture",
      tags: ["api", "dx"],
      stage: "deployed",
      updatedAt: now - 2 * d,
      notes: [{id: uid(), text: "Shipped behind api_errors_v2 flag, ramped to 100% on Tuesday.", createdAt: now - 30 * h}],
    }),
    make({
      title: "Inline single-use OrderDecorator wrappers",
      description: "Six decorator classes each used exactly once, adding an indirection layer nobody remembers the reason for. Git archaeology says it was for a 2019 A/B test.",
      files: ["src/orders/decorators.py"],
      risk: "low",
      effort: "low",
      category: "dead-code",
      tags: ["orders"],
      stage: "deployed",
      updatedAt: now - 23 * d,
    }),
  ];
}
