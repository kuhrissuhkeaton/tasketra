// Seeds a brand-new project with a small, realistic set of sample data so a
// first-time user has something to explore -- tasks in every status, a
// roadmap, one item in each RAID category, and a stakeholder -- instead of
// facing five empty tabs. Purely additive: only called when the creator
// opted in via the "Start with example data" toggle on the New project
// form (Dashboard.tsx), never on its own.
//
// Every date is relative to "now" so it still reads sensibly whenever the
// project is actually created, rather than baking in fixed calendar dates.
// Deliberately includes one blocked task and one high-severity issue/risk
// so the new Home tab (v53) has something to triage on day one, and touches
// every RAID category so the v52 Board views aren't empty either.

import { logActivity } from "./activity.ts";

function daysFromNow(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export async function seedExampleData(database: any, projectId: string, userId: string) {
  const [stakeholder] = await database.sql`
    INSERT INTO stakeholders (project_id, name, role)
    VALUES (${projectId}, 'Alex Rivera', 'Marketing Director')
    RETURNING id, name
  `;
  await logActivity(database, { projectId, entityType: "stakeholder", entityId: stakeholder.id, entityTitle: stakeholder.name, action: "created" });

  const [kickoff] = await database.sql`
    INSERT INTO tasks (project_id, title, owner_name, due_date, status)
    VALUES (${projectId}, 'Kickoff meeting with stakeholders', ${stakeholder.name}, ${daysFromNow(-9)}, 'done')
    RETURNING id, title
  `;
  await logActivity(database, { projectId, entityType: "task", entityId: kickoff.id, entityTitle: kickoff.title, action: "created" });

  const [charter] = await database.sql`
    INSERT INTO tasks (project_id, title, due_date, status)
    VALUES (${projectId}, 'Draft project charter', ${daysFromNow(-7)}, 'done')
    RETURNING id, title
  `;
  await logActivity(database, { projectId, entityType: "task", entityId: charter.id, entityTitle: charter.title, action: "created" });

  const [requirements] = await database.sql`
    INSERT INTO tasks (project_id, title, due_date, status)
    VALUES (${projectId}, 'Gather requirements from stakeholders', ${daysFromNow(2)}, 'in_progress')
    RETURNING id, title
  `;
  await logActivity(database, { projectId, entityType: "task", entityId: requirements.id, entityTitle: requirements.title, action: "created" });

  const [sub1] = await database.sql`
    INSERT INTO tasks (project_id, title, owner_name, status, parent_task_id)
    VALUES (${projectId}, 'Interview the marketing team', ${stakeholder.name}, 'done', ${requirements.id})
    RETURNING id, title
  `;
  await logActivity(database, { projectId, entityType: "task", entityId: sub1.id, entityTitle: sub1.title, action: "created" });

  const [sub2] = await database.sql`
    INSERT INTO tasks (project_id, title, status, parent_task_id)
    VALUES (${projectId}, 'Interview the sales team', 'not_started', ${requirements.id})
    RETURNING id, title
  `;
  await logActivity(database, { projectId, entityType: "task", entityId: sub2.id, entityTitle: sub2.title, action: "created" });

  const [wireframes] = await database.sql`
    INSERT INTO tasks (project_id, title, due_date, status)
    VALUES (${projectId}, 'Build wireframes', ${daysFromNow(7)}, 'not_started')
    RETURNING id, title
  `;
  await logActivity(database, { projectId, entityType: "task", entityId: wireframes.id, entityTitle: wireframes.title, action: "created" });

  const qaTitle = "QA pass before launch";
  const [qa] = await database.sql`
    INSERT INTO tasks (project_id, title, due_date, status)
    VALUES (${projectId}, ${qaTitle}, ${daysFromNow(-1)}, 'blocked')
    RETURNING id, title
  `;
  await logActivity(database, { projectId, entityType: "task", entityId: qa.id, entityTitle: qa.title, action: "created" });

  const [phase] = await database.sql`
    INSERT INTO roadmap_items (project_id, type, title, swimlane, start_date, end_date, status, created_by)
    VALUES (${projectId}, 'phase', 'Discovery', 'General', ${daysFromNow(-10)}, ${daysFromNow(5)}, 'in_progress', ${userId})
    RETURNING id, title
  `;
  await logActivity(database, { projectId, entityType: "roadmap_item", entityId: phase.id, entityTitle: phase.title, action: "created" });

  const [milestone] = await database.sql`
    INSERT INTO roadmap_items (project_id, type, title, swimlane, start_date, status, created_by)
    VALUES (${projectId}, 'milestone', 'Design sign-off', 'General', ${daysFromNow(14)}, 'not_started', ${userId})
    RETURNING id, title
  `;
  await logActivity(database, { projectId, entityType: "roadmap_item", entityId: milestone.id, entityTitle: milestone.title, action: "created" });

  const [release] = await database.sql`
    INSERT INTO roadmap_items (project_id, type, title, swimlane, start_date, status, created_by)
    VALUES (${projectId}, 'release', 'Launch', 'General', ${daysFromNow(30)}, 'not_started', ${userId})
    RETURNING id, title
  `;
  await logActivity(database, { projectId, entityType: "roadmap_item", entityId: release.id, entityTitle: release.title, action: "created" });

  const issueTitle = "Hosting vendor hasn't confirmed the migration window";
  const issueDescription = "Need written confirmation before the launch date can be locked in.";
  const [issue] = await database.sql`
    INSERT INTO issues (project_id, title, description, severity, status)
    VALUES (${projectId}, ${issueTitle}, ${issueDescription}, 'high', 'open')
    RETURNING id, title
  `;
  await logActivity(database, { projectId, entityType: "issue", entityId: issue.id, entityTitle: issue.title, action: "created" });

  const riskTitle = "Content team may miss the copy deadline";
  const riskDescription = "Final copy is still in review; nothing's confirmed late yet, but it's close.";
  const riskMitigation = "Daily check-in with the content team until copy is approved.";
  const [risk] = await database.sql`
    INSERT INTO risks (project_id, title, description, probability, impact, mitigation, status)
    VALUES (${projectId}, ${riskTitle}, ${riskDescription}, 'high', 'medium', ${riskMitigation}, 'open')
    RETURNING id, title
  `;
  await logActivity(database, { projectId, entityType: "risk", entityId: risk.id, entityTitle: risk.title, action: "created" });

  const assumptionStatement = "Legal review will take no more than 3 business days";
  const [assumption] = await database.sql`
    INSERT INTO assumptions (project_id, statement, status)
    VALUES (${projectId}, ${assumptionStatement}, 'unconfirmed')
    RETURNING id, statement
  `;
  await logActivity(database, { projectId, entityType: "assumption", entityId: assumption.id, entityTitle: assumption.statement, action: "created" });

  const dependencyTitle = "Waiting on brand guidelines from the design agency";
  const [dependency] = await database.sql`
    INSERT INTO dependencies (project_id, title, direction, needed_by, status)
    VALUES (${projectId}, ${dependencyTitle}, 'external', ${daysFromNow(5)}, 'blocked')
    RETURNING id, title
  `;
  await logActivity(database, { projectId, entityType: "dependency", entityId: dependency.id, entityTitle: dependency.title, action: "created" });
}
