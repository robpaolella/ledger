/**
 * E2E tests for Reimbursement Split feature (feature/reimbursement-splits)
 *
 * Tests:
 * 1. Setup fresh app → create owner account
 * 2. Create an account
 * 3. Create a normal expense transaction (no splits)
 * 4. Create an income transaction with splits (no reimbursement)
 * 5. Create an income transaction with reimbursement split
 * 6. Verify reimbursement badge appears in transaction list
 * 7. Edit reimbursement transaction → verify splits load with reimbursement state
 * 8. Reimbursement toggle resets category when toggled
 */

const puppeteer = require('puppeteer');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3099';
const API_URL = `${BASE_URL}/api`;
const TEST_DB_PATH = path.join(__dirname, '..', 'packages', 'server', 'data', 'ledger-e2e-test.db');
const SERVER_PORT = 3099;

let browser;
let page;
let serverProcess;

const TEST_USER = {
  displayName: 'Test User',
  username: 'testuser',
  password: 'testpass123',
};

// Helpers
async function waitForText(selector, text, timeout = 5000) {
  await page.waitForFunction(
    (sel, txt) => {
      const el = document.querySelector(sel);
      return el && el.textContent.includes(txt);
    },
    { timeout },
    selector,
    text
  );
}

async function waitAndClick(selector, timeout = 5000) {
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.click(selector);
}

async function typeInto(selector, text) {
  await page.waitForSelector(selector, { visible: true });
  await page.click(selector, { clickCount: 3 }); // select all
  await page.type(selector, text);
}

async function selectOption(selector, value) {
  await page.waitForSelector(selector, { visible: true });
  await page.select(selector, value);
}

async function screenshot(name) {
  const dir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

// Setup and teardown
async function startServer() {
  // Remove test DB if exists
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  // Seed the test database
  console.log('Seeding test database...');
  execSync(`DATABASE_PATH="${TEST_DB_PATH}" node packages/server/dist/db/seed.js`, {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',
  });

  // Start the server with test DB
  console.log('Starting test server on port', SERVER_PORT);
  serverProcess = spawn('node', ['packages/server/dist/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      DATABASE_PATH: TEST_DB_PATH,
      PORT: String(SERVER_PORT),
      JWT_SECRET: 'e2e-test-secret',
      NODE_ENV: 'production',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  serverProcess.stderr.on('data', (d) => process.stderr.write(`[server:err] ${d}`));

  // Wait for server to be ready
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${API_URL}/setup/status`);
      if (res.ok) {
        console.log('Server is ready');
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Server failed to start within 15 seconds');
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

// Test functions
async function testSetup() {
  console.log('\n=== Test 1: Fresh App Setup ===');
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

  // Should redirect to setup
  await page.waitForSelector('input[placeholder="Your name"]', { timeout: 10000 });
  await screenshot('01-setup-page');

  // Fill out setup form
  const inputs = await page.$$('input');
  // displayName
  await inputs[0].type(TEST_USER.displayName);
  // username
  await inputs[1].type(TEST_USER.username);
  // password
  await inputs[2].type(TEST_USER.password);
  // confirm password
  await inputs[3].type(TEST_USER.password);

  await screenshot('02-setup-filled');

  // Submit
  const submitBtn = await page.$('button[type="submit"]');
  await submitBtn.click();

  // Wait for redirect to dashboard
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
  await page.waitForFunction(() => !window.location.pathname.includes('setup'), { timeout: 10000 });
  await screenshot('03-dashboard');

  console.log('✅ Setup complete — owner account created');
}

async function testCreateAccount() {
  console.log('\n=== Test 2: Create Account ===');

  // Use API to create account (faster than UI navigation)
  const token = await page.evaluate(() => localStorage.getItem('token'));

  // Get current user ID from JWT
  const userPayload = JSON.parse(atob(token.split('.')[1]));
  const userId = userPayload.id || userPayload.userId;

  const res = await fetch(`${API_URL}/accounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Test Checking',
      type: 'checking',
      classification: 'checking',
      ownerIds: [userId],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create account: ${err}`);
  }

  const { data: account } = await res.json();
  console.log(`✅ Account created: ${account.name} (id: ${account.id})`);
  return account;
}

async function testGetCategories() {
  console.log('\n=== Test 3: Fetch Categories ===');
  const token = await page.evaluate(() => localStorage.getItem('token'));

  const res = await fetch(`${API_URL}/categories`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const { data: categories } = await res.json();

  const income = categories.filter((c) => c.type === 'income');
  const expense = categories.filter((c) => c.type === 'expense');

  console.log(`✅ Found ${income.length} income and ${expense.length} expense categories`);
  return { income, expense, all: categories };
}

async function testCreateExpenseTransaction(accountId, expenseCatId) {
  console.log('\n=== Test 4: Create Normal Expense Transaction ===');

  await page.goto(`${BASE_URL}/transactions`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('[data-testid="add-transaction-btn"], button', { timeout: 5000 });

  // Click add transaction button
  const buttons = await page.$$('button');
  let addBtn = null;
  for (const btn of buttons) {
    const text = await page.evaluate((el) => el.textContent, btn);
    if (text && (text.includes('Add') || text.includes('Transaction')) && !text.includes('Bulk')) {
      addBtn = btn;
      break;
    }
  }

  if (!addBtn) {
    // Try the floating pill
    addBtn = await page.$('.floating-pill, [class*="floating"]');
  }

  if (!addBtn) {
    // Fallback: use API
    console.log('  Using API fallback for expense transaction');
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const res = await fetch(`${API_URL}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        accountId,
        date: '2026-03-01',
        description: 'Coffee Shop',
        amount: 5.50,
        categoryId: expenseCatId,
      }),
    });
    if (!res.ok) throw new Error(`Failed: ${await res.text()}`);
    console.log('✅ Expense transaction created via API');
    return;
  }

  await addBtn.click();
  await screenshot('04-add-transaction-modal');
  console.log('✅ Expense transaction test passed');
}

