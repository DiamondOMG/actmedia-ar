import { Waypoint } from './store-loader';

export function getDistance(wp1: Waypoint, wp2: Waypoint): number {
  const dx = wp1.x - wp2.x;
  const dz = wp1.z - wp2.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function buildGraph(waypoints: Record<string, Waypoint>, edges: [string, string][]): Record<string, string[]> {
  const graph: Record<string, string[]> = {};
  for (const id in waypoints) {
    graph[id] = [];
  }
  
  for (const edge of edges) {
    const [u, v] = edge;
    if (graph[u] && graph[v]) {
      graph[u].push(v);
      graph[v].push(u); // undirected
    }
  }
  return graph;
}

export function findShortestPath(
  waypoints: Record<string, Waypoint>,
  edges: [string, string][],
  startId: string,
  goalId: string
): string[] | null {
  if (!waypoints[startId] || !waypoints[goalId]) {
    console.error(`Invalid startId (${startId}) or goalId (${goalId})`);
    return null;
  }
  
  if (startId === goalId) {
    return [startId];
  }

  const graph = buildGraph(waypoints, edges);
  
  const openSet = new Set<string>([startId]);
  const cameFrom: Record<string, string> = {};
  
  const gScore: Record<string, number> = {};
  for (const id in waypoints) gScore[id] = Infinity;
  gScore[startId] = 0;
  
  const fScore: Record<string, number> = {};
  for (const id in waypoints) fScore[id] = Infinity;
  fScore[startId] = getDistance(waypoints[startId], waypoints[goalId]);
  
  while (openSet.size > 0) {
    let current: string | null = null;
    let lowestFScore = Infinity;
    
    for (const id of openSet) {
      if (fScore[id] < lowestFScore) {
        lowestFScore = fScore[id];
        current = id;
      }
    }
    
    if (current === null) break;
    
    if (current === goalId) {
      const path = [current];
      while (cameFrom[current]) {
        current = cameFrom[current];
        path.unshift(current);
      }
      return path;
    }
    
    openSet.delete(current);
    
    for (const neighbor of graph[current]) {
      const tentativeGScore = gScore[current] + getDistance(waypoints[current], waypoints[neighbor]);
      
      if (tentativeGScore < gScore[neighbor]) {
        cameFrom[neighbor] = current;
        gScore[neighbor] = tentativeGScore;
        fScore[neighbor] = tentativeGScore + getDistance(waypoints[neighbor], waypoints[goalId]);
        
        if (!openSet.has(neighbor)) {
          openSet.add(neighbor);
        }
      }
    }
  }
  
  return null;
}
