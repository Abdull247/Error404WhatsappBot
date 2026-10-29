const tools = new Map();

export function registerTool(definition, handler, options = {}) {
  if (!definition?.function?.name) {
    throw new Error('Tool definition must include function.name');
  }
  tools.set(definition.function.name, { definition, handler, options });
}

export function getEnabledTools(allowList = [], context = {}) {
  const all = [...tools.values()];
  const allowed = allowList.length
    ? all.filter((tool) => allowList.includes(tool.definition.function.name))
    : all;
  return allowed
    .filter((tool) => {
      if (!tool.options?.ownerOnly) return true;
      return Boolean(context.isOwner);
    })
    .map((tool) => tool.definition);
}

export function getToolHandler(name) {
  return tools.get(name)?.handler ?? null;
}

export function getToolOptions(name) {
  return tools.get(name)?.options ?? {};
}

export function isSlowTool(name) {
  return Boolean(tools.get(name)?.options?.slow);
}

export function listRegisteredTools() {
  return [...tools.keys()];
}
