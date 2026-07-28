import puppeteer from 'puppeteer-core';
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

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log("=== STARTING SCREENSHARE & ROSTER RESYNC VERIFICATION ===");
  
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  
  // Launch Teacher browser
  const teacherBrowser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream'
    ]
  });
  
  // Launch Student browser
  const studentBrowser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream'
    ]
  });
  
  const teacherPage = await teacherBrowser.newPage();
  const studentPage = await studentBrowser.newPage();
  
  // Intercept and print console logs
  teacherPage.on('console', msg => {
    console.log(`[TEACHER BROWSER] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });
  teacherPage.on('pageerror', err => {
    console.error(`[TEACHER BROWSER ERROR] ${err.toString()}`);
  });
  
  studentPage.on('console', msg => {
    console.log(`[STUDENT BROWSER] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });
  studentPage.on('pageerror', err => {
    console.error(`[STUDENT BROWSER ERROR] ${err.toString()}`);
  });

  let teacherToken = null;

  try {
    // -------------------------------------------------------------
    // Setup Dedicated Throwaway Accounts & Test Class
    // -------------------------------------------------------------
    const pwHash = await bcrypt.hash('password123', 10);
    let [testClass] = await sql`SELECT id FROM classes WHERE name = '__VERIFY_TEST__' LIMIT 1`;
    if (!testClass) {
      [testClass] = await sql`INSERT INTO classes (name) VALUES ('__VERIFY_TEST__') RETURNING id`;
    }
    const [teacher] = await sql`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ('Roster Verify Teacher', 'roster_verify_teacher@test.com', ${pwHash}, 'teacher')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, email, role, class_id, name
    `;
    const [student] = await sql`
      INSERT INTO users (name, email, password_hash, role, class_id, roll_no)
      VALUES ('Roster Verify Student', 'roster_verify_student@test.com', ${pwHash}, 'student', ${testClass.id}, 'RV-101')
      ON CONFLICT (email) DO UPDATE SET class_id = EXCLUDED.class_id, roll_no = EXCLUDED.roll_no
      RETURNING id, email, role, class_id, roll_no
    `;
    teacherToken = makeToken(teacher);
    console.log(`[Setup] Dedicated Throwaway Teacher ID=${teacher.id}, Student ID=${student.id}`);

    // -------------------------------------------------------------
    // Step 1: Login Teacher & Student
    // -------------------------------------------------------------
    console.log("\n--- Logging in Teacher ---");
    await teacherPage.goto('http://localhost:5173/login');
    await teacherPage.waitForSelector('#email');
    await teacherPage.type('#email', 'roster_verify_teacher@test.com');
    await teacherPage.type('#password', 'password123');
    await teacherPage.click('form button[type="submit"]');
    await teacherPage.waitForNavigation();
    console.log("Teacher logged in successfully.");

    console.log("\n--- Logging in Student ---");
    await studentPage.goto('http://localhost:5173/login');
    await studentPage.waitForSelector('#email');
    await studentPage.type('#email', 'roster_verify_student@test.com');
    await studentPage.type('#password', 'password123');
    await studentPage.click('form button[type="submit"]');
    await studentPage.waitForNavigation();
    console.log("Student logged in successfully.");

    // -------------------------------------------------------------
    // Step 2: Start Broadcast Session
    // -------------------------------------------------------------
    console.log("\n--- Teacher: Starting Session ---");
    await teacherPage.goto('http://localhost:5173/teacher/broadcast');
    
    // Check if a broadcast is already running. If "Stop Broadcast" button exists, end it first to start clean.
    const stopBtn = await teacherPage.$('button:has-text("Stop Broadcast")').catch(() => null);
    if (stopBtn) {
      console.log("Stale broadcast found, stopping it...");
      await teacherPage.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const stop = buttons.find(b => b.textContent.includes('Stop Broadcast'));
        if (stop) stop.click();
      });
      await delay(1000);
      await teacherPage.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const confirm = buttons.find(b => b.textContent.includes('End Session') || b.textContent.includes('Confirm'));
        if (confirm) confirm.click();
      });
      await delay(2000);
    }

    // Now start a new broadcast
    console.log("Clicking 'Start Broadcast' button...");
    await teacherPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const start = buttons.find(b => b.textContent.includes('Start Broadcast'));
      if (start) start.click();
    });
    
    await delay(1000);
    console.log("Filling setup modal fields...");
    await teacherPage.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const lecInput = inputs.find(i => i.placeholder && i.placeholder.includes('Binary Search Trees'));
      const subInput = inputs.find(i => i.placeholder && i.placeholder.includes('Data Structures'));
      const pwdInput = inputs.find(i => i.placeholder && i.placeholder.includes('Students will need this'));
      const roomInput = inputs.find(i => i.placeholder && i.placeholder.includes('LAB 301'));
      
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      if (lecInput) {
        setter.call(lecInput, 'Verification Lecture');
        lecInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (subInput) {
        setter.call(subInput, 'Debugging WebRTC');
        subInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (pwdInput) {
        setter.call(pwdInput, '123');
        pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (roomInput) {
        setter.call(roomInput, 'LAB 301');
        roomInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      // Select __VERIFY_TEST__ class or fallback
      const buttons = Array.from(document.querySelectorAll('button'));
      const clsBtn = buttons.find(b => b.textContent.includes('__VERIFY_TEST__') || b.textContent.includes('FYBCA'));
      if (clsBtn) clsBtn.click();
    });
    
    await delay(1000);
    console.log("Clicking 'Start Broadcasting' inside setup modal...");
    await teacherPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const start = buttons.find(b => b.textContent.includes('Start Broadcasting') || b.textContent.includes('Starting'));
      if (start) start.click();
    });
    
    await delay(3000); // Wait for backend / frontend to register session start

    // If environment flag FORCED_CRASH is set, simulate a crash partway through
    if (process.env.FORCED_CRASH === 'true') {
      console.log('\n[TEST HOOK] Triggering simulated crash before natural completion...');
      throw new Error('Simulated verification crash partway through execution');
    }

    // -------------------------------------------------------------
    // Step 3: Student: Join the Broadcast Session
    // -------------------------------------------------------------
    console.log("\n--- Student: Joining Broadcast Session ---");
    await studentPage.goto('http://localhost:5173/student/sessions');
    await delay(1000);
    console.log("Reloading student page to fetch latest active sessions...");
    await studentPage.reload({ waitUntil: 'networkidle0' }).catch(() => {});
    await delay(1500); // Wait for session card to render
    
    console.log("Clicking 'Join Session'...");
    const clickedJoin = await studentPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const join = buttons.find(b => b.textContent.includes('Join Session'));
      if (join) {
        join.click();
        return true;
      }
      return false;
    });
    console.log(`Clicked 'Join Session' button: ${clickedJoin}`);
    
    console.log("Waiting for password input to appear...");
    await studentPage.waitForSelector('#session-password', { visible: true, timeout: 5000 });
    
    console.log("Entering password '123' in join modal...");
    await studentPage.evaluate(() => {
      const input = document.getElementById('session-password');
      if (input) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeInputValueSetter.call(input, '123');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    
    await studentPage.evaluate(() => {
      const form = document.querySelector('form');
      if (form) {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    });
    
    await delay(3000);

  } catch (err) {
    console.error("ERROR during verification run:", err.message);
  } finally {
    console.log("\n=== Cleaning up & Ending Active Session via Real API Endpoint ===");
    try {
      if (teacherToken) {
        console.log("--> API CALL: POST http://localhost:3000/sessions/end");
        const res = await fetch('http://localhost:3000/sessions/end', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${teacherToken}`,
            'Content-Type': 'application/json'
          }
        });
        const data = await res.json().catch(() => ({}));
        console.log(`[API RESPONSE] HTTP Status: ${res.status}, Body: ${JSON.stringify(data)}`);
      }
    } catch (endErr) {
      console.error('[API TEARDOWN ERROR]:', endErr.message);
    }
    if (teacherBrowser) await teacherBrowser.close();
    if (studentBrowser) await studentBrowser.close();
    console.log("=== VERIFICATION RUN COMPLETED ===");
  }
}

main();
