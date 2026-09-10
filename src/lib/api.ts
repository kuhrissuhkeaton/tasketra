const BASE = "/api";

// Thrown by request()/uploadRequest() on non-2xx responses. Carries the HTTP
// status and the `upgradeRequired` flag our billing-gated endpoints (project
// creation, member invites) send back on 402 so the UI can show an upgrade
// prompt instead of a generic error.
export class ApiError extends Error {
  status: number;
  upgradeRequired: boolean;
  constructor(message: string, status: number, upgradeRequired = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.upgradeRequired = upgradeRequired;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status, !!data.upgradeRequired);
  }
  return data as T;
}

// Like request(), but for multipart/form-data uploads -- omits the JSON
// content-type header so the browser can set its own multipart boundary.
async function uploadRequest<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status, !!data.upgradeRequired);
  }
  return data as T;
}

export type User = {
  id: string;
  email: string;
  isAdmin?: boolean;
  plan?: "founding" | "trialing" | "active" | "free";
  display_name?: string | null;
  job_title?: string | null;
  timezone?: string | null;
  has_avatar?: boolean;
  tour_completed_at?: string | null;
};

export type ReferralInfo = {
  link: string;
  totalReferred: number;
  totalRewarded: number;
  referred: { email: string; joinedAt: string; rewarded: boolean }[];
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  owner_id?: string;
  is_owner?: boolean;
  open_decisions?: number;
  overdue_tasks?: number;
  webhook_enabled?: boolean;
  ccb_enabled?: boolean;
  roadmap_share_enabled?: boolean;
  roadmap_share_token?: string | null;
  archived?: boolean;
  deleted_at?: string | null;
};

export type ProjectMember = {
  id: string;
  email: string;
  status: "invited" | "active";
  invited_at: string;
  joined_at: string | null;
  is_ccb_reviewer?: boolean;
};

