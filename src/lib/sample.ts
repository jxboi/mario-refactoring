import type {WorkItem} from "../types";
import {blockedFrom, uid} from "../types";

const now = Date.now();
const h = 3600_000;
const d = 24 * h;

function make(partial: Partial<WorkItem> & Pick<WorkItem, "title">): WorkItem {
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
    parentIds: [],
    createdAt: now - 72 * h,
    updatedAt: now - 24 * h,
    ...partial,
  } as WorkItem;
  return {...item, ...blockedFrom(item.notes)};
}

export function sampleItems(): WorkItem[] {
  return [
    make({
      title: "Extract payment retry logic into PaymentRetryService",
      description: "Retry/backoff logic is duplicated across three checkout handlers with subtle differences. Consolidate into a single service with a configurable policy so future changes happen in one place.",
      files: ["src/checkout/card_handler.py", "src/checkout/wallet_handler.py", "src/checkout/invoice_handler.py"],
      risk: "high",
      effort: "high",
      category: "refactor",
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
      category: "refactor",
      tags: ["exports"],
      stage: "queued",
    }),
    make({
      title: "Rename UserManager → AccountService",
      description: 'The class manages accounts, orgs, and billing profiles — "UserManager" misleads every new hire. Rename plus update ~140 call sites.',
      files: ["src/accounts/user_manager.py"],
      risk: "medium",
      effort: "medium",
      category: "refactor",
      tags: ["naming", "accounts"],
      stage: "queued",
    }),
    make({
      title: "Upgrade SQLAlchemy 1.4 → 2.0",
      description: "Blocking async session support and pinning us to Python 3.11. Query API changes touch most of the data layer.",
      files: ["src/db/", "requirements.txt"],
      risk: "high",
      effort: "high",
      category: "infrastructure",
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
      category: "refactor",
      tags: ["config", "ownership"],
      stage: "queued",
    }),
    make({
      title: "Remove deprecated v1 webhook signatures",
      description: "v1 HMAC scheme deprecated 18 months ago. Two external partners still on it — confirm migration, then delete.",
      files: ["src/webhooks/signing.py"],
      risk: "high",
      effort: "low",
      category: "refactor",
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
      category: "infrastructure",
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

export function sampleTasks(): WorkItem[] {
  return [
    make({
      title: "Provision staging access for new contractor",
      description: "Grant read access to the staging cluster and the shared 1Password vault before their start date.",
      risk: "medium",
      effort: "low",
      category: "request",
      tags: ["access", "onboarding"],
      stage: "queued",
    }),
    make({
      title: "Investigate elevated 5xx on checkout API",
      description: "Error rate jumped from 0.1% to 2.4% after the 14:00 deploy. Confirm whether it correlates with the new payment provider timeout.",
      risk: "high",
      effort: "medium",
      category: "incident",
      tags: ["checkout", "reliability"],
      stage: "active",
      notes: [{id: uid(), text: "Rolled back the timeout change; watching dashboards for the next hour.", createdAt: now - 3 * h}],
    }),
    make({
      title: "Fix timezone offset on invoice PDFs",
      description: "Invoices render dates in UTC instead of the customer's locale, so some show the wrong day. Format against the account timezone.",
      risk: "high",
      effort: "low",
      category: "bug",
      tags: ["billing"],
      stage: "reviewing",
      notes: [{id: uid(), text: "Fix verified against 3 timezones; waiting on a second review.", createdAt: now - 2 * h}],
    }),
    make({
      title: "Follow up with vendor on SSO rollout",
      description: "Confirm the go-live date and the exact scopes they need before we open the firewall.",
      risk: "medium",
      effort: "low",
      category: "follow-up",
      tags: ["vendors", "sso"],
      stage: "queued",
    }),
    make({
      title: "Update onboarding runbook for the new deploy flow",
      description: "The deploy steps changed when we moved to the release train. The runbook still references the old manual promote step.",
      risk: "low",
      effort: "medium",
      category: "documentation",
      tags: ["docs", "deploy"],
      stage: "active",
    }),
    make({
      title: "Evaluate feature-flag providers",
      description: "Compare LaunchDarkly, Flagsmith, and a home-grown option on cost, SDK support, and audit logging. Write a one-page recommendation.",
      risk: "low",
      effort: "high",
      category: "research",
      tags: ["tooling"],
      stage: "deferred",
    }),
    make({
      title: "Chase signed MSA from Acme Logistics",
      description: "Legal approved the redlines two weeks ago. We can't start the integration until the MSA is countersigned.",
      risk: "high",
      effort: "low",
      category: "follow-up",
      tags: ["legal", "partners"],
      stage: "queued",
      notes: [{id: uid(), text: "Waiting on Acme's procurement — pinged their account manager again.", createdAt: now - 9 * h, blocked: true}],
    }),
    make({
      title: "Publish Q3 incident postmortem: homepage cache stampede",
      description: "Write up the timeline, root cause, and the three follow-up actions, then circulate to the wider team.",
      risk: "medium",
      effort: "low",
      category: "incident",
      tags: ["postmortem"],
      stage: "deployed",
      updatedAt: now - 3 * d,
    }),
  ];
}

export function samplePlans(): WorkItem[] {
  return [
    make({title: "Improve new-team onboarding", description: "Help a new team reach its first useful result in one session.", risk: "high", effort: "high", category: "initiative", tags: ["activation"], stage: "active"}),
    make({title: "Define self-service access controls", description: "Clarify roles, permissions, and audit expectations before implementation.", risk: "medium", effort: "medium", category: "feature", tags: ["security"], stage: "reviewing"}),
    make({title: "Research customer reporting needs", description: "Interview key users and identify the smallest valuable reporting surface.", risk: "medium", effort: "low", category: "research", tags: ["discovery"], stage: "queued"}),
  ];
}
