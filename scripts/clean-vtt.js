#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const inPath = process.argv[2] || 'transcript.vtt';
const outPath = process.argv[3] || 'transcript.cleaned.txt';
if (!fs.existsSync(inPath)) {
  console.error(`Input file not found: ${inPath}`);
  process.exit(2);
}
const raw = fs.readFileSync(inPath, 'utf8');
const lines = raw.split(/\r?\n/);

function isMetadata(line){
  if(!line) return false;
  const s = line.trim();
  if(/^WEBVTT/i.test(s)) return true;
  if(/^NOTE\b/i.test(s)) return true;
  if(/^(Kind|Language)\s*:/i.test(s)) return true;
  return false;
}
function isTimestamp(line){
  return /-->|^\d{2}:\d{2}:\d{2}\.\d{3}/.test(line.trim());
}
function redactSecrets(text){
  text = text.replace(/Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/gi, '***REDACTED***');
  text = text.replace(/\b[A-Za-z0-9+/=]{40,}\b/g, '***REDACTED***');
  text = text.replace(/\b[0-9a-fA-F]{20,}\b/g, '***REDACTED***');
  return text;
}

const utterances = [];
let current = null;

for(const rawLine of lines){
  const line = rawLine.replace(/\uFEFF/g,'');
  if(isMetadata(line) || isTimestamp(line)) {
    continue;
  }
  if(!line.trim()){
    if(current){ utterances.push(current); current = null; }
    continue;
  }

  const vMatch = line.match(/^\s*<v\s+([^>]+)>\s*(.*)$/);
  if(vMatch){
    if(current) utterances.push(current);
    current = { speaker: vMatch[1].trim(), text: vMatch[2].trim() };
    continue;
  }

  const colonMatch = line.match(/^\s*([^:]{1,80}):\s*(.*)$/);
  if(colonMatch && !/^\d+$/.test(colonMatch[1])){
    if(current) utterances.push(current);
    current = { speaker: colonMatch[1].trim(), text: colonMatch[2].trim() };
    continue;
  }

  if(current){
    current.text += ' ' + line.trim();
  } else {
    current = { speaker: null, text: line.trim() };
  }
}
if(current) utterances.push(current);

const outLines = utterances.map(u => {
  const speakerPart = u.speaker ? `${u.speaker}: ` : '';
  return redactSecrets(speakerPart + u.text);
});

fs.writeFileSync(outPath, outLines.join('\n'), 'utf8');
console.log(`Cleaned transcript written to ${outPath} (${outLines.length} utterances)`);
