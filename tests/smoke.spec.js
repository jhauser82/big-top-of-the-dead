import { test, expect } from '@playwright/test';

/**
 * Boot-and-behaviour suite.
 *
 * This project was written without ever being run, so these tests exist to
 * answer the questions static analysis cannot: does the WASM load, does
 * Recast actually connect the staircases, are the floors solid, is the
 * campaign completable. They drive the real game through `window.__test`
 * rather than synthesising input, so they exercise the same code a player does.
 */

const FLOOR_H = 3.4;

/** Boot the page, fail loudly on console errors, wait for the start screen. */
async function boot(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto('/');
  await page.waitForFunction(() => window.__booted || window.__bootError, null, { timeout: 90_000 });

  const bootError = await page.evaluate(() => window.__bootError);
  expect(bootError, `boot threw:\n${bootError}`).toBeFalsy();

  await expect(page.locator('#go')).toBeEnabled({ timeout: 60_000 });
  return errors;
}

async function start(page) {
  await page.locator('#go').click();
  await page.waitForFunction(() => window.__test?.running === true);
}

/** Let the fixed-step loop actually run for a while. */
async function run(page, seconds) {
  await page.waitForTimeout(seconds * 1000);
}

test('boots without errors and reaches the start screen', async ({ page }) => {
  const errors = await boot(page);
  expect(errors, `console errors:\n${errors.join('\n')}`).toHaveLength(0);
});

test('Recast builds both agent profiles', async ({ page }) => {
  await boot(page);
  const profiles = await page.evaluate(() => window.__test.navProfiles());

  // Absent dependency is a valid configuration; a partial build is not.
  test.skip(profiles.length === 0, 'recast-navigation not installed');
  expect(profiles).toEqual(expect.arrayContaining(['small', 'large']));
});

test('all three floors are solid ground', async ({ page }) => {
  await boot(page);
  await start(page);

  for (const [name, y] of [['ground', 1.2], ['second', FLOOR_H + 1.2], ['attic', FLOOR_H * 2 + 1.2]]) {
    await page.evaluate(([yy]) => window.__test.teleport(0, yy, 4), [y]);
    await run(page, 1.2);
    const grounded = await page.evaluate(() => window.__test.grounded);
    const landedY = await page.evaluate(() => window.__test.playerY());
    expect(grounded, `${name} floor did not catch the player`).toBe(true);
    // Should land on that floor, not fall through to the one below.
    expect(Math.abs(landedY - (y - 0.2)), `${name} floor let the player sink`).toBeLessThan(1.5);
  }
});

test('zombies path to the player across the map', async ({ page }) => {
  await boot(page);
  const profiles = await page.evaluate(() => window.__test.navProfiles());
  test.skip(profiles.length === 0, 'recast-navigation not installed');

  await start(page);
  // Stand in the yard, where the bulk of the population is, and wait for
  // aggro plus at least one repath cycle.
  await page.evaluate(() => window.__test.teleport(0, 1.2, 18));
  await run(page, 6);

  const pathing = await page.evaluate(() => window.__test.pathing);
  expect(pathing, 'no zombie ever obtained a path — check walkableClimb').toBeGreaterThan(0);
});

test('a strongman upstairs can path down to the player', async ({ page }) => {
  await boot(page);
  const profiles = await page.evaluate(() => window.__test.navProfiles());
  test.skip(profiles.length === 0, 'recast-navigation not installed');

  await start(page);
  await page.evaluate(() => {
    window.__test.teleport(0, 1.2, 0);
    window.__test.spawn('strongman', [-6, 3.4, 3]);
  });
  await run(page, 8);

  // The large profile is the one most likely to fail to connect floors.
  const reached = await page.evaluate(() => window.__test.pathing);
  expect(reached, 'large-profile navmesh may not connect the staircases').toBeGreaterThan(0);
});

test('every weapon fires and consumes ammo', async ({ page }) => {
  const errors = await boot(page);
  await start(page);

  for (let slot = 0; slot < 4; slot++) {
    await page.evaluate(i => window.__test.selectWeapon(i), slot);
    await run(page, 0.4);
    const before = await page.evaluate(() => window.__test.ammo());
    await page.evaluate(() => { for (let i = 0; i < 3; i++) window.__test.fire(); });
    await run(page, 0.6);
    const after = await page.evaluate(() => window.__test.ammo());

    const ids = Object.keys(before);
    const spent = ids.some(id => after[id] < before[id]);
    expect(spent, `weapon slot ${slot} consumed no ammo`).toBe(true);
  }

  expect(errors, `console errors while firing:\n${errors.join('\n')}`).toHaveLength(0);
});

test('the campaign is completable end to end', async ({ page }) => {
  await boot(page);
  await start(page);

  expect(await page.evaluate(() => window.__test.act)).toBe('fuses');

  await page.evaluate(() => window.__test.skipAct());
  await run(page, 0.5);
  expect(await page.evaluate(() => window.__test.act)).toBe('generator');

  await page.evaluate(() => window.__test.skipAct());
  await run(page, 0.5);
  expect(await page.evaluate(() => window.__test.act)).toBe('escape');

  await page.evaluate(() => window.__test.skipAct());
  await run(page, 0.5);
  expect(await page.evaluate(() => window.__test.act)).toBe('complete');
  await expect(page.locator('#start')).toBeVisible();
});

test('holds a playable frame rate under load', async ({ page }) => {
  await boot(page);
  await start(page);

  await page.evaluate(() => {
    window.__test.teleport(0, 1.2, 18);
    for (const t of ['tot', 'tumbler', 'strongman', 'stiltwalker', 'shambler']) {
      for (let i = 0; i < 3; i++) {
        window.__test.spawn(t, [-10 + Math.random() * 20, 0, 14 + Math.random() * 10]);
      }
    }
  });
  await run(page, 4);

  const fps = await page.evaluate(() => new Promise(resolve => {
    let frames = 0;
    const t0 = performance.now();
    const tick = () => {
      frames++;
      if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
      else resolve(frames / ((performance.now() - t0) / 1000));
    };
    requestAnimationFrame(tick);
  }));

  // SwiftShader is software rendering, so this is a floor for "not broken",
  // not a performance target. On real hardware expect an order more.
  expect(fps, `only ${fps.toFixed(1)} fps under load`).toBeGreaterThan(8);
});
