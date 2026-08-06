import type { Config } from "@netlify/functions";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
} from "docx";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";

// Downloadable PM templates generated from a project's live data: Project
// Charter, Risk Register, and a RACI matrix starter. Same idea as the Weekly
// Report -- a real document, not a blank form -- just packaged as .docx
// instead of printed HTML.

const PAGE = { width: 12240, height: 15840, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } };
const CONTENT_WIDTH = 9360;
const NAVY = "1B3A4B";
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

const styles = {
  default: { document: { run: { font: "Arial", size: 22 } } },
  paragraphStyles: [
    { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { size: 30, bold: true, font: "Arial", color: NAVY },
      paragraph: { spacing: { before: 0, after: 180 }, outlineLevel: 0 } },
    { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { size: 24, bold: true, font: "Arial", color: NAVY },
      paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 1 } },
  ],
};

function h1(text: string) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}
function h2(text: string) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}
function p(text: string) {
  return new Paragraph({ children: [new TextRun(text)], spacing: { after: 120 } });
}
function labelValue(label: string, value: string) {
  return new Paragraph({
    children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value)],
    spacing: { after: 100 },
  });
}

function table(headers: string[], rows: string[][], widths: number[]) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((hText, i) => new TableCell({
      borders,
      width: { size: widths[i], type: WidthType.DXA },
      shading: { fill: NAVY, type: ShadingType.CLEAR },
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text: hText, bold: true, color: "FFFFFF", size: 18 })] })],
    })),
  });
  const bodyRows = rows.map((r) => new TableRow({
    children: r.map((cell, i) => new TableCell({
      borders,
      width: { size: widths[i], type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text: cell || "--", size: 18 })] })],
    })),
  }));
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: [headerRow, ...bodyRows],
  });
}

