import path from "node:path";
import { expect, test } from "@playwright/test";

test("curator imports, matches, approves, and exports a fixture segment", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByTestId("email").fill("curator@example.com");
  await page.getByTestId("password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.goto("/playlists/import");
  await page.getByTestId("import-fixture").click();
  await expect(page.getByRole("heading", { name: /Development fixture/ })).toBeVisible();
  await page.getByTestId("video-link-MOCKLEAD001").click();
  await expect(page.getByRole("heading", { name: /Loose-lead walking demonstration/ })).toBeVisible();
  await expect(page.getByText("Chapters available")).toBeVisible();

  await page.getByTestId("transcript-file").setInputFiles(path.join(process.cwd(), "fixtures/loose-lead.vtt"));
  await page.getByRole("button", { name: "Save transcript" }).click();
  await expect(page.getByText(/Stored \d+ transcript cues/)).toBeVisible();
  await expect(page.getByText("Transcript available")).toBeVisible();

  await page.getByTestId("suggest-matches").click();
  const card = page.getByTestId("suggestion-ex-lead-loose");
  await expect(card).toBeVisible();
  await card.getByTestId("end-seconds").fill("88");
  await card.getByTestId("approve-suggestion").click();
  await expect(page.getByText("Segment approved")).toBeVisible();

  await page.goto("/export");
  const raw = await page.getByTestId("export-json").innerText();
  const document = JSON.parse(raw) as {
    schemaVersion: number;
    segments: Array<{ videoId: string; lessonId: string; startSeconds: number; endSeconds: number }>;
  };
  expect(document.schemaVersion).toBe(1);
  expect(document.segments).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        videoId: "MOCKLEAD001",
        lessonId: "ex-lead-loose",
        endSeconds: 88,
      }),
    ]),
  );
});

test("the export route and the desk require a curator", async ({ page, request }) => {
  const response = await request.get("/api/export");
  expect(response.status()).toBe(401);
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByTestId("email").fill("curator@example.com");
  await page.getByTestId("password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("do not match");
});
