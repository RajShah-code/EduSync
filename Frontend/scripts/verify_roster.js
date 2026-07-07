import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
import path from 'path';

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
  
  studentPage.on('requestfailed', request => {
    console.log(`[STUDENT REQ FAILED] ${request.url()} - ${request.failure().errorText}`);
  });
  studentPage.on('response', response => {
    if (response.url().includes('/sessions') || response.url().includes('/auth')) {
      console.log(`[STUDENT RES] ${response.url()} - Status: ${response.status()}`);
    }
  });

  try {
    // -------------------------------------------------------------
    // Step 1: Login Teacher & Student
    // -------------------------------------------------------------
    console.log("\n--- Logging in Teacher ---");
    await teacherPage.goto('http://localhost:5173/login');
    await teacherPage.waitForSelector('#email');
    await teacherPage.type('#email', 'teacher@gmail.com');
    await teacherPage.type('#password', 'password123');
    await teacherPage.click('form button[type="submit"]');
    await teacherPage.waitForNavigation();
    console.log("Teacher logged in successfully.");

    console.log("\n--- Logging in Student ---");
    await studentPage.goto('http://localhost:5173/login');
    await studentPage.waitForSelector('#email');
    await studentPage.type('#email', 'student1@gmail.com');
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
      
      // Select FYBCA class
      const buttons = Array.from(document.querySelectorAll('button'));
      const fybca = buttons.find(b => b.textContent.includes('FYBCA'));
      if (fybca) fybca.click();
    });
    
    await delay(1000);
    console.log("Clicking 'Start Broadcasting' inside setup modal...");
    await teacherPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const start = buttons.find(b => b.textContent.includes('Start Broadcasting') || b.textContent.includes('Starting'));
      if (start) start.click();
    });
    
    await delay(3000); // Wait for backend / frontend to register session start

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
        // React 16+ value setter override bypass
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeInputValueSetter.call(input, '123');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    
    const modalState = await studentPage.evaluate(() => {
      const input = document.getElementById('session-password');
      const buttons = Array.from(document.querySelectorAll('button'));
      const submit = buttons.find(b => b.textContent.includes('Join Session') && b.type === 'submit');
      return {
        inputValue: input ? input.value : null,
        submitExists: !!submit,
        submitDisabled: submit ? submit.disabled : null
      };
    });
    console.log("Modal state before submit click:", JSON.stringify(modalState));

    await studentPage.evaluate(() => {
      const form = document.querySelector('form');
      if (form) {
        console.log("Submitting form programmatically...");
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      } else {
        console.error("Form element not found!");
      }
    });
    
    await delay(5000); // Wait for redirect and WebRTC to stabilize

    // -------------------------------------------------------------
    // Step 4: Teacher Starts Screen Share
    // -------------------------------------------------------------
    console.log("\n--- Teacher: Starting Screen Share (Cycle 1) ---");
    await teacherPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const share = buttons.find(b => b.textContent.includes('Start Screen Share'));
      if (share) share.click();
    });
    
    await delay(5000); // Wait for first WebRTC offer/answer/ontrack

    // -------------------------------------------------------------
    // Step 5: Assign Task (forces LiveBroadcast unmount)
    // -------------------------------------------------------------
    console.log("\n--- Teacher: Navigating to Task Assignment sibling route ---");
    await teacherPage.goto('http://localhost:5173/teacher/task/assign');
    await delay(2000); // Wait for page to mount
    
    console.log("Filing and Assigning Task...");
    await teacherPage.type('#title', 'Screenshare Debug Task');
    await teacherPage.type('#description', 'Resolve the roster wipe issue.');
    await teacherPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const assignBtn = buttons.find(b => b.textContent.includes('Assign & Broadcast Task'));
      if (assignBtn) assignBtn.click();
    });
    
    await delay(4000); // Wait for task assignment to propagate and student layout to redirect

    // -------------------------------------------------------------
    // Step 6: Teacher closes/ends the task
    // -------------------------------------------------------------
    console.log("\n--- Teacher: Ending/Closing Task ---");
    // We should be redirected to the task progress page or list. Let's find and click "End Task".
    await teacherPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const endBtn = buttons.find(b => b.textContent.includes('End Task'));
      if (endBtn) endBtn.click();
    });
    
    await delay(4000); // Wait for student layout to return to live-session

    // -------------------------------------------------------------
    // Step 7: Teacher navigates back to Broadcast page and starts Screen Share again (Cycle 2)
    // -------------------------------------------------------------
    console.log("\n--- Teacher: Navigating back to Live Broadcast page ---");
    await teacherPage.goto('http://localhost:5173/teacher/broadcast');
    await delay(3000); // Wait for mount and roster-resync to execute
    
    console.log("Teacher starting screen share again...");
    await teacherPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const share = buttons.find(b => b.textContent.includes('Start Screen Share'));
      if (share) share.click();
    });
    
    await delay(6000); // Wait for second WebRTC offer/answer/ontrack cycle

    // -------------------------------------------------------------
    // Step 8: Repeat Step 5-7 a second time in the same session (Cycle 3)
    // -------------------------------------------------------------
    console.log("\n=== REPEATING SCENARIO (Cycle 3) ===");
    console.log("\n--- Teacher: Navigating to Task Assignment sibling route (Cycle 3) ---");
    await teacherPage.goto('http://localhost:5173/teacher/task/assign');
    await delay(2000);
    
    console.log("Filing and Assigning Task...");
    await teacherPage.type('#title', 'Screenshare Debug Task 2');
    await teacherPage.type('#description', 'Second verification run.');
    await teacherPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const assignBtn = buttons.find(b => b.textContent.includes('Assign & Broadcast Task'));
      if (assignBtn) assignBtn.click();
    });
    
    await delay(4000);
    
    console.log("\n--- Teacher: Ending/Closing Task (Cycle 3) ---");
    await teacherPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const endBtn = buttons.find(b => b.textContent.includes('End Task'));
      if (endBtn) endBtn.click();
    });
    
    await delay(4000);
    
    console.log("\n--- Teacher: Navigating back to Live Broadcast page (Cycle 3) ---");
    await teacherPage.goto('http://localhost:5173/teacher/broadcast');
    await delay(3000);
    
    console.log("Teacher starting screen share again...");
    await teacherPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const share = buttons.find(b => b.textContent.includes('Start Screen Share'));
      if (share) share.click();
    });
    
    await delay(6000);

  } catch (err) {
    console.error("ERROR during verification run:", err);
  } finally {
    console.log("\n=== Cleaning up browser instances ===");
    await teacherBrowser.close();
    await studentBrowser.close();
    console.log("=== VERIFICATION RUN COMPLETED ===");
  }
}

main();