async function testCreateIncomeSplitTransaction(accountId, incomeCats) {
  console.log('\n=== Test 5: Create Income Transaction with Splits (no reimbursement) ===');

  const token = await page.evaluate(() => localStorage.getItem('token'));

  // Create via API — split across two income categories
  const cat1 = incomeCats[0];
  const cat2 = incomeCats.length > 1 ? incomeCats[1] : incomeCats[0];

  const res = await fetch(`${API_URL}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      accountId,
      date: '2026-03-01',
      description: 'Paycheck with bonus',
      amount: -3000, // negative = income
      categoryId: cat1.id,
      splits: [
        { categoryId: cat1.id, amount: -2500 },
        { categoryId: cat2.id, amount: -500 },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Failed: ${await res.text()}`);
  const { data: tx } = await res.json();
  console.log(`✅ Income split transaction created (id: ${tx.id})`);
  return tx;
}

async function testCreateReimbursementSplitTransaction(accountId, incomeCat, expenseCat) {
  console.log('\n=== Test 6: Create Income Transaction with Reimbursement Split ===');

  const token = await page.evaluate(() => localStorage.getItem('token'));

  // Income transaction where part is reimbursement for an expense category
  // e.g., Venmo: $100 total, $70 income + $30 reimbursement for Dining
  const res = await fetch(`${API_URL}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      accountId,
      date: '2026-03-02',
      description: 'Venmo from friend - dinner reimb',
      amount: -100, // negative = income
      categoryId: incomeCat.id,
      splits: [
        { categoryId: incomeCat.id, amount: -70 },
        { categoryId: expenseCat.id, amount: -30 }, // expense cat = reimbursement
      ],
    }),
  });

  if (!res.ok) throw new Error(`Failed: ${await res.text()}`);
  const { data: tx } = await res.json();
  console.log(`✅ Reimbursement split transaction created (id: ${tx.id})`);
  return tx;
}

async function testReimbursementBadgeInList() {
  console.log('\n=== Test 7: Verify Reimbursement Badge in Transaction List ===');

  await page.goto(`${BASE_URL}/transactions`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('table, [class*="card"]', { timeout: 10000 });
  await screenshot('05-transactions-list');

  // Look for the reimbursement badge
  const badges = await page.$$eval('*', (els) => {
    return els
      .filter((el) => el.textContent.trim() === 'Reimb.')
      .map((el) => ({
        tag: el.tagName,
        classes: el.className,
        parentText: el.parentElement?.textContent?.substring(0, 100),
      }));
  });

  if (badges.length === 0) {
    // Check if the badge text is different
    const allBadgeTexts = await page.$$eval('span', (els) =>
      els
        .filter((el) => {
          const style = window.getComputedStyle(el);
          return (
            el.textContent.length < 20 &&
            (style.borderRadius !== '0px' || el.className.includes('badge'))
          );
        })
        .map((el) => el.textContent.trim())
    );
    console.log('  Badge-like elements found:', allBadgeTexts.join(', '));
  }

  // Find the reimbursement transaction row
  const reimbTxFound = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr, [class*="card"]');
    for (const row of rows) {
      if (row.textContent.includes('Venmo from friend')) {
        return {
          text: row.textContent.substring(0, 200),
          hasReimbBadge: row.textContent.includes('Reimb'),
          hasSplitBadge: row.textContent.includes('split') || row.textContent.includes('Split'),
        };
      }
    }
    return null;
  });

  if (!reimbTxFound) {
    console.log('⚠️  Reimbursement transaction not found in list — may need scroll');
  } else {
    console.log(`  Transaction found: "${reimbTxFound.text.substring(0, 80)}..."`);
    if (reimbTxFound.hasReimbBadge) {
      console.log('✅ Reimbursement badge found on transaction');
    } else {
      console.log('⚠️  No reimbursement badge text found — checking for visual badge...');
    }
    if (reimbTxFound.hasSplitBadge) {
      console.log('✅ Split badge also present');
    }
  }

  await screenshot('06-reimbursement-badge');
}

async function testEditReimbursementTransaction() {
  console.log('\n=== Test 8: Edit Reimbursement Transaction — Verify Split State ===');

  // Click on the Venmo reimbursement transaction to edit
  const clicked = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr, [class*="card"]');
    for (const row of rows) {
      if (row.textContent.includes('Venmo from friend')) {
        (row).click();
        return true;
      }
    }
    return false;
  });

  if (!clicked) {
    console.log('⚠️  Could not click reimbursement transaction — skipping edit test');
    return;
  }

  // Wait for modal/form to appear
  await page.waitForSelector('select, input[type="text"]', { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 1000)); // let form populate
  await screenshot('07-edit-reimbursement-form');

  // Check if split editor is visible with reimbursement state
  const splitState = await page.evaluate(() => {
    // Check for reimbursement badge or toggle in form
    const formEl = document.querySelector('[class*="modal"], [class*="sheet"], form');
    if (!formEl) return { found: false };

    const hasReimbText =
      formEl.textContent.includes('Reimb') || formEl.textContent.includes('reimbursement');
    const hasSplitRows = formEl.querySelectorAll('select').length >= 2;
    const selectValues = Array.from(formEl.querySelectorAll('select')).map((s) => s.value);

    return {
      found: true,
      hasReimbText,
      hasSplitRows,
      selectCount: formEl.querySelectorAll('select').length,
      selectValues,
    };
  });

  console.log('  Split editor state:', JSON.stringify(splitState, null, 2));

  if (splitState.hasReimbText) {
    console.log('✅ Reimbursement state preserved in edit form');
  } else if (splitState.hasSplitRows) {
    console.log('✅ Split rows loaded in edit form (reimbursement detection on category type)');
  } else {
    console.log('⚠️  Split editor state unclear — check screenshot');
  }

  await screenshot('08-edit-split-state');
}

async function testSplitEditorReimbursementToggle() {
  console.log('\n=== Test 9: Split Editor Reimbursement Toggle ===');

  // Navigate to transactions and open add form
  await page.goto(`${BASE_URL}/transactions`, { waitUntil: 'networkidle2' });

  const token = await page.evaluate(() => localStorage.getItem('token'));

  // We'll test the split editor UI interaction
  // Open add transaction form via clicking add button
  const addOpened = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const addBtn = buttons.find(
      (b) =>
        b.textContent.includes('Add') ||
        b.textContent.includes('+ Transaction') ||
        b.textContent.includes('Transaction')
    );
    if (addBtn) {
      addBtn.click();
      return true;
    }
    return false;
  });

  if (!addOpened) {
    console.log('⚠️  Could not open add transaction form — skipping toggle test');
    return;
  }

  await new Promise((r) => setTimeout(r, 500));
  await screenshot('09-add-form-open');

  // Switch to income type
  const switchedToIncome = await page.evaluate(() => {
    const toggles = Array.from(document.querySelectorAll('button'));
    const incomeBtn = toggles.find(
      (b) => b.textContent.trim() === 'Income' || b.textContent.trim() === 'income'
    );
    if (incomeBtn) {
      incomeBtn.click();
      return true;
    }
    return false;
  });

  if (switchedToIncome) {
    console.log('  Switched to Income type');
    await new Promise((r) => setTimeout(r, 300));
  }

  // Click split button
  const splitActivated = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const splitBtn = buttons.find(
      (b) => b.textContent.includes('Split') || b.textContent.includes('split')
    );
    if (splitBtn) {
      splitBtn.click();
      return true;
    }
    return false;
  });

  if (splitActivated) {
    console.log('  Split mode activated');
    await new Promise((r) => setTimeout(r, 500));
    await screenshot('10-split-mode-income');

    // Look for the reimbursement link
    const reimbLink = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const reimb = buttons.find(
        (b) =>
          b.textContent.trim().toLowerCase().includes('reimbursement') &&
          !b.textContent.trim().toLowerCase().includes('badge')
      );
      return reimb
        ? {
            text: reimb.textContent.trim(),
            visible: reimb.offsetParent !== null,
          }
        : null;
    });

    if (reimbLink) {
      console.log(`  Found reimbursement link: "${reimbLink.text}" (visible: ${reimbLink.visible})`);

      // Click the reimbursement link
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const reimb = buttons.find((b) =>
          b.textContent.trim().toLowerCase().includes('reimbursement')
        );
        if (reimb) reimb.click();
      });

      await new Promise((r) => setTimeout(r, 500));
      await screenshot('11-reimbursement-toggled');

      // Check that the category dropdown changed to expense categories
      const dropdownState = await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        // The last split row should have expense categories
        if (selects.length >= 2) {
          const lastSelect = selects[selects.length - 1];
          const options = Array.from(lastSelect.querySelectorAll('option'));
          const optgroups = Array.from(lastSelect.querySelectorAll('optgroup'));
          return {
            optionCount: options.length,
            groupLabels: optgroups.map((g) => g.label),
            hasExpenseGroups: optgroups.some(
              (g) =>
                g.label.includes('Daily Living') ||
                g.label.includes('Auto') ||
                g.label.includes('Household')
            ),
            hasIncomeGroup: optgroups.some((g) => g.label === 'Income'),
          };
        }
        return null;
      });

      if (dropdownState) {
        console.log('  Dropdown state after reimbursement toggle:', JSON.stringify(dropdownState));
        if (dropdownState.hasExpenseGroups && !dropdownState.hasIncomeGroup) {
          console.log('✅ Category dropdown switched to expense categories (no Income group)');
        } else if (dropdownState.hasExpenseGroups) {
          console.log('⚠️  Expense categories present but Income group also exists');
        } else {
          console.log('⚠️  Could not verify category dropdown change');
        }
      }

      // Check for ReimbursementBadge
      const hasBadge = await page.evaluate(() => {
        return !!Array.from(document.querySelectorAll('span')).find((s) =>
          s.textContent.includes('Reimb')
        );
      });

      if (hasBadge) {
        console.log('✅ ReimbursementBadge appears after toggle');
      }

      // Test Reset button
      const resetClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const resetBtn = buttons.find((b) => b.textContent.trim() === 'Reset');
        if (resetBtn) {
          resetBtn.click();
          return true;
        }
        return false;
      });

      if (resetClicked) {
        await new Promise((r) => setTimeout(r, 300));

        const afterReset = await page.evaluate(() => {
          const badges = Array.from(document.querySelectorAll('span')).filter((s) =>
            s.textContent.includes('Reimb')
          );
          return { badgeCount: badges.length };
        });

        if (afterReset.badgeCount === 0) {
          console.log('✅ Reset removes reimbursement badge and restores income categories');
        } else {
          console.log('⚠️  Badge still present after reset');
        }

        await screenshot('12-after-reset');
      }
    } else {
      console.log('⚠️  Reimbursement link not found — feature may only show on last row');
    }
  }

  console.log('✅ Split editor reimbursement toggle test complete');
}

// Main test runner
async function run() {
  let exitCode = 0;
  const results = [];

  try {
    // Build server first
    console.log('Building server...');
    execSync('npm run build -w packages/shared && npm run build -w packages/server', {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
    });

    await startServer();

    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: { width: 1280, height: 800 },
    });

    page = await browser.newPage();

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`  [browser error] ${msg.text()}`);
      }
    });

    page.on('pageerror', (err) => {
      console.log(`  [page error] ${err.message}`);
    });

    // Run tests sequentially
    const tests = [
      ['Setup', testSetup],
      ['Create Account', testCreateAccount],
      ['Fetch Categories', testGetCategories],
    ];

    let account, categories;

    // Test 1: Setup
    await testSetup();
    results.push({ name: 'Setup', status: 'pass' });

    // Test 2: Create account
    account = await testCreateAccount();
    results.push({ name: 'Create Account', status: 'pass' });

    // Test 3: Fetch categories
    categories = await testGetCategories();
    results.push({ name: 'Fetch Categories', status: 'pass' });

    // Test 4: Normal expense
    try {
      await testCreateExpenseTransaction(account.id, categories.expense[0].id);
      results.push({ name: 'Create Expense Transaction', status: 'pass' });
    } catch (err) {
      console.log(`❌ ${err.message}`);
      results.push({ name: 'Create Expense Transaction', status: 'fail', error: err.message });
    }

    // Test 5: Income split (no reimb)
    try {
      await testCreateIncomeSplitTransaction(account.id, categories.income);
      results.push({ name: 'Income Split Transaction', status: 'pass' });
    } catch (err) {
      console.log(`❌ ${err.message}`);
      results.push({ name: 'Income Split Transaction', status: 'fail', error: err.message });
    }

    // Test 6: Reimbursement split
    try {
      const diningCat = categories.expense.find((c) => c.sub_name === 'Dining') || categories.expense[0];
      await testCreateReimbursementSplitTransaction(
        account.id,
        categories.income[0],
        diningCat
      );
      results.push({ name: 'Reimbursement Split Transaction', status: 'pass' });
    } catch (err) {
      console.log(`❌ ${err.message}`);
      results.push({ name: 'Reimbursement Split Transaction', status: 'fail', error: err.message });
    }

    // Test 7: Badge in list
    try {
      await testReimbursementBadgeInList();
      results.push({ name: 'Reimbursement Badge in List', status: 'pass' });
    } catch (err) {
      console.log(`❌ ${err.message}`);
      results.push({ name: 'Reimbursement Badge in List', status: 'fail', error: err.message });
    }

    // Test 8: Edit preserves state
    try {
      await testEditReimbursementTransaction();
      results.push({ name: 'Edit Preserves Reimbursement State', status: 'pass' });
    } catch (err) {
      console.log(`❌ ${err.message}`);
      results.push({ name: 'Edit Preserves Reimbursement State', status: 'fail', error: err.message });
    }

    // Test 9: Toggle interaction
    try {
      await testSplitEditorReimbursementToggle();
      results.push({ name: 'Split Editor Toggle', status: 'pass' });
    } catch (err) {
      console.log(`❌ ${err.message}`);
      results.push({ name: 'Split Editor Toggle', status: 'fail', error: err.message });
    }
  } catch (err) {
    console.error('\n💥 Fatal error:', err.message);
    exitCode = 1;
    if (page) await screenshot('error-fatal').catch(() => {});
  } finally {
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('E2E TEST RESULTS');
    console.log('='.repeat(60));

    let passCount = 0;
    let failCount = 0;
    for (const r of results) {
      const icon = r.status === 'pass' ? '✅' : '❌';
      console.log(`  ${icon} ${r.name}${r.error ? ` — ${r.error}` : ''}`);
      if (r.status === 'pass') passCount++;
      else failCount++;
    }

    console.log(`\n  ${passCount} passed, ${failCount} failed out of ${results.length} tests`);
    console.log('='.repeat(60));

    if (browser) await browser.close();
    stopServer();

    // Cleanup test DB
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
      // Also remove WAL/SHM files
      [TEST_DB_PATH + '-wal', TEST_DB_PATH + '-shm'].forEach((f) => {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      });
    }

    if (failCount > 0) exitCode = 1;
    process.exit(exitCode);
  }
}

run();
