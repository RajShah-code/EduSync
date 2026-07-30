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
  console.log("=== STARTING PHASE 11 PART A EXTENSION (FSA API) VERIFICATION ===");

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

  teacherPage.on('console', (msg) => {
    const txt = msg.text();
    if (txt.includes('[DEBUG][RECORDING')) {
      const time = new Date().toISOString().substring(11, 19);
      console.log(`[${time}] ${txt}`);
    }
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

  // VERIFICATION 1: File System Access Path (Automated file handle writing to memory/disk stream)
  console.log("\n==========================================");
  console.log("VERIFICATION 1: File System Access API Direct Write Path");
  console.log("==========================================");

  // Setup mock showSaveFilePicker in browser page to capture written chunks into window.__fsaWrittenBytes
  await teacherPage.evaluate(() => {
    window.__fsaWrittenChunks = [];
    window.showSaveFilePicker = async (options) => {
      console.log(`[TEST-HOOK] showSaveFilePicker called with suggestedName=${options?.suggestedName}`);
      return {
        name: options?.suggestedName || "test-recording.webm",
        createWritable: async () => {
          return {
            write: async (chunk) => {
              window.__fsaWrittenChunks.push(chunk);
            },
            close: async () => {
              console.log(`[TEST-HOOK] fileWritable.close() called. Total chunks written=${window.__fsaWrittenChunks.length}`);
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

  // Start Recording via FSA path
  console.log("Clicking Record button (FSA path active)...");
  await teacherPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const rec = buttons.find(b => b.textContent.trim() === 'Record');
    if (rec) rec.click();
  });
  await delay(3500);

  // Stop Recording
  console.log("Clicking Stop Recording button...");
  await teacherPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const stopRec = buttons.find(b => b.textContent.trim() === 'Stop Recording');
    if (stopRec) stopRec.click();
  });
  await delay(2000);

  const fsaWrittenInfo = await teacherPage.evaluate(() => {
    const chunks = window.__fsaWrittenChunks || [];
    const totalBytes = chunks.reduce((acc, c) => acc + c.size, 0);
    return {
      totalChunks: chunks.length,
      totalBytes: totalBytes
    };
  });
  console.log(`FSA Write Path Result: ${fsaWrittenInfo.totalChunks} chunks written directly to FSA stream, totalBytes=${fsaWrittenInfo.totalBytes}`);


  // VERIFICATION 2: Pause / Resume on FSA Path
  console.log("\n==========================================");
  console.log("VERIFICATION 2: Pause / Resume Cycle on FSA Path");
  console.log("==========================================");

  // Reset FSA chunks tracker
  await teacherPage.evaluate(() => { window.__fsaWrittenChunks = []; });

  // Start Recording
  console.log("2a. Starting Recording (FSA path)...");
  await teacherPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const rec = buttons.find(b => b.textContent.trim() === 'Record');
    if (rec) rec.click();
  });
  await delay(2500);

  // Pause via in-app Stop Screen Share
  console.log("2b. Clicking 'Stop Screen Share' (In-App Pause)...");
  await teacherPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const stopShare = buttons.find(b => b.textContent.includes('Stop Screen Share'));
    if (stopShare) stopShare.click();
  });
  console.log("Monitoring 3.5 seconds during pause interval...");
  await delay(3500);

  // Resume via in-app Start Screen Share
  console.log("2c. Clicking 'Start Screen Share' (In-App Resume)...");
  await teacherPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const share = buttons.find(b => b.textContent.includes('Start Screen Share'));
    if (share) share.click();
  });
  await delay(2500);

  // Stop Recording
  console.log("2d. Stopping Recording...");
  await teacherPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const stopRec = buttons.find(b => b.textContent.trim() === 'Stop Recording');
    if (stopRec) stopRec.click();
  });
  await delay(2000);


  // VERIFICATION 3: Cancel Save As Picker (AbortError)
  console.log("\n==========================================");
  console.log("VERIFICATION 3: Cancel Save As Picker (AbortError)");
  console.log("==========================================");

  // Override showSaveFilePicker to simulate user cancelling picker (AbortError)
  await teacherPage.evaluate(() => {
    window.showSaveFilePicker = async () => {
      const err = new DOMException("The user aborted a request.", "AbortError");
      throw err;
    };
  });

  // Stop screen share first if sharing
  await teacherPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const stopShare = buttons.find(b => b.textContent.includes('Stop Screen Share'));
    if (stopShare) stopShare.click();
  });
  await delay(1000);

  console.log("Clicking Record button with cancelling picker...");
  await teacherPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const rec = buttons.find(b => b.textContent.trim() === 'Record');
    if (rec) rec.click();
  });
  await delay(1500);

  const abortResult = await teacherPage.evaluate(() => {
    const recBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Record'));
    const errBanner = document.querySelector('div.bg-accent-critical\\/10');
    return {
      buttonText: recBtn ? recBtn.textContent.trim() : null,
      errorBannerVisible: !!errBanner
    };
  });
  console.log(`AbortError Result: Button State="${abortResult.buttonText}", Error Banner Shown=${abortResult.errorBannerVisible}`);


  // VERIFICATION 4: Fallback for Browsers Without File System Access Support
  console.log("\n==========================================");
  console.log("VERIFICATION 4: Fallback for Unsupported Browsers (No FSA API)");
  console.log("==========================================");

  // Delete window.showSaveFilePicker to simulate Firefox / unsupported browser
  await teacherPage.evaluate(() => {
    delete window.showSaveFilePicker;
  });

  console.log("Clicking Record button on unsupported browser...");
  await teacherPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const rec = buttons.find(b => b.textContent.trim() === 'Record');
    if (rec) rec.click();
  });
  await delay(3000);

  // Check UI fallback note while recording
  const noteVisibleWhileRecording = await teacherPage.evaluate(() => {
    const p = Array.from(document.querySelectorAll('p')).find(el => el.textContent.includes("doesn't support direct-to-folder saving"));
    return !!p;
  });
  console.log(`Fallback UI Note Visible While Recording? ${noteVisibleWhileRecording}`);

  // Stop recording
  console.log("Stopping Recording...");
  await teacherPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const stopRec = buttons.find(b => b.textContent.trim() === 'Stop Recording');
    if (stopRec) stopRec.click();
  });
  await delay(2000);

  const fallbackResult = await teacherPage.evaluate(() => {
    const downloadLink = document.querySelector('a[download="session-recording.webm"]');
    const note = Array.from(document.querySelectorAll('p')).find(el => el.textContent.includes("doesn't support direct-to-folder saving"));
    return {
      downloadLinkPresent: !!downloadLink && downloadLink.href.startsWith('blob:'),
      fallbackNotePresent: !!note
    };
  });
  console.log(`Fallback Result: Download Link Present=${fallbackResult.downloadLinkPresent}, Fallback UI Note Present=${fallbackResult.fallbackNotePresent}`);

  await teacherBrowser.close();
  await sql.end();
  console.log("\n=== ALL EXTENSION VERIFICATIONS FINISHED ===");
}

main().catch((err) => {
  console.error("Verification script error:", err);
  process.exit(1);
});
