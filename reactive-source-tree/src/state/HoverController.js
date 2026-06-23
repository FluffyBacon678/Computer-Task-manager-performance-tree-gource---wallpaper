// Hover-to-focus: the node nearest the cursor becomes "focused" — it enlarges, shows a
// detailed label, and (via a force in GraphLayout) pushes its neighbours away so it can be
// read. The focused node is lightly pinned so it holds still. Hover is the only mouse
// channel Wallpaper Engine delivers reliably (clicks/drag hit the desktop), so everything
// here is driven purely by cursor position.
const PICK_MARGIN = 26; // how far (world units) past a node's edge still counts as a hover

export class HoverController {
  constructor() {
    this.focusedId = null;
    this.pinnedNode = null;
  }

  eligible(node) {
    return node.type === 'live' || node.type === 'category' || node.type === 'root';
  }

  pick(model, x, y) {
    let best = null;
    let bestDist = Infinity;
    for (const node of model.nodes) {
      if (!this.eligible(node)) continue;
      const dist = Math.hypot(node.renderX - x, node.renderY - y);
      if (dist < (node.renderRadius ?? 4) + PICK_MARGIN && dist < bestDist) {
        bestDist = dist;
        best = node;
      }
    }

    // Stickiness: keep the current focus within a wider release radius unless another
    // node is clearly closer, so the focus doesn't flicker between neighbours.
    const current = this.focusedId ? model.nodeById.get(this.focusedId) : null;
    if (current && this.eligible(current)) {
      const dCur = Math.hypot(current.renderX - x, current.renderY - y);
      if (dCur < (current.renderRadius ?? 4) + PICK_MARGIN * 1.7) {
        if (!best || bestDist > dCur - 12) return current.id;
      }
    }
    return best ? best.id : null;
  }

  setFocus(model, id) {
    if (this.pinnedNode && this.pinnedNode.type !== 'root') {
      this.pinnedNode.fx = null;
      this.pinnedNode.fy = null;
    }
    this.pinnedNode = null;
    this.focusedId = id;
    const node = id ? model.nodeById.get(id) : null;
    if (node && node.type !== 'root') {
      node.fx = node.x;
      node.fy = node.y;
      this.pinnedNode = node;
    }
  }

  update(model, x, y, active, dt) {
    const nextId = active ? this.pick(model, x, y) : null;
    if (nextId !== this.focusedId) this.setFocus(model, nextId);
    model.focusedId = this.focusedId;

    const k = Math.min(1, dt * 9);
    for (const node of model.nodes) {
      const target = node.id === this.focusedId ? 1 : 0;
      node.focus = (node.focus ?? 0) + (target - (node.focus ?? 0)) * k;
    }
  }
}
