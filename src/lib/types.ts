export type ProjectType = "dev" | "design_pm";
export type TrackingMode = "slack_scan" | "manual_entry" | "none";
export type PersonRole = "dev" | "design" | "qa" | "other";

export type ProjectHeader = {
  planned_vs_actual?: string;
  dev_completion?: string;
  launch?: string;
  status?: string;
  design_started?: string;
};

export type Project = {
  id: string;
  name: string;
  type: ProjectType;
  header: ProjectHeader;
  sort_order: number;
  active: boolean;
};

export type Person = {
  id: string;
  name: string;
  role: PersonRole;
  email: string | null;
  slack_user_id: string | null;
};

export const ROLE_LABEL: Record<PersonRole, string> = { dev: "Developer", design: "Designer", qa: "QA", other: "Other" };
export const TRACKING_LABEL: Record<TrackingMode, string> = {
  slack_scan: "Read EOD from Slack",
  manual_entry: "I type their update",
  none: "Don't track",
};
export const TYPE_LABEL: Record<ProjectType, string> = { dev: "Dev + PM", design_pm: "Design + PM" };

/** Header fields per project type, in display order. */
export const HEADER_FIELDS: Record<ProjectType, { key: keyof ProjectHeader; label: string; kind: "text" | "date" }[]> = {
  dev: [
    { key: "planned_vs_actual", label: "Planned vs Actual", kind: "text" },
    { key: "dev_completion", label: "Dev Completion", kind: "date" },
    { key: "launch", label: "Launch", kind: "date" },
  ],
  design_pm: [
    { key: "status", label: "Status", kind: "text" },
    { key: "design_started", label: "Design Started", kind: "date" },
  ],
};
