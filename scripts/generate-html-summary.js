#!/usr/bin/env node

/**
 * generate-html-summary.js
 * 
 * Deterministically generates styled HTML meeting summaries from structured SummaryJson
 * and metadata for SharePoint document library publication and Odoo logging.
 */

const fs = require('fs');
const path = require('path');

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateHtmlSummary(summaryData, metadata = {}) {
  const title = escapeHtml(metadata.title || 'Meeting Summary');
  const date = escapeHtml(metadata.event_date || 'N/A');
  const organiser = escapeHtml(metadata.organiser_email || 'N/A');
  const generatedOn = escapeHtml(metadata.generated_on || new Date().toISOString().split('T')[0]);

  const recap = escapeHtml(summaryData.recap || 'No recap provided.');

  const decisions = Array.isArray(summaryData.decisions) ? summaryData.decisions : [];
  const actionItems = Array.isArray(summaryData.action_items) ? summaryData.action_items : [];
  const openQuestions = Array.isArray(summaryData.open_questions) ? summaryData.open_questions : [];
  const warnings = Array.isArray(summaryData.warnings) ? summaryData.warnings : [];

  const decisionsHtml = decisions.length === 0
    ? '<p class="empty-state">No formal decisions recorded.</p>'
    : `<table class="summary-table">
        <thead>
          <tr>
            <th>Decision</th>
            <th>Made By</th>
            <th>Evidence Snippet</th>
          </tr>
        </thead>
        <tbody>
          ${decisions.map(d => `
            <tr>
              <td><strong>${escapeHtml(d.decision)}</strong></td>
              <td>${escapeHtml(d.made_by || 'All / General Consensus')}</td>
              <td class="evidence-cell"><em>"${escapeHtml(d.evidence || '')}"</em></td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;

  const actionsHtml = actionItems.length === 0
    ? '<p class="empty-state">No action items recorded.</p>'
    : `<table class="summary-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Owner</th>
            <th>Due Date</th>
            <th>Evidence Snippet</th>
          </tr>
        </thead>
        <tbody>
          ${actionItems.map(a => `
            <tr>
              <td><strong>${escapeHtml(a.task)}</strong></td>
              <td><span class="badge owner-badge">${escapeHtml(a.owner || 'Unassigned')}</span></td>
              <td><span class="badge date-badge">${escapeHtml(a.due_date || 'TBD')}</span></td>
              <td class="evidence-cell"><em>"${escapeHtml(a.evidence || '')}"</em></td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;

  const questionsHtml = openQuestions.length === 0
    ? '<p class="empty-state">No open questions remaining.</p>'
    : `<ul class="questions-list">
        ${openQuestions.map(q => `
          <li>
            <strong>${escapeHtml(q.question)}</strong>
            ${q.owner ? `<span class="badge owner-badge">${escapeHtml(q.owner)}</span>` : ''}
            ${q.evidence ? `<div class="evidence-block"><em>"${escapeHtml(q.evidence)}"</em></div>` : ''}
          </li>
        `).join('')}
      </ul>`;

  const warningsHtml = warnings.length === 0
    ? ''
    : `<div class="warnings-box">
        <h3>⚠️ Attention / Warnings</h3>
        <ul>
          ${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
        </ul>
      </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Summary</title>
  <style>
    :root {
      --primary-color: #1e3a8a;
      --primary-light: #eff6ff;
      --text-main: #1f2937;
      --text-muted: #6b7280;
      --border-color: #e5e7eb;
      --warning-bg: #fffbeb;
      --warning-border: #fef3c7;
      --warning-text: #92400e;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: var(--text-main);
      max-width: 900px;
      margin: 40px auto;
      padding: 0 20px;
      background-color: #f9fafb;
    }
    .container {
      background: #ffffff;
      padding: 36px;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
      border: 1px solid var(--border-color);
    }
    header {
      border-bottom: 2px solid var(--primary-light);
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    h1 {
      color: var(--primary-color);
      margin: 0 0 10px 0;
      font-size: 26px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      font-size: 14px;
      color: var(--text-muted);
      background-color: var(--primary-light);
      padding: 12px 16px;
      border-radius: 8px;
    }
    .meta-item strong {
      color: var(--text-main);
    }
    h2 {
      color: var(--primary-color);
      font-size: 18px;
      margin-top: 32px;
      margin-bottom: 12px;
      border-left: 4px solid var(--primary-color);
      padding-left: 10px;
    }
    .recap-box {
      background-color: #f8fafc;
      padding: 16px 20px;
      border-radius: 8px;
      border-left: 4px solid #3b82f6;
      font-size: 15px;
    }
    .summary-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 14px;
    }
    .summary-table th, .summary-table td {
      padding: 10px 14px;
      text-align: left;
      border-bottom: 1px solid var(--border-color);
    }
    .summary-table th {
      background-color: #f8fafc;
      font-weight: 600;
      color: var(--text-main);
    }
    .evidence-cell {
      color: var(--text-muted);
      font-size: 13px;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
    }
    .owner-badge {
      background-color: #e0f2fe;
      color: #0369a1;
    }
    .date-badge {
      background-color: #fef3c7;
      color: #92400e;
    }
    .questions-list {
      padding-left: 20px;
    }
    .questions-list li {
      margin-bottom: 12px;
    }
    .evidence-block {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .warnings-box {
      background-color: var(--warning-bg);
      border: 1px solid var(--warning-border);
      border-radius: 8px;
      padding: 16px;
      margin-top: 28px;
    }
    .warnings-box h3 {
      color: var(--warning-text);
      margin: 0 0 8px 0;
      font-size: 15px;
    }
    .warnings-box ul {
      margin: 0;
      padding-left: 20px;
      color: var(--warning-text);
      font-size: 14px;
    }
    .empty-state {
      color: var(--text-muted);
      font-style: italic;
      font-size: 14px;
    }
    footer {
      margin-top: 36px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
      font-size: 12px;
      color: var(--text-muted);
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${title}</h1>
      <div class="meta-grid">
        <div class="meta-item"><strong>Date:</strong> ${date}</div>
        <div class="meta-item"><strong>Organiser:</strong> ${organiser}</div>
        <div class="meta-item"><strong>Generated:</strong> ${generatedOn}</div>
      </div>
    </header>

    <section>
      <h2>Executive Recap</h2>
      <div class="recap-box">
        ${recap}
      </div>
    </section>

    <section>
      <h2>Key Decisions</h2>
      ${decisionsHtml}
    </section>

    <section>
      <h2>Action Items</h2>
      ${actionsHtml}
    </section>

    <section>
      <h2>Open Questions</h2>
      ${questionsHtml}
    </section>

    ${warningsHtml}

    <footer>
      <p>Generated by ECL Power Automate Meeting Summary Automation • Subject to human approval</p>
    </footer>
  </div>
</body>
</html>`;
}

// CLI Execution Support
if (require.main === module) {
  const args = process.argv.slice(2);
  const inputPath = args[0] || 'test-summary.json';
  const outputPath = args[1] || 'test-summary.html';

  if (!fs.existsSync(inputPath)) {
    console.error(`Input JSON file not found: ${inputPath}`);
    console.error('Usage: node scripts/generate-html-summary.js <input.json> [output.html]');
    process.exit(1);
  }

  try {
    const rawData = fs.readFileSync(inputPath, 'utf8');
    const parsed = JSON.parse(rawData);
    const summaryData = parsed.summary || parsed;
    const metadata = parsed.metadata || {
      title: 'ECL Project Sync',
      event_date: new Date().toISOString().split('T')[0],
      organiser_email: 'organiser@elewa.co.ke'
    };

    const html = generateHtmlSummary(summaryData, metadata);
    fs.writeFileSync(outputPath, html, 'utf8');
    console.log(`Successfully generated HTML summary at: ${outputPath}`);
  } catch (err) {
    console.error(`Failed to generate HTML summary: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { generateHtmlSummary };
