const commands = new Map();

export function registerCommand(definition) {
  const names = [definition.name, ...(definition.aliases || [])]
    .map((name) => String(name || '').trim().toLowerCase())
    .filter(Boolean);
  for (const name of names) {
    commands.set(name, definition);
  }
}

export function getCommand(name) {
  return commands.get(String(name || '').trim().toLowerCase()) || null;
}

export function listCommands() {
  const seen = new Set();
  const items = [];
  for (const definition of commands.values()) {
    if (seen.has(definition.name)) continue;
    seen.add(definition.name);
    items.push(definition);
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}
