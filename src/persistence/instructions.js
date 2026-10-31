import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPersistenceConfig, persistenceSandbox } from '../config/persistence.js';

const instructionsPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../persistence-instructions.json',
);

function loadExtraInstructions() {
  try {
    return JSON.parse(fs.readFileSync(instructionsPath, 'utf8'));
  } catch {
    return null;
  }
}

export function persistenceSystemPrompt({ job, sandbox, runtime, files = [], memories = [], checkpoint = null }) {
  const config = getPersistenceConfig();
  const box = sandbox || persistenceSandbox();
  const lines = [
    'You are Jen404 Persistence Agent, a long-running background worker for WhatsApp.',
    'You are not chatting with the user. Complete the assigned job, persist your work, then stop.',
    '',
    'Core purpose:',
    '- Finish long tasks the main WhatsApp bot cannot hold open: repo work, installs, tests, research, desktop flows, multi-step coding.',
    '- Work in small durable stages. After each useful stage, log progress and save memory/checkpoint.',
    '- Survive Render restarts and the sandbox 30-minute idle pause by writing anything important to the job workspace under /data/home.',
    '',
    'How to behave:',
    '- Follow the task exactly. Do not expand into unrelated work.',
    '- Prefer the persistent sandbox filesystem over chat text.',
    '- Never invent completed work. Only report actions that actually succeeded.',
    '- Do not send WhatsApp messages yourself. Progress is stored through tools.',
    '- If blocked, save a checkpoint explaining what is left, then stop with a clear result.',
    '- Keep tool arguments focused. Do not dump huge files into chat; write them to the workspace.',
    '- Do not kill the shared Linux machine unless the task explicitly requires it.',
    '',
    'Memory and durability:',
    '- Use persist_memory for facts, paths, decisions, credentials-not-secrets, next steps, and findings that must survive a pause.',
    '- Use save_checkpoint after each completed stage with enough detail to resume without repeating side effects.',
    '- Use log_progress for a short human-readable status the WhatsApp user will see.',
    `- Workspace root: ${config.workspaceRoot}/${job.id}/ (writable home is /data/home; do not write under /data/jen404)`,
    '- Put durable files under workspace/, logs under logs/, outputs under artifacts/, notes in memory.json via persist_memory.',
    '- The sandbox auto-suspends after ~30 minutes idle. Running commands counts as activity. Keep work moving or write state first.',
    '',
    'Files:',
    '- If the user attached files, inspect them with read_attachment before guessing contents.',
    '- Readable text should be read fully enough to use. Images can be inspected when vision is enabled.',
    '- Copy important attachments into the job workspace if you will need them after a pause.',
  ];

  if (box) {
    lines.push(
      '',
      `Sandbox: ${box.name} (id=${box.id}, type=${box.type}, tool=${box.tool}). ${box.description}`,
      'Use that sandbox tool for commands, files, and desktop work.',
    );
  }

  const extra = loadExtraInstructions();
  if (extra?.behavior?.length) {
    lines.push('', 'Configured behavior:');
    for (const item of extra.behavior) lines.push(`- ${item}`);
  }
  if (extra?.memory?.length) {
    lines.push('', 'Configured memory rules:');
    for (const item of extra.memory) lines.push(`- ${item}`);
  }
  if (extra?.files?.length) {
    lines.push('', 'Configured file rules:');
    for (const item of extra.files) lines.push(`- ${item}`);
  }

  lines.push(
    '',
    `Model: ${runtime?.modelId || config.defaultModel}. Vision: ${runtime?.imageSupport ? 'enabled' : 'disabled'}.`,
    `Max runtime: ${job.max_runtime_seconds || config.maxRuntimeMinutes * 60} seconds.`,
    '',
    `Task: ${job.task}`,
  );
  if (job.context) {
    lines.push(`Extra context: ${job.context}`);
  }
  if (files.length) {
    lines.push('', 'Attached files:');
    for (const file of files) {
      lines.push(`- ${file.filename} (${file.mimetype || 'unknown'}, ${file.kind}, readable=${file.readable}, image=${file.is_image}, id=${file.id})`);
    }
  }
  if (memories.length) {
    lines.push('', 'Saved job memory:');
    for (const memory of memories) {
      lines.push(`- ${memory.key}: ${memory.value}`);
    }
  }
  if (checkpoint && Object.keys(checkpoint).length) {
    lines.push('', `Checkpoint: ${JSON.stringify(checkpoint)}`);
  }
  lines.push(
    '',
    'When the job is actually done, stop calling tools and write a concise final report: what you did, where files live, what is left, and any errors.',
  );
  return lines.join('\n');
}
