const tools = new Map();

export function registerTool(definition, handler, options = {}) {
  if (!definition?.function?.name) {
    throw new Error('Tool definition must include function.name');
  }
  tools.set(definition.function.name, { definition, handler, options });
}

export function getEnabledTools(allowList = []) {
  const all = [...tools.values()];
  if (!allowList.length) {
    return all.map((tool) => tool.definition);
  }
  return all
    .filter((tool) => allowList.includes(tool.definition.function.name))
    .map((tool) => tool.definition);
}

export function getToolHandler(name) {
  return tools.get(name)?.handler ?? null;
}

export function listRegisteredTools() {
  return [...tools.keys()];
}