function exposureLabel(probability: string, impact: string): string {
  if (probability === "high" && impact === "high") return "High";
  if (probability === "high" || impact === "high") return "Medium-High";
  if (probability === "low" && impact === "low") return "Low";
  return "Medium";
}
function cap(s: string | null | undefined): string {
  if (!s) return "--";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function safeFilename(name: string): string {
  return (name || "project").replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-") || "project";
}

async function buildCharter(database: any, project: any, projectId: string) {
  const [stakeholders, tasks, risks] = await Promise.all([
    database.sql`SELECT name, role, email FROM stakeholders WHERE project_id = ${projectId} AND deleted_at IS NULL ORDER BY created_at ASC`,
    database.sql`SELECT title, owner_name, due_date FROM tasks WHERE project_id = ${projectId} AND due_date IS NOT NULL AND deleted_at IS NULL ORDER BY due_date ASC LIMIT 12`,
    database.sql`
      SELECT title, probability, impact, mitigation FROM risks
      WHERE project_id = ${projectId} AND status != 'resolved' AND deleted_at IS NULL
      ORDER BY CASE WHEN probability = 'high' AND impact = 'high' THEN 0
                    WHEN probability = 'high' OR impact = 'high' THEN 1 ELSE 2 END
      LIMIT 8
    `,
  ]);

  const children: (Paragraph | Table)[] = [
    h1(`${project.name} -- Project Charter`),
    p(`Generated ${new Date().toLocaleDateString()} by Tasketra`),
    h2("Purpose"),
    p(project.description || "No description provided yet."),
    h2("Budget"),
    p(project.budget_at_completion !== null && project.budget_at_completion !== undefined
      ? `Approved budget (BAC): ${Number(project.budget_at_completion).toLocaleString(undefined, { style: "currency", currency: "USD" })}`
      : "No budget baseline set yet -- add one in the Budget tab."),
    h2("Stakeholders"),
  ];

  children.push(
    stakeholders.length
      ? table(["Name", "Role", "Email"], stakeholders.map((s: any) => [s.name, s.role || "--", s.email || "--"]), [3120, 3120, 3120])
      : p("No stakeholders added yet.")
  );

  children.push(h2("Key Milestones"));
  children.push(
    tasks.length
      ? table(["Task", "Owner", "Due date"], tasks.map((t: any) => [t.title, t.owner_name || "--", t.due_date || "--"]), [4160, 2600, 2600])
      : p("No dated tasks yet.")
  );

  children.push(h2("Top Risks"));
  children.push(
    risks.length
      ? table(["Risk", "Exposure", "Mitigation"], risks.map((r: any) => [r.title, exposureLabel(r.probability, r.impact), r.mitigation || "--"]), [3120, 2080, 4160])
      : p("No risks logged yet.")
  );

  children.push(h2("Approval"));
  children.push(p("Prepared by: ______________________     Date: ____________"));
  children.push(p("Approved by: ______________________     Date: ____________"));

  return new Document({ styles, sections: [{ properties: { page: PAGE }, children }] });
}

async function buildRiskRegister(database: any, project: any, projectId: string) {
  const risks = await database.sql`
    SELECT title, description, probability, impact, mitigation, owner_name, status
    FROM risks WHERE project_id = ${projectId} AND deleted_at IS NULL
    ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'monitoring' THEN 1 ELSE 2 END,
      CASE WHEN probability = 'high' AND impact = 'high' THEN 0
           WHEN probability = 'high' OR impact = 'high' THEN 1 ELSE 2 END
  `;

  const children: any[] = [
    h1(`${project.name} -- Risk Register`),
    p(`Generated ${new Date().toLocaleDateString()} by Tasketra`),
  ];

  if (risks.length === 0) {
    children.push(p("No risks logged yet. Add risks in the Risks tab, then re-download this register."));
  } else {
    children.push(table(
      ["Risk", "Probability", "Impact", "Exposure", "Mitigation", "Owner", "Status"],
      risks.map((r: any) => [
        r.title, cap(r.probability), cap(r.impact), exposureLabel(r.probability, r.impact),
        r.mitigation || "--", r.owner_name || "--", cap(r.status).replace("_", " "),
      ]),
      [1400, 1000, 1000, 1200, 2160, 1200, 1400]
    ));
  }

  return new Document({ styles, sections: [{ properties: { page: PAGE }, children }] });
}

async function buildRaci(database: any, project: any, projectId: string) {
  const [stakeholders, tasks] = await Promise.all([
    database.sql`SELECT name FROM stakeholders WHERE project_id = ${projectId} AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 6`,
    database.sql`SELECT title, owner_name FROM tasks WHERE project_id = ${projectId} AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 40`,
  ]);

  const children: any[] = [
    h1(`${project.name} -- RACI Matrix (starter)`),
    p("R = Responsible, A = Accountable, C = Consulted, I = Informed."),
    p("Cells are pre-filled with “R” where a task's owner matches a stakeholder name -- fill in the rest by hand."),
  ];

  if (stakeholders.length === 0) {
    children.push(p("No stakeholders added yet. Add stakeholders in the Stakeholders tab, then re-download this matrix for pre-filled columns."));
    children.push(
      tasks.length
        ? table(["Task", "Owner", "RACI role"], tasks.map((t: any) => [t.title, t.owner_name || "--", ""]), [4160, 2600, 2600])
        : p("No tasks yet.")
    );
  } else {
    const taskColWidth = 3200;
    const perStakeholder = Math.floor((CONTENT_WIDTH - taskColWidth) / stakeholders.length);
    const widths = [taskColWidth, ...stakeholders.map(() => perStakeholder)];
    const headers = ["Task", ...stakeholders.map((s: any) => s.name)];
    const rows = tasks.map((t: any) => [
      t.title,
      ...stakeholders.map((s: any) =>
        t.owner_name && s.name && t.owner_name.trim().toLowerCase() === s.name.trim().toLowerCase() ? "R" : ""
      ),
    ]);
    children.push(
      tasks.length ? table(headers, rows, widths) : p("No tasks yet -- add tasks to build the matrix rows.")
    );
  }

  return new Document({ styles, sections: [{ properties: { page: PAGE }, children }] });
}

export default async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  const database = db();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const type = url.searchParams.get("type");
  if (!projectId || !type) return json({ error: "projectId and type are required." }, { status: 400 });
  if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

  const [project] = await database.sql`SELECT name, description, budget_at_completion FROM projects WHERE id = ${projectId}`;
  if (!project) return json({ error: "Not found" }, { status: 404 });

  let doc: Document;
  let suffix: string;
  if (type === "charter") { doc = await buildCharter(database, project, projectId); suffix = "charter"; }
  else if (type === "risk-register") { doc = await buildRiskRegister(database, project, projectId); suffix = "risk-register"; }
  else if (type === "raci") { doc = await buildRaci(database, project, projectId); suffix = "raci-matrix"; }
  else return json({ error: "Unknown template type." }, { status: 400 });

  const buffer = await Packer.toBuffer(doc);
  return new Response(buffer, {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${safeFilename(project.name)}-${suffix}.docx"`,
    },
  });
};

export const config: Config = { path: "/api/templates" };
