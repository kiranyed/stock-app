import { IFlagFilterGroupPair } from "../../shared/types";

interface DependencyGraph {
  [key: string]: string[];
}

// Utility: extract flag dependencies from filter varNames
function extractDependencies(flag: IFlagFilterGroupPair): string[] {
  const filters = [...flag.enter.filters, ...flag.exit.filters];
  return filters
    .filter((f) => f.varName.startsWith("Flag"))
    .map((f) => f.varName.substring(4)); // remove 'Flag' prefix
}

// Build dependency graph
function buildDependencyGraph(flags: IFlagFilterGroupPair[]): DependencyGraph {
  const graph: DependencyGraph = {};
  for (const flag of flags) {
    graph[flag.name] = extractDependencies(flag);
  }
  return graph;
}

// Detect cycle from a given node
function hasCycleFrom(
  node: string,
  graph: DependencyGraph,
  visited = new Set<string>(),
  stack = new Set<string>(),
): boolean {
  if (stack.has(node)) return true; // found cycle
  if (visited.has(node)) return false;

  visited.add(node);
  stack.add(node);

  for (const dep of graph[node] || []) {
    if (hasCycleFrom(dep, graph, visited, stack)) return true;
  }

  stack.delete(node);
  return false;
}

// Check if adding a dependency from currentFlag → targetFlag creates a cycle
export function wouldCreateCycle(
  currentFlag: string,
  targetFlag: string,
  allFlags: IFlagFilterGroupPair[],
): boolean {
  // clone graph
  const graph = buildDependencyGraph(allFlags);

  if (!graph[currentFlag]) graph[currentFlag] = [];
  if (!graph[currentFlag].includes(targetFlag)) {
    graph[currentFlag].push(targetFlag); // simulate new dependency
  }

  return hasCycleFrom(currentFlag, graph);
}
