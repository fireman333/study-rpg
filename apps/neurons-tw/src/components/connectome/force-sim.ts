/**
 * Pure 2D force-directed simulation for the connectome graph.
 *
 * Forces per tick:
 *   1. Spring on every edge (Hookean F = -k(|d| - rest) along d̂)
 *   2. Coulomb-style all-pairs repulsion (F = k/|d|² along d̂, capped + cutoff for perf)
 *   3. Soft anchor (gentle pull toward node.anchor if set)
 *   4. Damping (vel *= damping)
 *   5. Optional fixed: skip velocity integration (used for user drag + root pin)
 *
 * Designed to be lightweight (no d3-force dep). Caller drives the loop via
 * requestAnimationFrame and reads node positions after each tick.
 */

export interface Vec2 {
  x: number
  y: number
}

export type SimNodeType = 'root' | 'branch' | 'leaf' | 'year'

export interface SimNode {
  id: string
  type: SimNodeType
  pos: Vec2
  vel: Vec2
  fixed: boolean
  mass: number
  /** Optional anchor — gentle force pulls the node toward this point. */
  anchor?: Vec2
  /** Anchor stiffness (typically smaller than spring stiffness). */
  anchorK?: number
  /** Repulsion strength contribution (allows shrinking year-node repulsion). */
  repelStrength: number
  /** Approximate body radius used by collision-resolve. */
  radius: number
}

export interface SimEdge {
  source: string
  target: string
  restLength: number
  stiffness: number
  /** Visual style class (used by renderer, ignored by sim). */
  kind: 'parent-child' | 'branch-link' | 'synapse'
}

export interface SimConfig {
  /** Velocity multiplier each tick (1 = no damping; 0.85 = strong). */
  damping: number
  /** Cap on max velocity magnitude per tick to keep simulation stable. */
  vMax: number
  /** Repulsion strength (Coulomb constant — tuned empirically). */
  repelK: number
  /** Max distance at which repulsion is computed (cutoff for perf). */
  repelCutoff: number
  /** Bounds of the simulation area (nodes are kept inside via gentle wall force). */
  bounds: { width: number; height: number }
  /** Wall spring constant (only active when node is outside bounds). */
  wallK: number
  /**
   * Global gravity strength — every node is pulled toward `bounds` center by
   * F = -centerK · (pos - center). Higher values produce a tighter circular
   * blob (Obsidian-style); 0 disables.
   */
  centerK: number
  /** Kinetic energy threshold below which `step()` returns false. */
  settleKE: number
}

export const DEFAULT_CONFIG: SimConfig = {
  damping: 0.84,
  vMax: 22,
  repelK: 5000,
  repelCutoff: 220,
  bounds: { width: 1200, height: 800 },
  wallK: 0.04,
  centerK: 0.0,
  settleKE: 0.05,
}

export class ForceSim {
  nodes: Map<string, SimNode> = new Map()
  edges: SimEdge[] = []
  config: SimConfig

