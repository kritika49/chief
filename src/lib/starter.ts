import "server-only";
import type { PersonRole, ProjectHeader, ProjectType, TrackingMode } from "@/lib/types";

// Spec Section 17: starter projects for the first PM's account only.
export const STARTER_OWNER_EMAIL = "kritika@byldd.com";

type StarterPerson = { name: string; role: PersonRole; email: string; slack_user_id: string; tracking: TrackingMode; nudge: boolean };
type StarterProject = {
  name: string;
  type: ProjectType;
  header: ProjectHeader;
  channel?: { id: string; name: string };
  people: StarterPerson[];
  pinned?: string[];
};

export const STARTER_TARGET_CHANNEL = { id: "C027NN9JC7M", name: "product_management" };

export const STARTER_PROJECTS: StarterProject[] = [
  {
    name: "Bles",
    type: "dev",
    header: { planned_vs_actual: "On Track, Dev Ongoing", dev_completion: "2026-10-12", launch: "2026-10-21" },
    channel: { id: "C0BG3GPPMLN", name: "bles-internal" },
    people: [
      { name: "Manju", role: "dev", email: "manju@byldd.com", slack_user_id: "U09AR5THFPA", tracking: "slack_scan", nudge: true },
      { name: "Nileshwar", role: "dev", email: "nileshwar@byldd.com", slack_user_id: "U03JSSBKDL4", tracking: "slack_scan", nudge: true },
    ],
    pinned: ["QA is ongoing."],
  },
  {
    name: "Dontbelated",
    type: "dev",
    header: { planned_vs_actual: "", dev_completion: "", launch: "" },
    channel: { id: "C0BH4V94Z42", name: "dontbelated" },
    people: [
      { name: "Shlok", role: "dev", email: "shlok@byldd.com", slack_user_id: "U079SARCE1X", tracking: "slack_scan", nudge: true },
      { name: "Shourya", role: "design", email: "shourya@byldd.com", slack_user_id: "U0833ASJHPF", tracking: "manual_entry", nudge: false },
    ],
  },
  {
    name: "Italica",
    type: "design_pm",
    header: { status: "Initial Design Phase", design_started: "2026-09-14" },
    people: [],
  },
];
