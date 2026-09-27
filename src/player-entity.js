// Player avatars for the shared meadow (Feature 7, U2). A player entity is a
// small low-poly white figure with a pivot pose — no skeletons, matching the
// ducks/grandma rig convention. The module never touches DOM or WebGL: name
// tags render as HTML overlays in main.js, and tests build the real geometry.
import * as THREE from 'three';
import {GRID} from './collision.js';

// A bit shorter than grandma so visitors read as figures, not forms.
export const PLAYER_HEIGHT = 0.9;
export const PLAYER_RADIUS = 0.2;
const LEVEL = new THREE.Quaternion();

// Placement probe shaped like every object CollisionScene already queries:
// geometry.boundingBox for bounds/indexRadius, one Rapier cuboid part for
// contacts and casts. Dragging an avatar validates with the same canPlace /
// supportY queries a floor form uses — avatars just never enter state.objects,
// so they are not editable, serialized or counted against the scene cap.
export function avatarForm(R) {
  const geometry = {
    boundingBox: new THREE.Box3(new THREE.Vector3(-PLAYER_RADIUS, 0, -PLAYER_RADIUS), new THREE.Vector3(PLAYER_RADIUS, PLAYER_HEIGHT, PLAYER_RADIUS)),
  };
  return {
    geometry,
    height: PLAYER_HEIGHT,
    parts: [{shape: new R.Cuboid(PLAYER_RADIUS, PLAYER_HEIGHT / 2, PLAYER_RADIUS), offset: new THREE.Vector3(0, PLAYER_HEIGHT / 2, 0)}],
  };
}

// Snap + validate a drop for an avatar: grid-locked like every floor form,
// standing on supportY (pool basins included), rejected where canPlace
// rejects. Returns the placed Vector3, or null when the spot is blocked.
export function avatarPlacement(collision, form, x, z) {
  const snappedX = Math.round(x / GRID) * GRID, snappedZ = Math.round(z / GRID) * GRID;
  const position = new THREE.Vector3(snappedX, collision.supportY(form, snappedX, snappedZ, LEVEL), snappedZ);
  return collision.canPlace(form, position, LEVEL) ? position : null;
}

// The avatar: a tapered body and a faceted head, white like every meadow form.
// Group origin sits at the feet, so a pose is just position + yaw. `material`
// is owned by the caller (one clone per entity — leaving players fade).
//
// The viewer's own unit additionally carries a gold ring around its feet — the
// scene's only gold circle, marking self. Remote players never get one, so
// their group stays the plain two-mesh figure. The ring owns its unlit
// material (not the caller's): the gold must survive fades and lighting.
export const SELF_RING_COLOR = 0xe7bd35;
const SELF_RING_INNER = 0.3, SELF_RING_OUTER = 0.38, SELF_RING_LIFT = 0.015;

export function createPlayerEntity({name, material, self = false}) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.13, .19, .58, 8), material);
  body.position.y = .29;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.15, 8, 6), material);
  head.position.y = .74;
  body.castShadow = head.castShadow = true;
  group.add(body, head);

  let ring = null;
  if (self) {
    ring = new THREE.Mesh(
      new THREE.RingGeometry(SELF_RING_INNER, SELF_RING_OUTER, 48),
      new THREE.MeshBasicMaterial({color: SELF_RING_COLOR, transparent: true, opacity: .9, depthWrite: false}),
    );
    ring.rotation.x = -Math.PI / 2; // lay flat on the ground
    ring.position.y = SELF_RING_LIFT; // clear of the ground plane, no z-fighting
    group.add(ring);
  }

  return {
    group, body, head, ring, name, self,
    pose() {
      return {x: group.position.x, y: group.position.y, z: group.position.z, yaw: group.rotation.y};
    },
    setPose(pose) {
      group.position.set(pose.x, pose.y, pose.z);
      if (pose.yaw !== undefined) group.rotation.y = pose.yaw;
    },
    // A player inside the disconnect grace fades instead of vanishing; a
    // rejoin (or any later pose) un-fades without touching the mesh.
    setLeaving(leaving) {
      material.transparent = leaving;
      material.opacity = leaving ? .45 : 1;
    },
    dispose() {
      body.geometry.dispose();
      head.geometry.dispose();
      if (ring) {
        ring.geometry.dispose();
        ring.material.dispose();
      }
    },
  };
}

// Candidate spawn cells hugging the back edge of the park — newcomers enter
// from behind the scene instead of dropping in front of the camera. Rings run
// from the outer edge inward so the first free cell is nearest the edge.
export function spawnCandidates({grid = GRID, inner = 4.5, outer = 7, steps = 24} = {}) {
  const candidates = [], seen = new Set();
  for (let radius = outer; radius >= inner - 1e-9; radius -= grid) {
    for (let i = 0; i <= steps; i++) {
      const angle = Math.PI + (i / steps) * Math.PI; // back semicircle: -x → -z → +x
      const x = Math.round((Math.cos(angle) * radius) / grid) * grid;
      const z = Math.round((Math.sin(angle) * radius) / grid) * grid;
      const key = `${x},${z}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({x, z});
      }
    }
  }
  return candidates;
}

// First candidate the placement probe accepts; the probe's own result is
// returned (a Vector3 with the support height), or null when the ring is full.
export function pickSpawnSpot(candidates, isFree) {
  for (const {x, z} of candidates) {
    const spot = isFree(x, z);
    if (spot) return spot;
  }
  return null;
}
