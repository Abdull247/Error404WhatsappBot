function clip(value, max = 4000) {
  const text = value == null ? '' : String(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`;
}

export function jobRuntimeSeconds(job) {
  const start = job?.started_at ? new Date(job.started_at).getTime() : 0;
  if (!start) return 0;
  const end = job?.completed_at ? new Date(job.completed_at).getTime() : Date.now();
  return Math.max(0, Math.round((end - start) / 1000));
}

export function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export function statusLabel(status) {
  const map = {
    queued: 'Queued',
    starting: 'Starting',
    running: 'Running',
    waiting: 'Waiting',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
    timed_out: 'Timed out',
    interrupted: 'Interrupted',
  };
  return map[status] || status || 'Unknown';
}

export function commandHint(prefix, command, jobId) {
  return `${prefix}${command} ${jobId}`;
}

export function isActiveStatus(status) {
  return ['queued', 'starting', 'running', 'waiting'].includes(status);
}

export function formatJobCard(job, { prefix = '.', command = 'agent', steps = [], files = [] } = {}) {
  const id = job.id;
  const lines = [
    `*Persistent agent*`,
    '',
    `ID: \`${id}\``,
    `Status: ${statusLabel(job.status)}`,
    `Task: ${clip(job.task, 400)}`,
  ];
  if (job.progress) lines.push(`Progress: ${clip(job.progress, 500)}`);
  if (job.started_at) lines.push(`Runtime: ${formatDuration(jobRuntimeSeconds(job))}`);
  if (files.length) {
    lines.push(`Files: ${files.map((file) => file.filename).join(', ')}`);
  }
  if (steps.length) {
    lines.push('', '*Recent steps*');
    for (const step of steps.slice(-6)) {
      const title = step.title || step.kind;
      lines.push(`- ${title}${step.content ? `: ${clip(step.content, 160)}` : ''}`);
    }
  }
  if (job.error) lines.push('', `Error: ${clip(job.error, 400)}`);
  if (job.result && ['completed', 'failed', 'cancelled', 'timed_out'].includes(job.status)) {
    lines.push('', clip(job.result, 1500));
  }
  lines.push(
    '',
    `Check: ${commandHint(prefix, command, id)}`,
    `Logs: ${prefix}${command} logs ${id}`,
    `Cancel: ${prefix}${command} cancel ${id}`,
  );
  return lines.join('\n');
}

export function formatJobList(jobs, { prefix = '.', command = 'agent' } = {}) {
  if (!jobs.length) {
    return `No persistent agents in this chat yet.\nStart a long task and I will send one, or use ${prefix}${command}.`;
  }
  const lines = ['*Your persistent agents*', ''];
  jobs.forEach((job, index) => {
    lines.push(`${index + 1}. ${statusLabel(job.status)} \`${job.id}\``);
    lines.push(`   ${clip(job.task, 120)}`);
  });
  lines.push('', `Inspect one with ${prefix}${command} <id>`);
  return lines.join('\n');
}

export function formatLogs(logs) {
  if (!logs.length) return 'No logs yet.';
  return logs
    .map((item) => {
      const when = item.created_at ? new Date(item.created_at).toISOString().slice(11, 19) : '';
      return `[${when} ${item.level}] ${clip(item.message, 300)}`;
    })
    .join('\n');
}

export function jobPublicInfo(job, { prefix = '.', command = 'agent' } = {}) {
  if (!job) return null;
  const id = job.id;
  return {
    id,
    status: job.status,
    statusLabel: statusLabel(job.status),
    task: clip(job.task, 280),
    progress: job.progress ? clip(job.progress, 400) : null,
    pushName: job.push_name || null,
    chatJid: job.chat_jid || null,
    startedAt: job.started_at || null,
    runtimeSeconds: jobRuntimeSeconds(job),
    runtime: formatDuration(jobRuntimeSeconds(job)),
    check: commandHint(prefix, command, id),
    logs: `${prefix}${command} logs ${id}`,
    result: `${prefix}${command} result ${id}`,
    cancel: `${prefix}${command} cancel ${id}`,
  };
}

export function busyReply(jobs, { prefix = '.', command = 'agent', cap = 1 } = {}) {
  const running = (Array.isArray(jobs) ? jobs : jobs ? [jobs] : []).filter(Boolean);
  const lines = [
    running.length <= 1
      ? 'A persistent agent is already running, so I cannot start another one right now.'
      : `${running.length} persistent agents are already running (cap ${cap}), so I cannot start another one right now.`,
    '',
  ];
  for (const job of running) {
    lines.push(`ID: \`${job.id}\``);
    lines.push(`Status: ${statusLabel(job.status)}`);
    lines.push(`Task: ${clip(job.task, 280)}`);
    if (job.progress) lines.push(`Progress: ${clip(job.progress, 400)}`);
    if (job.push_name) lines.push(`Started by: ${job.push_name}`);
    if (job.started_at) lines.push(`Runtime: ${formatDuration(jobRuntimeSeconds(job))}`);
    lines.push(`Check: ${commandHint(prefix, command, job.id)}`);
    lines.push(`Logs: ${prefix}${command} logs ${job.id}`);
    lines.push('');
  }
  lines.push('I will be free to start a new long task when the current agent finishes.');
  lines.push(`List agents: ${prefix}${command}`);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function queuedReply(job, { prefix = '.', command = 'agent' } = {}) {
  return [
    'Sent a persistent long running agent to continue the task.',
    '',
    `Job ID: \`${job.id}\``,
    `Task: ${clip(job.task, 280)}`,
    `Status: ${statusLabel(job.status)}`,
    '',
    `Track it with:`,
    commandHint(prefix, command, job.id),
    '',
    `Other commands:`,
    `${prefix}${command} logs ${job.id}`,
    `${prefix}${command} result ${job.id}`,
    `${prefix}${command} cancel ${job.id}`,
    `${prefix}${command}`,
  ].join('\n');
}

export function completionReply(job) {
  const heading = job.status === 'completed'
    ? 'Persistent agent finished.'
    : `Persistent agent ${statusLabel(job.status).toLowerCase()}.`;
  const lines = [
    heading,
    '',
    `Job ID: \`${job.id}\``,
    `Task: ${clip(job.task, 280)}`,
  ];
  if (job.progress) lines.push(`Progress: ${clip(job.progress, 400)}`);
  if (job.result) {
    lines.push('', clip(job.result, 1800));
  } else if (job.error) {
    lines.push('', clip(job.error, 800));
  }
  return lines.join('\n');
}

export { clip };
