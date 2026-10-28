const tools = new Map();

export function registerTool(definition, handler) {
  if (!definition?.function?.name) {
    throw new Error('Tool definition must include function.name');
  }
  tools.set(definition.function.name, { definition, handler });
}

export function getEnabledTools(allowList = []) {
  if (!allowList.length) return [];
  return [...tools.values()]
    .filter((tool) => allowList.includes(tool.definition.function.name))
    .map((tool) => tool.definition);
}

export function getToolHandler(name) {
  return tools.get(name)?.handler ?? null;
}

export function listRegisteredTools() {
  return [...tools.keys()];
}
