import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { hasProjectAccess, isProjectOwner } from "../../lib/ownership.ts";
import projectHandler from "../project.mts";
import { db } from "../../lib/db.ts";

describe("project access control", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("hasProjectAccess / isProjectOwner (lib level)", () => {
    it("grants the owner access", async () => {
      const owner = await createTestUser("owner@example.com");
      const project = await createTestProject(owner.id);
      expect(await hasProjectAccess(owner.id, project.id)).toBe(true);
      expect(await isProjectOwner(owner.id, project.id)).toBe(true);
    });

    it("denies a stranger with no relationship to the project", async () => {
      const owner = await createTestUser("owner2@example.com");
      const stranger = await createTestUser("stranger@example.com");
      const project = await createTestProject(owner.id);
      expect(await hasProjectAccess(stranger.id, project.id)).toBe(false);
      expect(await isProjectOwner(stranger.id, project.id)).toBe(false);
    });

    it("grants an active member access, but not owner-level rights", async () => {
      const owner = await createTestUser("owner3@example.com");
      const member = await createTestUser("member@example.com");
      const project = await createTestProject(owner.id);
      const database = db();
      await database.sql`
        INSERT INTO project_members (project_id, user_id, invited_email, status, joined_at)
        VALUES (${project.id}, ${member.id}, ${member.email}, 'active', now())
      `;
      expect(await hasProjectAccess(member.id, project.id)).toBe(true);
      expect(await isProjectOwner(member.id, project.id)).toBe(false);
    });

    it("denies a member whose invite is still pending (not yet accepted)", async () => {
      const owner = await createTestUser("owner4@example.com");
      const invitee = await createTestUser("invitee@example.com");
      const project = await createTestProject(owner.id);
      const database = db();
      await database.sql`
        INSERT INTO project_members (project_id, user_id, invited_email, status)
        VALUES (${project.id}, ${invitee.id}, ${invitee.email}, 'invited')
      `;
      expect(await hasProjectAccess(invitee.id, project.id)).toBe(false);
    });
  });

  describe("GET /api/project (handler level)", () => {
    it("returns the project to its owner", async () => {
      const owner = await createTestUser("get-owner@example.com");
      const project = await createTestProject(owner.id);
      const res = await projectHandler(
        asUser(owner, { method: "GET", url: `https://tasketra.com/api/project?id=${project.id}` })
      );
      expect(res.status).toBe(200);
      const body = await jsonBody<{ project: { id: string; is_owner: boolean } }>(res);
      expect(body.project.id).toBe(project.id);
      expect(body.project.is_owner).toBe(true);
    });

    it("returns 404 (not 403) to a user with no access -- doesn't confirm the project exists", async () => {
      const owner = await createTestUser("get-owner2@example.com");
      const stranger = await createTestUser("get-stranger@example.com");
      const project = await createTestProject(owner.id);
      const res = await projectHandler(
        asUser(stranger, { method: "GET", url: `https://tasketra.com/api/project?id=${project.id}` })
      );
      expect(res.status).toBe(404);
    });

    it("returns 401 with no session at all", async () => {
      const owner = await createTestUser("get-owner3@example.com");
      const project = await createTestProject(owner.id);
      const res = await projectHandler(
        new Request(`https://tasketra.com/api/project?id=${project.id}`)
      );
      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /api/project (owner-only action)", () => {
    it("lets the owner soft-delete their project", async () => {
      const owner = await createTestUser("del-owner@example.com");
      const project = await createTestProject(owner.id);
      const res = await projectHandler(
        asUser(owner, { method: "DELETE", url: `https://tasketra.com/api/project?id=${project.id}` })
      );
      expect(res.status).toBe(200);
      const database = db();
      const [row] = await database.sql`SELECT archived, deleted_at FROM projects WHERE id = ${project.id}`;
      expect(row.archived).toBe(true);
      expect(row.deleted_at).not.toBeNull();
    });

    it("blocks a non-owner member from deleting the project", async () => {
      const owner = await createTestUser("del-owner2@example.com");
      const member = await createTestUser("del-member@example.com");
      const project = await createTestProject(owner.id);
      const database = db();
      await database.sql`
        INSERT INTO project_members (project_id, user_id, invited_email, status, joined_at)
        VALUES (${project.id}, ${member.id}, ${member.email}, 'active', now())
      `;
      const res = await projectHandler(
        asUser(member, { method: "DELETE", url: `https://tasketra.com/api/project?id=${project.id}` })
      );
      expect(res.status).toBe(404); // member can read/write project entities, but can't delete the project itself

      const [row] = await database.sql`SELECT archived FROM projects WHERE id = ${project.id}`;
      expect(row.archived).toBe(false); // untouched
    });

    it("blocks a stranger outright", async () => {
      const owner = await createTestUser("del-owner3@example.com");
      const stranger = await createTestUser("del-stranger@example.com");
      const project = await createTestProject(owner.id);
      const res = await projectHandler(
        asUser(stranger, { method: "DELETE", url: `https://tasketra.com/api/project?id=${project.id}` })
      );
      expect(res.status).toBe(404);
      const database = db();
      const [row] = await database.sql`SELECT archived FROM projects WHERE id = ${project.id}`;
      expect(row.archived).toBe(false);
    });
  });

  describe("PATCH /api/project (owner-only action)", () => {
    it("blocks a non-owner from renaming the project", async () => {
      const owner = await createTestUser("patch-owner@example.com");
      const stranger = await createTestUser("patch-stranger@example.com");
      const project = await createTestProject(owner.id, "Original Name");
      const res = await projectHandler(
        asUser(stranger, {
          method: "PATCH",
          url: "https://tasketra.com/api/project",
          body: { id: project.id, name: "Hijacked Name" },
        })
      );
      expect(res.status).toBe(404);
      const database = db();
      const [row] = await database.sql`SELECT name FROM projects WHERE id = ${project.id}`;
      expect(row.name).toBe("Original Name");
    });
  });
});
