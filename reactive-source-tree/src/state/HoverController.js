// Hover-to-focus: the node nearest the cursor becomes focused, grows, shows a detailed
// label, and pushes its neighbours away through GraphLayout. Pointer-down adds a grab
// path for browser/WPE previews so tiny process balls can be pulled out and inspected.
const PICK_MARGIN = 26;
const GRAB_MARGIN = 34;
const FOCUS_LINGER = 0.85;

export class HoverController {
  constructor() {
    this.focusedId = null;
    this.pinnedNode = null;
    this.draggedId = null;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.linger = 0;
  }

  eligible(node) {
    return node.type === 'live' || node.type === 'leaf' || node.type === 'category' || node.type === 'root';
  }

  pick(model, x, y, margin = PICK_MARGIN) {
    let best = null;
    let bestDist = Infinity;
    for (const node of model.nodes) {
      if (!this.eligible(node)) continue;
      const dist = Math.hypot(node.renderX - x, node.renderY - y);
      if (dist < (node.renderRadius ?? 4) + margin && dist < bestDist) {
        bestDist = dist;
        best = node;
      }
    }

    const current = this.focusedId ? model.nodeById.get(this.focusedId) : null;
    if (current && this.eligible(current)) {
      const dCur = Math.hypot(current.renderX - x, current.renderY - y);
      if (dCur < (current.renderRadius ?? 4) + margin * 1.7) {
        if (!best || bestDist > dCur - 12) return current.id;
      }
    }
    return best ? best.id : null;
  }

  releasePinned(keepId = null) {
    if (this.pinnedNode && this.pinnedNode.id !== keepId && this.pinnedNode.type !== 'root') {
      this.pinnedNode.fx = null;
      this.pinnedNode.fy = null;
    }
    if (!keepId || this.pinnedNode?.id !== keepId) this.pinnedNode = null;
  }

  setFocus(model, id) {
    this.releasePinned(id);
    this.focusedId = id;
    const node = id ? model.nodeById.get(id) : null;
    if (node && node.type !== 'root') {
      node.fx = node.x;
      node.fy = node.y;
      this.pinnedNode = node;
    }
  }

  startDrag(model, x, y) {
    const id = this.pick(model, x, y, GRAB_MARGIN);
    const node = id ? model.nodeById.get(id) : null;
    if (!node || node.type === 'root') return false;
    this.draggedId = node.id;
    this.dragOffsetX = node.x - x;
    this.dragOffsetY = node.y - y;
    this.setFocus(model, node.id);
    this.moveDrag(model, x, y);
    return true;
  }

  moveDrag(model, x, y) {
    const node = this.draggedId ? model.nodeById.get(this.draggedId) : null;
    if (!node) {
      this.draggedId = null;
      return;
    }
    const nextX = x + this.dragOffsetX;
    const nextY = y + this.dragOffsetY;
    node.fx = nextX;
    node.fy = nextY;
    node.x = nextX;
    node.y = nextY;
    node.vx = 0;
    node.vy = 0;
    this.pinnedNode = node;
    this.focusedId = node.id;
    this.linger = FOCUS_LINGER;
  }

  endDrag() {
    if (!this.draggedId) return;
    this.draggedId = null;
    this.linger = FOCUS_LINGER;
    this.releasePinned();
  }

  update(model, x, y, active, dt, pointer = null) {
    if (this.pinnedNode && !model.nodeById.has(this.pinnedNode.id)) {
      this.pinnedNode = null;
    }

    const canGrab = active && pointer?.isDown;
    if (canGrab && !this.draggedId) this.startDrag(model, x, y);
    if (canGrab && this.draggedId) {
      this.moveDrag(model, x, y);
    } else if (!pointer?.isDown && this.draggedId) {
      this.endDrag();
    }

    let nextId = this.draggedId;
    if (!nextId && active) {
      nextId = this.pick(model, x, y);
      this.linger = nextId ? FOCUS_LINGER : Math.max(0, this.linger - dt);
    } else if (!nextId && this.focusedId && this.linger > 0) {
      nextId = this.focusedId;
      this.linger = Math.max(0, this.linger - dt);
    } else if (!nextId) {
      nextId = null;
    }

    if (nextId !== this.focusedId) this.setFocus(model, nextId);
    if (!nextId) this.releasePinned();

    model.focusedId = this.focusedId;
    model.draggedId = this.draggedId;

    const k = Math.min(1, dt * 9);
    for (const node of model.nodes) {
      const target = node.id === this.focusedId ? 1 : 0;
      node.focus = (node.focus ?? 0) + (target - (node.focus ?? 0)) * k;
      const grabTarget = node.id === this.draggedId ? 1 : 0;
      node.grab = (node.grab ?? 0) + (grabTarget - (node.grab ?? 0)) * k;
    }
  }
}