  constructor(config: Partial<SimConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  addNode(node: SimNode): void {
    this.nodes.set(node.id, node)
  }

  addEdge(edge: SimEdge): void {
    this.edges.push(edge)
  }

  /** Apply one physics tick. Returns false when system has settled (KE < threshold). */
  step(): boolean {
    const nodes = Array.from(this.nodes.values())

    // Accumulate forces.
    const fx = new Map<string, number>()
    const fy = new Map<string, number>()
    for (const n of nodes) {
      fx.set(n.id, 0)
      fy.set(n.id, 0)
    }

    // Spring forces along edges.
    for (const e of this.edges) {
      const a = this.nodes.get(e.source)
      const b = this.nodes.get(e.target)
      if (!a || !b) continue
      const dx = b.pos.x - a.pos.x
      const dy = b.pos.y - a.pos.y
      const dist = Math.hypot(dx, dy) || 0.01
      const delta = dist - e.restLength
      const k = e.stiffness * delta
      const ux = dx / dist
      const uy = dy / dist
      fx.set(a.id, (fx.get(a.id) ?? 0) + ux * k)
      fy.set(a.id, (fy.get(a.id) ?? 0) + uy * k)
      fx.set(b.id, (fx.get(b.id) ?? 0) - ux * k)
      fy.set(b.id, (fy.get(b.id) ?? 0) - uy * k)
    }

    // All-pairs Coulomb repulsion (O(n²) — fine for ~120 nodes).
    const cutoff = this.config.repelCutoff
    const cutoff2 = cutoff * cutoff
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]
        const dx = b.pos.x - a.pos.x
        const dy = b.pos.y - a.pos.y
        const d2 = dx * dx + dy * dy
        if (d2 > cutoff2 || d2 < 0.01) continue
        const dist = Math.sqrt(d2)
        const strength = this.config.repelK * a.repelStrength * b.repelStrength / d2
        const ux = dx / dist
        const uy = dy / dist
        fx.set(a.id, (fx.get(a.id) ?? 0) - ux * strength)
        fy.set(a.id, (fy.get(a.id) ?? 0) - uy * strength)
        fx.set(b.id, (fx.get(b.id) ?? 0) + ux * strength)
        fy.set(b.id, (fy.get(b.id) ?? 0) + uy * strength)
      }
    }

    // Soft anchor force.
    for (const n of nodes) {
      if (!n.anchor || !n.anchorK) continue
      const dx = n.anchor.x - n.pos.x
      const dy = n.anchor.y - n.pos.y
      fx.set(n.id, (fx.get(n.id) ?? 0) + dx * n.anchorK)
      fy.set(n.id, (fy.get(n.id) ?? 0) + dy * n.anchorK)
    }

    // Central gravity — pulls every (non-fixed) node toward the canvas center,
    // shrinking the layout into a circular blob (Obsidian-style).
    const { width, height } = this.config.bounds
    const cx = width / 2
    const cy = height / 2
    const centerK = this.config.centerK
    if (centerK > 0) {
      for (const n of nodes) {
        if (n.fixed) continue
        fx.set(n.id, (fx.get(n.id) ?? 0) + (cx - n.pos.x) * centerK)
        fy.set(n.id, (fy.get(n.id) ?? 0) + (cy - n.pos.y) * centerK)
      }
    }

    // Wall force — keep nodes inside bounds.
    const wallK = this.config.wallK
    for (const n of nodes) {
      if (n.pos.x < n.radius) fx.set(n.id, (fx.get(n.id) ?? 0) + (n.radius - n.pos.x) * wallK)
      if (n.pos.x > width - n.radius)
        fx.set(n.id, (fx.get(n.id) ?? 0) + (width - n.radius - n.pos.x) * wallK)
      if (n.pos.y < n.radius) fy.set(n.id, (fy.get(n.id) ?? 0) + (n.radius - n.pos.y) * wallK)
      if (n.pos.y > height - n.radius)
        fy.set(n.id, (fy.get(n.id) ?? 0) + (height - n.radius - n.pos.y) * wallK)
    }

    // Integrate velocity + position. Skip fixed nodes.
    let ke = 0
    for (const n of nodes) {
      if (n.fixed) {
        n.vel.x = 0
        n.vel.y = 0
        continue
      }
      const ax = (fx.get(n.id) ?? 0) / n.mass
      const ay = (fy.get(n.id) ?? 0) / n.mass
      n.vel.x = (n.vel.x + ax) * this.config.damping
      n.vel.y = (n.vel.y + ay) * this.config.damping
      // Clamp velocity magnitude.
      const v2 = n.vel.x * n.vel.x + n.vel.y * n.vel.y
      const vMax2 = this.config.vMax * this.config.vMax
      if (v2 > vMax2) {
        const v = Math.sqrt(v2)
        n.vel.x = (n.vel.x / v) * this.config.vMax
        n.vel.y = (n.vel.y / v) * this.config.vMax
      }
      n.pos.x += n.vel.x
      n.pos.y += n.vel.y
      ke += v2 * n.mass
    }

    return ke > this.config.settleKE
  }

  /** Mark a node as user-dragged: pin it at `pos` and zero its velocity. */
  pinAt(id: string, pos: Vec2): void {
    const n = this.nodes.get(id)
    if (!n) return
    n.fixed = true
    n.pos.x = pos.x
    n.pos.y = pos.y
    n.vel.x = 0
    n.vel.y = 0
  }

  /** Release a previously pinned node so the simulation re-takes control. */
  release(id: string): void {
    const n = this.nodes.get(id)
    if (!n) return
    n.fixed = false
  }

  /** Snapshot current positions keyed by node id (used by React render). */
  snapshot(): Map<string, Vec2> {
    const map = new Map<string, Vec2>()
    for (const [id, n] of this.nodes) {
      map.set(id, { x: n.pos.x, y: n.pos.y })
    }
    return map
  }
}