export type Meeting = {
  id: string;
  title: string;
  meeting_type: "kickoff" | "status" | "steering" | "retro" | "ccb_review" | "other";
  meeting_date: string | null;
  attendees: string | null;
  notes: string | null;
  action_items: MeetingActionItem[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MeetingActionItem = {
  id: string;
  text: string;
  done: boolean;
  taskId?: string | null;
};

export type Stakeholder = {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  decisions_sent?: number;
  decisions_resolved?: number;
};

export type Task = {
  id: string;
  title: string;
  status: "not_started" | "in_progress" | "blocked" | "done";
  owner_name: string | null;
  start_date: string | null;
  due_date: string | null;
  stakeholder_id: string | null;
  parent_task_id: string | null;
};

export type Decision = {
  id: string;
  title: string;
  context: string | null;
  options: string[];
  deadline: string | null;
  public_token: string;
  status: "open" | "resolved";
  created_at: string;
  chosen_option: string | null;
  responder_name: string | null;
  responded_at: string | null;
  recipients: { id: string; name: string }[];
};

export type Issue = {
  id: string;
  title: string;
  description: string | null;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved";
  owner_name: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type Risk = {
  id: string;
  title: string;
  description: string | null;
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  mitigation: string | null;
  owner_name: string | null;
  status: "open" | "monitoring" | "resolved";
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type WaitlistSignup = {
  id: string;
  email: string;
  status: "pending" | "invited";
  created_at: string;
};

export type FoundingMember = {
  id: string;
  email: string;
  display_name: string | null;
  job_title: string | null;
  created_at: string;
};

export type Feedback = {
  id: string;
  message: string;
  page_path: string | null;
  status: "new" | "planned" | "shipped" | "dismissed";
  admin_note: string | null;
  notified_at: string | null;
  created_at: string;
  submitter_email?: string;
};

export type FeedItem = {
  type: "status_update" | "task" | "decision_request" | "decision_record" | "issue" | "risk" | "activity";
  title: string | null;
  body: string | null;
  ts: string;
  meta: Record<string, unknown>;
};

export type TrashItem = {
  entity_type: "task" | "issue" | "risk" | "stakeholder" | "decision" | "assumption" | "dependency" | "change_request" | "lesson" | "meeting" | "document" | "roadmap_item";
  id: string;
  title: string;
  deleted_at: string;
};

export type ProjectDocument = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  uploaded_by_email?: string;
  previewable: boolean;
};

// Storage usage is scoped to the project owner's account, not the viewer --
// every member of a project sees the same shared number.
export type StorageUsage = {
  usedBytes: number;
  capBytes: number;
};

export type RoadmapItemType = "phase" | "milestone" | "release" | "event" | "note";
export type RoadmapItem = {
  id: string;
  type: RoadmapItemType;
  title: string;
  description: string | null;
  swimlane: string;
  start_date: string | null;
  end_date: string | null;
  status: "not_started" | "in_progress" | "blocked" | "done";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ChangeRequest = {
  id: string;
  title: string;
  description: string | null;
  reason: string | null;
  schedule_impact_days: number | null;
  budget_impact: number | null;
  status: "proposed" | "approved" | "rejected" | "implemented";
  requested_by: string | null;
  decided_by: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
  ccb_approvals: { email: string; approved_at: string }[];
};

export type Lesson = {
  id: string;
  category: "went_well" | "went_poorly" | "action_item";
  summary: string;
  details: string | null;
  owner_name: string | null;
  status: "open" | "done";
  created_at: string;
  updated_at: string;
};

export type Assumption = {
  id: string;
  statement: string;
  notes: string | null;
  status: "unconfirmed" | "confirmed" | "invalidated";
  owner_name: string | null;
  created_at: string;
  updated_at: string;
  validated_at: string | null;
};

export type Dependency = {
  id: string;
  title: string;
  description: string | null;
  direction: "internal" | "external";
  status: "blocked" | "in_progress" | "resolved";
  owner_name: string | null;
  needed_by: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type TodayData = {
  blockedTasks: { id: string; title: string; owner_name: string | null; due_date: string | null; updated_at: string }[];
  staleTasks: { id: string; title: string; status: string; owner_name: string | null; updated_at: string }[];
  awaitingDecisions: { id: string; title: string; created_at: string; deadline: string | null; recipients: string[] }[];
  urgentIssues: { id: string; title: string; severity: string; owner_name: string | null }[];
  urgentRisks: { id: string; title: string; probability: string; impact: string; owner_name: string | null }[];
  taskCount: number;
};

export type WeeklyReport = {
  rangeDays: number;
  generatedAt: string;
  tasksCompleted: { id: string; title: string; owner_name: string | null; updated_at: string }[];
  tasksAdded: { id: string; title: string; owner_name: string | null; due_date: string | null; status: string; created_at: string }[];
  issuesOpened: { id: string; title: string; severity: string; owner_name: string | null; created_at: string }[];
  issuesResolved: { id: string; title: string; severity: string; resolution: string | null; resolved_at: string }[];
  risksOpened: { id: string; title: string; probability: string; impact: string; owner_name: string | null; created_at: string }[];
  risksResolved: { id: string; title: string; probability: string; impact: string; resolved_at: string }[];
  decisionsMade: { id: string; title: string; chosen_option: string; responder_name: string; responded_at: string }[];
  statusUpdates: { id: string; body: string; created_at: string }[];
  snapshot: {
    open_tasks: number;
    blocked_tasks: number;
    open_issues: number;
    urgent_issues: number;
    open_risks: number;
    open_decisions: number;
  };
};

export type CostEntry = {
  id: string;
  description: string;
  amount: number;
  incurred_date: string;
  created_at: string;
};

export type BudgetData = {
  budgetAtCompletion: number | null;
  costEntries: CostEntry[];
  taskStats: { totalTasks: number; doneTasks: number; dueTasks: number };
  metrics: {
    pvPercent: number | null;
    evPercent: number | null;
    ac: number;
    pv: number | null;
    ev: number | null;
    cv: number | null;
    sv: number | null;
    cpi: number | null;
    spi: number | null;
    eac: number | null;
    vac: number | null;
    tcpi: number | null;
  };
};

export const api = {
  register: (email: string, password: string, ref?: string) =>
    request<{ user: User }>("/auth/register", { method: "POST", body: JSON.stringify({ email, password, ...(ref ? { ref } : {}) }) }),
  login: (email: string, password: string) =>
    request<{ user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  me: () => request<{ user: User | null }>("/auth/me"),
  forgotPassword: (email: string) =>
    request<{ ok: true; message: string }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    request<{ user: User }>("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),

  joinWaitlist: (email: string) =>
    request<{ ok: true; message: string }>("/waitlist", { method: "POST", body: JSON.stringify({ email }) }),
  listWaitlist: () => request<{ signups: WaitlistSignup[] }>("/waitlist"),
  markWaitlistInvited: (id: string) =>
    request<{ signup: WaitlistSignup }>("/waitlist", { method: "PATCH", body: JSON.stringify({ id }) }),
  deleteWaitlistSignup: (id: string) => request<{ ok: true }>(`/waitlist?id=${id}`, { method: "DELETE" }),
  listFoundingMembers: () => request<{ members: FoundingMember[] }>("/founding-members"),

  listProjects: () => request<{ projects: Project[] }>("/projects"),
  listDeletedProjects: () => request<{ projects: Project[] }>("/projects?deleted=true"),
  createProject: (name: string, description?: string) =>
    request<{ project: Project }>("/projects", { method: "POST", body: JSON.stringify({ name, description }) }),
  getProject: (id: string) => request<{ project: Project }>(`/project?id=${id}`),
  updateProject: (id: string, patch: { name?: string; description?: string; ccb_enabled?: boolean }) =>
    request<{ project: Project }>("/project", { method: "PATCH", body: JSON.stringify({ id, ...patch }) }),
  deleteProject: (id: string) => request<{ ok: true }>(`/project?id=${id}`, { method: "DELETE" }),
  restoreProject: (id: string) =>
    request<{ project: Project }>("/project", { method: "PATCH", body: JSON.stringify({ id, restore: true }) }),

  listStakeholders: (projectId: string) =>
    request<{ stakeholders: Stakeholder[] }>(`/stakeholders?projectId=${projectId}`),
  createStakeholder: (projectId: string, name: string, email?: string, role?: string) =>
    request<{ stakeholder: Stakeholder }>("/stakeholders", {
      method: "POST",
      body: JSON.stringify({ projectId, name, email, role }),
    }),
  updateStakeholder: (id: string, patch: Partial<Pick<Stakeholder, "name" | "role" | "email">>) =>
    request<{ stakeholder: Stakeholder }>("/stakeholders", {
      method: "PATCH",
      body: JSON.stringify({ id, name: patch.name, role: patch.role, email: patch.email }),
    }),
  deleteStakeholder: (id: string) => request<{ ok: true }>(`/stakeholders?id=${id}`, { method: "DELETE" }),
  restoreStakeholder: (id: string) =>
    request<{ ok: true }>("/stakeholders", { method: "PATCH", body: JSON.stringify({ id, restore: true }) }),

  listTasks: (projectId: string) => request<{ tasks: Task[] }>(`/tasks?projectId=${projectId}`),
  createTask: (projectId: string, title: string, ownerName?: string, dueDate?: string, parentTaskId?: string, startDate?: string) =>
    request<{ task: Task }>("/tasks", {
      method: "POST",
      body: JSON.stringify({ projectId, title, ownerName, dueDate, parentTaskId, startDate }),
    }),
  updateTask: (id: string, patch: Partial<Pick<Task, "status" | "title" | "owner_name" | "due_date" | "parent_task_id" | "start_date">>) =>
    request<{ task: Task }>("/tasks", {
      method: "PATCH",
      body: JSON.stringify({
        id, status: patch.status, title: patch.title, ownerName: patch.owner_name,
        dueDate: patch.due_date, parentTaskId: patch.parent_task_id, startDate: patch.start_date,
      }),
    }),
  deleteTask: (id: string) => request<{ ok: true }>(`/tasks?id=${id}`, { method: "DELETE" }),
  restoreTask: (id: string) =>
    request<{ ok: true }>("/tasks", { method: "PATCH", body: JSON.stringify({ id, restore: true }) }),

  createStatusUpdate: (projectId: string, body: string) =>
    request<{ statusUpdate: unknown }>("/status-updates", { method: "POST", body: JSON.stringify({ projectId, body }) }),

  listDecisions: (projectId: string) => request<{ decisions: Decision[] }>(`/decisions?projectId=${projectId}`),
  createDecision: (
    projectId: string,
    title: string,
    context: string,
    options: string[],
    deadline: string | undefined,
    stakeholderIds: string[]
  ) =>
    request<{ decision: Decision; shareUrl: string }>("/decisions", {
      method: "POST",
      body: JSON.stringify({ projectId, title, context, options, deadline, stakeholderIds }),
    }),
  deleteDecision: (id: string) => request<{ ok: true }>(`/decisions?id=${id}`, { method: "DELETE" }),
  restoreDecision: (id: string) =>
    request<{ ok: true }>("/decisions", { method: "PATCH", body: JSON.stringify({ id, restore: true }) }),

  listIssues: (projectId: string) => request<{ issues: Issue[] }>(`/issues?projectId=${projectId}`),
  createIssue: (projectId: string, title: string, description?: string, severity?: Issue["severity"], ownerName?: string) =>
    request<{ issue: Issue }>("/issues", {
      method: "POST",
      body: JSON.stringify({ projectId, title, description, severity, ownerName }),
    }),
  updateIssue: (id: string, patch: Partial<Pick<Issue, "status" | "severity" | "resolution" | "owner_name" | "title" | "description">>) =>
    request<{ issue: Issue }>("/issues", {
      method: "PATCH",
      body: JSON.stringify({
        id, status: patch.status, severity: patch.severity, resolution: patch.resolution,
        ownerName: patch.owner_name, title: patch.title, description: patch.description,
      }),
    }),
  deleteIssue: (id: string) => request<{ ok: true }>(`/issues?id=${id}`, { method: "DELETE" }),
  restoreIssue: (id: string) =>
    request<{ ok: true }>("/issues", { method: "PATCH", body: JSON.stringify({ id, restore: true }) }),

  listRisks: (projectId: string) => request<{ risks: Risk[] }>(`/risks?projectId=${projectId}`),
  createRisk: (
    projectId: string,
    title: string,
    description?: string,
    probability?: Risk["probability"],
    impact?: Risk["impact"],
    mitigation?: string,
    ownerName?: string
  ) =>
    request<{ risk: Risk }>("/risks", {
      method: "POST",
      body: JSON.stringify({ projectId, title, description, probability, impact, mitigation, ownerName }),
    }),
  updateRisk: (id: string, patch: Partial<Pick<Risk, "status" | "probability" | "impact" | "mitigation" | "owner_name" | "title" | "description">>) =>
    request<{ risk: Risk }>("/risks", {
      method: "PATCH",
      body: JSON.stringify({
        id, status: patch.status, probability: patch.probability, impact: patch.impact,
        mitigation: patch.mitigation, ownerName: patch.owner_name, title: patch.title, description: patch.description,
      }),
    }),
  deleteRisk: (id: string) => request<{ ok: true }>(`/risks?id=${id}`, { method: "DELETE" }),
  restoreRisk: (id: string) =>
    request<{ ok: true }>("/risks", { method: "PATCH", body: JSON.stringify({ id, restore: true }) }),

  getTrash: (projectId: string) => request<{ items: TrashItem[] }>(`/trash?projectId=${projectId}`),
  restoreItem: (entityType: TrashItem["entity_type"], id: string) => {
    const path: Record<TrashItem["entity_type"], string> = {
      task: "/tasks", issue: "/issues", risk: "/risks", stakeholder: "/stakeholders", decision: "/decisions",
      assumption: "/assumptions", dependency: "/dependencies",
      change_request: "/change-requests", lesson: "/lessons", meeting: "/meetings", document: "/documents",
      roadmap_item: "/roadmap",
    };
    return request<{ ok: true }>(path[entityType], { method: "PATCH", body: JSON.stringify({ id, restore: true }) });
  },

  listDocuments: (projectId: string) =>
    request<{ documents: ProjectDocument[]; storage: StorageUsage }>(`/documents?projectId=${projectId}`),
  uploadDocument: (projectId: string, file: File) => {
    const form = new FormData();
    form.append("projectId", projectId);
    form.append("file", file);
    return uploadRequest<{ document: ProjectDocument }>("/documents", form);
  },
  deleteDocument: (id: string) => request<{ ok: true }>(`/documents?id=${id}`, { method: "DELETE" }),
  documentDownloadUrl: (id: string) => `${BASE}/documents?id=${id}`,

  createCheckoutSession: (interval: "month" | "year") =>
    request<{ url: string }>("/create-checkout-session", { method: "POST", body: JSON.stringify({ interval }) }),
  createPortalSession: () => request<{ url: string }>("/create-portal-session", { method: "POST" }),

  listMeetings: (projectId: string) => request<{ meetings: Meeting[] }>(`/meetings?projectId=${projectId}`),
  createMeeting: (
    projectId: string, title: string, meetingType: Meeting["meeting_type"],
    meetingDate?: string, attendees?: string, notes?: string, createdBy?: string
  ) =>
    request<{ meeting: Meeting }>("/meetings", {
      method: "POST",
      body: JSON.stringify({ projectId, title, meetingType, meetingDate, attendees, notes, createdBy }),
    }),
  updateMeeting: (
    id: string,
    patch: Partial<Pick<Meeting, "title" | "meeting_type" | "meeting_date" | "attendees" | "notes" | "action_items">>
  ) =>
    request<{ meeting: Meeting }>("/meetings", {
      method: "PATCH",
      body: JSON.stringify({
        id, title: patch.title, meetingType: patch.meeting_type, meetingDate: patch.meeting_date,
        attendees: patch.attendees, notes: patch.notes, actionItems: patch.action_items,
      }),
    }),
  deleteMeeting: (id: string) => request<{ ok: true }>(`/meetings?id=${id}`, { method: "DELETE" }),
  restoreMeeting: (id: string) =>
    request<{ ok: true }>("/meetings", { method: "PATCH", body: JSON.stringify({ id, restore: true }) }),

  setCcbReviewer: (projectId: string, memberId: string, isCcbReviewer: boolean) =>
    request<{ member: ProjectMember }>("/members", {
      method: "PATCH", body: JSON.stringify({ id: memberId, projectId, isCcbReviewer }),
    }),

  listChangeRequests: (projectId: string) => request<{ changeRequests: ChangeRequest[] }>(`/change-requests?projectId=${projectId}`),
  signChangeRequest: (id: string) =>
    request<{ changeRequest: ChangeRequest }>("/change-requests", { method: "PATCH", body: JSON.stringify({ id, ccbSignOff: true }) }),
  createChangeRequest: (
    projectId: string, title: string, description?: string, reason?: string,
    scheduleImpactDays?: number, budgetImpact?: number, requestedBy?: string
  ) =>
    request<{ changeRequest: ChangeRequest }>("/change-requests", {
      method: "POST", body: JSON.stringify({ projectId, title, description, reason, scheduleImpactDays, budgetImpact, requestedBy }),
    }),
  updateChangeRequest: (
    id: string,
    patch: Partial<Pick<ChangeRequest, "status" | "title" | "description" | "reason" | "schedule_impact_days" | "budget_impact" | "requested_by" | "decided_by">>
  ) =>
    request<{ changeRequest: ChangeRequest }>("/change-requests", {
      method: "PATCH",
      body: JSON.stringify({
        id, ...patch,
        scheduleImpactDays: patch.schedule_impact_days, budgetImpact: patch.budget_impact,
        requestedBy: patch.requested_by, decidedBy: patch.decided_by,
      }),
    }),
  deleteChangeRequest: (id: string) => request<{ ok: true }>(`/change-requests?id=${id}`, { method: "DELETE" }),

  listLessons: (projectId: string) => request<{ lessons: Lesson[] }>(`/lessons?projectId=${projectId}`),
  createLesson: (projectId: string, summary: string, category?: Lesson["category"], details?: string, ownerName?: string) =>
    request<{ lesson: Lesson }>("/lessons", {
      method: "POST", body: JSON.stringify({ projectId, summary, category, details, ownerName }),
    }),
  updateLesson: (id: string, patch: Partial<Pick<Lesson, "status" | "category" | "summary" | "details" | "owner_name">>) =>
    request<{ lesson: Lesson }>("/lessons", {
      method: "PATCH", body: JSON.stringify({ id, ...patch, ownerName: patch.owner_name }),
    }),
  deleteLesson: (id: string) => request<{ ok: true }>(`/lessons?id=${id}`, { method: "DELETE" }),

  listAssumptions: (projectId: string) => request<{ assumptions: Assumption[] }>(`/assumptions?projectId=${projectId}`),
  createAssumption: (projectId: string, statement: string, notes?: string, ownerName?: string) =>
    request<{ assumption: Assumption }>("/assumptions", {
      method: "POST", body: JSON.stringify({ projectId, statement, notes, ownerName }),
    }),
  updateAssumption: (id: string, patch: Partial<Pick<Assumption, "status" | "statement" | "notes" | "owner_name">>) =>
    request<{ assumption: Assumption }>("/assumptions", {
      method: "PATCH", body: JSON.stringify({ id, ...patch, ownerName: patch.owner_name }),
    }),
  deleteAssumption: (id: string) => request<{ ok: true }>(`/assumptions?id=${id}`, { method: "DELETE" }),

  listDependencies: (projectId: string) => request<{ dependencies: Dependency[] }>(`/dependencies?projectId=${projectId}`),
  createDependency: (
    projectId: string, title: string, description?: string,
    direction?: Dependency["direction"], ownerName?: string, neededBy?: string
  ) =>
    request<{ dependency: Dependency }>("/dependencies", {
      method: "POST", body: JSON.stringify({ projectId, title, description, direction, ownerName, neededBy }),
    }),
  updateDependency: (id: string, patch: Partial<Pick<Dependency, "status" | "title" | "description" | "direction" | "owner_name" | "needed_by">>) =>
    request<{ dependency: Dependency }>("/dependencies", {
      method: "PATCH", body: JSON.stringify({ id, ...patch, ownerName: patch.owner_name, neededBy: patch.needed_by }),
    }),
  deleteDependency: (id: string) => request<{ ok: true }>(`/dependencies?id=${id}`, { method: "DELETE" }),

  listMembers: (projectId: string) =>
    request<{ owner: { id: string; email: string }; members: ProjectMember[] }>(`/members?projectId=${projectId}`),
  inviteMember: (projectId: string, email: string) =>
    request<{ member: ProjectMember }>("/members", { method: "POST", body: JSON.stringify({ projectId, email }) }),
  removeMember: (projectId: string, id: string) =>
    request<{ ok: true }>(`/members?projectId=${projectId}&id=${id}`, { method: "DELETE" }),

  getFeed: (projectId: string) => request<{ feed: FeedItem[] }>(`/feed?projectId=${projectId}`),
  getToday: (projectId: string) => request<TodayData>(`/today?projectId=${projectId}`),
  getWeeklyReport: (projectId: string) => request<WeeklyReport>(`/weekly-report?projectId=${projectId}`),

  getBudget: (projectId: string) => request<BudgetData>(`/budget?projectId=${projectId}`),
  setBudget: (projectId: string, budgetAtCompletion: number | null) =>
    request<{ ok: true }>("/budget", { method: "PATCH", body: JSON.stringify({ projectId, budgetAtCompletion }) }),
  addCostEntry: (projectId: string, description: string, amount: number, incurredDate?: string) =>
    request<{ costEntry: CostEntry }>("/budget", {
      method: "POST",
      body: JSON.stringify({ projectId, description, amount, incurredDate }),
    }),

  downloadTemplate: async (projectId: string, type: "charter" | "risk-register" | "raci", filename: string) => {
    const res = await fetch(`${BASE}/templates?projectId=${projectId}&type=${type}`, { credentials: "include" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to generate template (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  setProjectWebhookEnabled: (projectId: string, enabled: boolean) =>
    request<{ project: Project }>("/project", { method: "PATCH", body: JSON.stringify({ id: projectId, webhook_enabled: enabled }) }),

  listRoadmapItems: (projectId: string) =>
    request<{ items: RoadmapItem[] }>(`/roadmap?projectId=${projectId}`),
  createRoadmapItem: (
    projectId: string,
    item: { type: RoadmapItemType; title: string; description?: string; swimlane?: string; startDate?: string; endDate?: string; status?: RoadmapItem["status"] }
  ) => request<{ item: RoadmapItem }>("/roadmap", { method: "POST", body: JSON.stringify({ projectId, ...item }) }),
  updateRoadmapItem: (
    id: string,
    patch: { type?: RoadmapItemType; title?: string; description?: string; swimlane?: string; startDate?: string | null; endDate?: string | null; status?: RoadmapItem["status"] }
  ) => request<{ item: RoadmapItem }>("/roadmap", { method: "PATCH", body: JSON.stringify({ id, ...patch }) }),
  deleteRoadmapItem: (id: string) => request<{ ok: true }>(`/roadmap?id=${id}`, { method: "DELETE" }),

  setProjectRoadmapShareEnabled: (projectId: string, enabled: boolean) =>
    request<{ project: Project }>("/project", { method: "PATCH", body: JSON.stringify({ id: projectId, roadmap_share_enabled: enabled }) }),
  regenerateRoadmapShareToken: (projectId: string) =>
    request<{ project: Project }>("/project", { method: "PATCH", body: JSON.stringify({ id: projectId, regenerateRoadmapToken: true }) }),
  getPublicRoadmap: (token: string) =>
    request<{ project: { name: string }; items: RoadmapItem[] }>(`/roadmap-public?token=${token}`),

  getWebhookSettings: () => request<{ webhook_url: string | null }>("/webhook-settings"),
  setWebhookSettings: (webhookUrl: string) =>
    request<{ webhook_url: string | null }>("/webhook-settings", { method: "PATCH", body: JSON.stringify({ webhook_url: webhookUrl }) }),

  getPublicDecision: (token: string) =>
    request<{ decision: { id: string; title: string; context: string | null; options: string[]; deadline: string | null; status: string; project_name: string }; record: { chosen_option: string; responder_name: string; responded_at: string } | null }>(
      `/decision-public?token=${token}`
    ),
  respondToDecision: (token: string, chosenOption: string, responderName: string) =>
    request<{ record: { chosen_option: string; responder_name: string; responded_at: string } }>("/decision-public", {
      method: "POST",
      body: JSON.stringify({ token, chosenOption, responderName }),
    }),

  submitFeedback: (message: string, pagePath: string) =>
    request<{ feedback: Feedback }>("/feedback", { method: "POST", body: JSON.stringify({ message, pagePath }) }),
  listFeedback: () => request<{ items: Feedback[] }>("/feedback"),
  updateFeedback: (id: string, updates: { status?: Feedback["status"]; adminNote?: string }) =>
    request<{ feedback: Feedback }>("/feedback", { method: "PATCH", body: JSON.stringify({ id, ...updates }) }),
  notifyFeedbackSubmitter: (id: string) =>
    request<{ feedback: Feedback }>("/feedback", { method: "PATCH", body: JSON.stringify({ id, notify: true }) }),

  updateProfile: (updates: { displayName?: string; jobTitle?: string; timezone?: string }) =>
    request<{ user: { display_name: string | null; job_title: string | null; timezone: string | null } }>("/account", {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("/account", {
      method: "PATCH",
      body: JSON.stringify({ action: "change-password", currentPassword, newPassword }),
    }),
  completeTour: () =>
    request<{ ok: true }>("/account", {
      method: "PATCH",
      body: JSON.stringify({ action: "complete-tour" }),
    }),

  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return uploadRequest<{ ok: true }>("/avatar", form);
  },
  deleteAvatar: () => request<{ ok: true }>("/avatar", { method: "DELETE" }),
  avatarUrl: (userId: string) => `${BASE}/avatar?userId=${userId}`,

  getReferrals: () => request<ReferralInfo>("/referrals"),
};
