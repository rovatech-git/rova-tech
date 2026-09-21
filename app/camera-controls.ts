import * as THREE from "three";

/** Orbit the existing follow camera. Short clicks remain movement commands. */
export function createCameraControls(
  canvas: HTMLCanvasElement,
  canInteract: () => boolean,
  walkTo: (event: PointerEvent) => void,
) {
  let yaw = 0, pitch = 0, zoom = 1, basePhi = 1;
  let gesture: { id: number; button: number; startX: number; startY: number; x: number; y: number; dragged: boolean } | null = null;
  const offset = new THREE.Vector3(), spherical = new THREE.Spherical();
  const clamp = THREE.MathUtils.clamp;
  const minPhi = .16, maxPhi = Math.PI / 2 - .13;
  canvas.style.cursor = "grab";

  function pointerDown(event: PointerEvent) {
    if (!canInteract() || gesture || !event.isPrimary || ![0, 2].includes(event.button)) return;
    gesture = { id: event.pointerId, button: event.button, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, dragged: false };
    canvas.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (!canInteract()) { cancel(); return; }
    if (!gesture.dragged && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 6) return;
    gesture.dragged = true;
    const sensitivity = 2 * Math.PI / Math.max(600, canvas.clientHeight);
    yaw -= (event.clientX - gesture.x) * sensitivity;
    pitch = clamp(pitch - (event.clientY - gesture.y) * sensitivity, minPhi - basePhi, maxPhi - basePhi);
    gesture.x = event.clientX; gesture.y = event.clientY;
    canvas.style.cursor = "grabbing";
    event.preventDefault();
  }
  function cancel() {
    const id = gesture?.id;
    gesture = null;
    canvas.style.cursor = "grab";
    if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  function pointerUp(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const click = !gesture.dragged && gesture.button === 0
      && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 6;
    cancel();
    if (click && canInteract()) walkTo(event);
  }
  function wheel(event: WheelEvent) {
    if (!canInteract()) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
    const delta = clamp(event.deltaY * unit, -240, 240);
    zoom = clamp(zoom * Math.exp(delta * .0018), .26, 1.95);
  }
  function contextMenu(event: MouseEvent) { event.preventDefault(); }
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("lostpointercapture", cancel);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("contextmenu", contextMenu);
  window.addEventListener("blur", cancel);

  return {
    apply(position: THREE.Vector3, target: THREE.Vector3) {
      spherical.setFromVector3(offset.copy(position).sub(target));
      basePhi = spherical.phi;
      pitch = clamp(pitch, minPhi - basePhi, maxPhi - basePhi);
      spherical.theta += yaw;
      spherical.phi += pitch;
      spherical.radius = clamp(spherical.radius * zoom, 5.2, 42);
      position.copy(target).add(offset.setFromSpherical(spherical));
    },
    reset() { yaw = 0; pitch = 0; zoom = 1; cancel(); },
    dispose() {
      cancel();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("lostpointercapture", cancel);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("contextmenu", contextMenu);
      window.removeEventListener("blur", cancel);
    },
  };
}
