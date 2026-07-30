import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sql = require('../../Backend/config/db');
const bcrypt = require('../../Backend/node_modules/bcryptjs');
const jwt = require('../../Backend/node_modules/jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function makeToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, class_id: user.class_id || null },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log("=== STARTING PHASE 11 UNMOUNT SAFETY VERIFICATION ===");

  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

  const pwHash = await bcrypt.hash('password123', 10);
  let [testClass] = await sql`SELECT id FROM classes WHERE name = '__RECORDING_TEST__' LIMIT 1`;
  if (!testClass) {
    [testClass] = await sql`INSERT INTO classes (name) VALUES ('__RECORDING_TEST__') RETURNING id`;
  }
  const [teacher] = await sql`
    INSERT INTO users (name, email, password_hash, role)
    VALUES ('Recording Test Teacher', 'rec_teacher@test.com', ${pwHash}, 'teacher')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, email, role, class_id, name
  `;

  const teacherBrowser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--auto-select-desktop-capture-source=Entire screen'
    ]
  });

  const teacherPage = await teacherBrowser.newPage();

  const capturedErrors = [];
  teacherPage.on('console', (msg) => {
    const txt = msg.text();
    if (txt.includes('[DEBUG][RECORDING') || txt.includes('[TEST-HOOK]')) {
      const time = new Date().toISOString().substring(11, 19);
      console.log(`[${time}] ${txt}`);
    }
  });

  teacherPage.on('pageerror', (err) => {
    console.error(`[PAGE ERROR] ${err.toString()}`);
    capturedErrors.push(err.toString());
  });

  // Login teacher
  console.log("\n--- Logging in Teacher ---");
  await teacherPage.goto('http://localhost:5173/login');
  await teacherPage.waitForSelector('#email');
  await teacherPage.type('#email', 'rec_teacher@test.com');
  await teacherPage.type('#password', 'password123');
  await teacherPage.click('form button[type="submit"]');
  await teacherPage.waitForNavigation();
  console.log("Teacher logged in.");

  const ensureBroadcastRunning = async () => {
    await teacherPage.goto('http://localhost:5173/teacher/broadcast');
    await delay(2000);

    const isLive = await teacherPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(b => b.textContent.includes('Stop Broadcast'));
    });

    if (!isLive) {
      console.log("Starting a new broadcast session...");
      await teacherPage.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const start = buttons.find(b => b.textContent.includes('Start Broadcast'));
        if (start) start.click();
      });
      await delay(1000);

      await teacherPage.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        
        const lecInput = inputs.find(i => i.placeholder && i.placeholder.includes('Binary Search Trees'));
        const subInput = inputs.find(i => i.placeholder && i.placeholder.includes('Data Structures'));
        const pwdInput = inputs.find(i => i.placeholder && i.placeholder.includes('Students will need this'));
        const roomInput = inputs.find(i => i.placeholder && i.placeholder.includes('LAB 301'));
        
        if (lecInput) { setter.call(lecInput, 'Recording Lecture'); lecInput.dispatchEvent(new Event('input', { bubbles: true })); }
        if (subInput) { setter.call(subInput, 'WebRTC Testing'); subInput.dispatchEvent(new Event('input', { bubbles: true })); }
        if (pwdInput) { setter.call(pwdInput, '123'); pwdInput.dispatchEvent(new Event('input', { bubbles: true })); }
        if (roomInput) { setter.call(roomInput, 'LAB 301'); roomInput.dispatchEvent(new Event('input', { bubbles: true })); }

        const buttons = Array.from(document.querySelectorAll('div[role="dialog"] button'));
        const clsBtn = buttons.find(b => b.textContent.includes('__RECORDING_TEST__')) || buttons[0];
        if (clsBtn) clsBtn.click();
      });
      await delay(1000);

      await teacherPage.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const submit = buttons.find(b => b.textContent.includes('Start Broadcasting'));
        if (submit && !submit.disabled) submit.click();
      });
      await delay(3000);
    }
  };

  await ensureBroadcastRunning();

  // SCENARIO 1: FSA Path — Unmount while recording
  console.log("\n==========================================");
  console.log("SCENARIO 1: FSA Path — Unmount While Active Recording");
  console.log("==========================================");

  // Setup mock showSaveFilePicker in browser page
  await teacherPage.evaluate(() => {
    window.__fsaWrittenChunks = [];
    window.showSaveFilePicker = async (options) => {
      return {
        name: options?.suggestedName || "unmount-test-fsa.webm",
        createWritable: async () => {
          return {
            write: async (chunk) => {
              window.__fsaWrittenChunks.push(chunk);
            },
            close: async () => {
              console.log(`[DEBUG][RECORDING-FSA] file closed and saved successfully`);
            }
          };
        }
      };
    };
  });

  // Start Screen Share
  await teacherPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const share = buttons.find(b => b.textContent.includes('Start Screen Share'));
    if (share) share.click();
  });
  await delay(2000);

  // Start Recording
  console.log("Starting Recording on FSA path...");
  await teacherPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const rec = buttons.find(b => b.textContent.trim() === 'Record');
    if (rec) rec.click();
  });
  await delay(3500);

  // SPA Navigation to trigger React component unmount without reloading page
  console.log("Triggering SPA React Router navigation away from broadcast page (Unmounting LiveBroadcast)...");
  await teacherPage.evaluate(() => {
    const dashboardLink = Array.from(document.querySelectorAll('a')).find(a => a.href && a.href.includes('dashboard'));
    if (dashboardLink) {
      dashboardLink.click();
    } else {
      window.history.pushState({}, '', '/teacher/dashboard');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  });
  await delay(2500);


  // SCENARIO 2: Fallback Blob Path — Unmount while recording
  console.log("\n==========================================");
  console.log("SCENARIO 2: Fallback Blob Path — Unmount While Active Recording");
  console.log("==========================================");

  await ensureBroadcastRunning();

  // Disable FSA to test fallback path
  await teacherPage.evaluate(() => {
    delete window.showSaveFilePicker;
  });

  // Start Screen Share
  await teacherPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const share = buttons.find(b => b.textContent.includes('Start Screen Share'));
    if (share) share.click();
  });
  await delay(2000);

  // Start Recording
  console.log("Starting Recording on Fallback Blob path...");
  await teacherPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const rec = buttons.find(b => b.textContent.trim() === 'Record');
    if (rec) rec.click();
  });
  await delay(3500);

  // SPA Navigation to trigger React component unmount without reloading page
  console.log("Triggering SPA React Router navigation away from broadcast page (Fallback path)...");
  await teacherPage.evaluate(() => {
    const dashboardLink = Array.from(document.querySelectorAll('a')).find(a => a.href && a.href.includes('dashboard'));
    if (dashboardLink) {
      dashboardLink.click();
    } else {
      window.history.pushState({}, '', '/teacher/dashboard');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  });
  await delay(2500);

  console.log(`\nCaptured page errors after both unmount tests: ${capturedErrors.length}`);

  await teacherBrowser.close();
  await sql.end();
  console.log("\n=== UNMOUNT VERIFICATION COMPLETE ===");
}

main().catch((err) => {
  console.error("Verification script error:", err);
  process.exit(1);
});
