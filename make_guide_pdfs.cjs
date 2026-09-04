#!/usr/bin/env node
/**
 * Generate print-ready PDFs from the guide HTML files.
 *
 * - Renders a styled cover page and a clickable Contents page (anchor links
 *   become real PDF link annotations).
 * - Prints "Title · page X of Y" footers on every page.
 * - Fills the Contents page numbers with a two-pass render:
 *   pass A renders with empty numbers, then Chrome's PDF named destinations
 *   (one per chapter anchor, e.g. /ch1-system-architecture) are read back to
 *   learn each chapter's exact physical page. Pass B injects the numbers and
 *   renders the final file; pagination is verified against pass A.
 *
 * Requires: puppeteer installed globally (npm i -g puppeteer), Python 3 with
 * PyPDF2, and a Chrome/Chromium binary.
 * Usage:
 *   NODE_PATH=$(npm root -g) node make_guide_pdfs.cjs
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Users/khem/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  '/Users/khem/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell',
].filter(Boolean);

const GUIDE_DIR = __dirname;
const GUIDES = [
  { html: 'guide-30-day.html', pdf: 'guide-30-day.pdf', footerTitle: '30-Day Launch Guide — chatbot-saas' },
  { html: 'guide-deep-dive.html', pdf: 'guide-deep-dive.pdf', footerTitle: 'Deep-Dive Technical Guide — chatbot-saas' },
  { html: 'guide-practical.html', pdf: 'guide-practical.pdf', footerTitle: 'Practical Guide — chatbot-saas' },
];

const PDF_MARGIN = { top: '14mm', bottom: '16mm', left: '13mm', right: '13mm' };

// Read Chrome's named destinations out of the PDF. Every <a href="#id"> link
// becomes a /Dests entry mapping name -> [pageRef, /XYZ, x, y]. The 1-based
// physical page for each chapter anchor is exact — no text matching.
const PY_READ_DESTS = `
import sys, json
import PyPDF2
reader = PyPDF2.PdfReader(sys.argv[1])
out = {}
try:
    dests = reader.trailer['/Root'].get('/Dests')
    if dests is not None:
        dests = dests.get_object()
    if dests is not None and hasattr(dests, 'keys'):
        items = [(name, dests[name]) for name in dests.keys()]
    elif dests is not None and dests.get('/Names') is not None:
        names = dests['/Names'].get_object()
        items = [(names[i], names[i + 1]) for i in range(0, len(names), 2)]
    else:
        items = []
    for name, dest in items:
        key = name[1:] if str(name).startswith('/') else str(name)
        try:
            dest = dest.get_object()
            if hasattr(dest, 'page'):
                page_ref = dest.page
            else:
                page_ref = dest[0]
            out[key] = reader._get_page_number_by_indirect(page_ref) + 1
        except Exception:
            pass
except Exception as e:
    sys.stderr.write('dest extraction failed: %s\\n' % e)
print(json.dumps(out))
`;

function readChapterPages(pdfPath) {
  const res = spawnSync('python3', ['-c', PY_READ_DESTS, pdfPath], { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error('python dest-reader failed: ' + (res.stderr || res.stdout).slice(0, 800));
  }
  try {
    return JSON.parse(res.stdout);
  } catch (e) {
    throw new Error('could not parse dest output: ' + res.stdout.slice(0, 400));
  }
}

function extractChapters(html) {
  const map = {};
  const re = /<section class="chapter" id="([^"]+)">\s*<h2>([^<]+)<\/h2>/g;
  let m;
  while ((m = re.exec(html))) map[m[1]] = m[2].replace(/&amp;/g, '&').replace(/&#39;/g, "'");
  return map;
}

function renderPdf(browser, htmlPath, pdfOut, opts = {}) {
  return new Promise(async (resolve, reject) => {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1200, height: 1600 });
      await page.goto('file://' + htmlPath, { waitUntil: 'networkidle2', timeout: 90000 });
      await waitForMermaid(page);
      await page.evaluate(() => document.fonts.ready);
      await new Promise((r) => setTimeout(r, 700));
      await page.pdf({
        path: pdfOut,
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate:
          `<div style="width:100%;font-size:7pt;color:#94a3b8;font-family:Helvetica,Arial,sans-serif;` +
          `padding:0 13mm;display:flex;justify-content:space-between;align-items:center;">` +
          `<span>${opts.footerTitle || ''}</span>` +
          `<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
        margin: PDF_MARGIN,
      });
      resolve();
    } catch (e) {
      reject(e);
    } finally {
      await page.close();
    }
  });
}

async function waitForMermaid(page) {
  // Poll until every .mermaid source block has been rendered into an <svg>
  // and none of the SVGs is a mermaid error placeholder.
  const deadline = Date.now() + 60000;
  let errorsSince = 0;
  while (Date.now() < deadline) {
    const counts = await page.evaluate(() => {
      const blocks = document.querySelectorAll('pre.mermaid').length;
      const svgs = document.querySelectorAll('.diagram svg').length;
      const errors = document.querySelectorAll('.diagram .error-icon, svg .error-text').length;
      return { blocks, svgs, errors };
    });
    const rendered = (counts.blocks === 0 && counts.svgs > 0) ||
                     (counts.svgs >= counts.blocks && counts.blocks > 0);
    if (rendered && counts.errors === 0) return;
    if (counts.errors > 0) {
      if (!errorsSince) errorsSince = Date.now();
      if (Date.now() - errorsSince > 5000) {
        throw new Error('mermaid reported a diagram syntax error');
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.warn('  ⚠ mermaid render timed out (continuing anyway)');
}

async function main() {
  const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
  if (!executablePath) {
    console.error('✗ No Chrome binary found. Set CHROME_PATH or install Playwright chromium.');
    process.exit(1);
  }
  console.log('Using Chrome:', executablePath);

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  for (const guide of GUIDES) {
    const htmlPath = path.join(GUIDE_DIR, guide.html);
    const pdfPath = path.join(GUIDE_DIR, guide.pdf);
    const chapters = extractChapters(fs.readFileSync(htmlPath, 'utf8'));
    console.log(`\n📄 ${guide.html} → ${guide.pdf}  (${Object.keys(chapters).length} chapters)`);

    // --- Pass A: render without page numbers, then read destination pages ---
    const stamp = Date.now() + '_' + Math.floor(Math.random() * 1e6);
    const passA = path.join(os.tmpdir(), `guideA_${stamp}.pdf`);
    await renderPdf(browser, htmlPath, passA, { footerTitle: guide.footerTitle });
    const destPages = readChapterPages(passA);
    fs.unlinkSync(passA);

    // --- Fill the Contents page numbers (digits only — cannot shift layout) ---
    let html = fs.readFileSync(htmlPath, 'utf8');
    const numbered = [];
    const missing = [];
    for (const id of Object.keys(chapters)) {
      const page = destPages[id];
      if (!page) { missing.push(id); continue; }
      const marker = `data-for="${id}"></span>`;
      if (html.includes(marker)) {
        html = html.split(marker).join(`data-for="${id}">${page}</span>`);
        numbered.push(id);
      }
    }
    if (missing.length) console.warn('  ⚠ no PDF destination for:', missing.join(', '));

    // --- Pass B: render the final PDF (temp file MUST end in .html) ---
    const passB = path.join(os.tmpdir(), `guideB_${stamp}.html`);
    fs.writeFileSync(passB, html);
    try {
      await renderPdf(browser, passB, pdfPath, { footerTitle: guide.footerTitle });
    } finally {
      fs.unlinkSync(passB);
    }

    // --- Verify pagination didn't drift after numbering was injected ---
    const after = readChapterPages(pdfPath);
    const drifted = Object.keys(chapters).filter(
      (id) => destPages[id] && after[id] && destPages[id] !== after[id],
    );
    const pageCount = await countPdfPages(pdfPath);
    console.log(`  ✓ wrote ${pdfPath} (${pageCount} pages, ${numbered.length}/${Object.keys(chapters).length} TOC numbers)`);
    if (drifted.length) {
      console.error(`  ✗ TOC pagination drifted for ${drifted.join(', ')} after numbering — re-run.`);
      process.exitCode = 1;
    } else if (numbered.length === Object.keys(chapters).length) {
      console.log('  ✓ every chapter page number matches its printed page');
    }
  }

  await browser.close();
  console.log('\nDone.');
}

async function countPdfPages(pdfPath) {
  const res = spawnSync('python3', ['-c',
    'import sys,PyPDF2;print(len(PyPDF2.PdfReader(sys.argv[1]).pages))', pdfPath],
    { encoding: 'utf8' });
  return res.status === 0 ? parseInt(res.stdout.trim(), 10) : null;
}

main().catch((err) => {
  console.error('✗ Failed:', err.message);
  process.exit(1);
});
