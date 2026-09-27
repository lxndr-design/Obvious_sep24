import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {CollisionScene} from '../src/collision.js';
import {HoleLayout} from '../src/terrain.js';
import {makeForm} from '../src/shapes.js';
import {
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  avatarForm,
  avatarPlacement,
  createPlayerEntity,
  nameTagLabel,
  pickSpawnSpot,
  spawnCandidates,
} from '../src/player-entity.js';

await R.init();

const placement = (collision, x, z) => avatarPlacement(collision, collision.avatarProbe, x, z);

test('the avatar probe is one cuboid matching the visual silhouette', () => {
  const form = avatarForm(R);
  assert.equal(form.height, PLAYER_HEIGHT);
  assert.equal(form.parts.length, 1);
  const bounds = form.geometry.boundingBox;
  assert.ok(Math.abs(bounds.max.y - PLAYER_HEIGHT) < 1e-9);
  assert.ok(Math.abs(bounds.min.y) < 1e-9);
  assert.ok(Math.abs(bounds.max.x - PLAYER_RADIUS) < 1e-9);
  assert.ok(Math.abs(form.parts[0].offset.y - PLAYER_HEIGHT / 2) < 1e-9);
});

test('avatarPlacement snaps to the grid and stands on supportY', () => {
  const collision = new CollisionScene(R);
  collision.avatarProbe = avatarForm(R);
  const placed = placement(collision, 0.13, -0.49);
  assert.ok(placed);
  assert.equal(placed.x, 0);
  assert.equal(placed.z, -0.5);
  assert.ok(Math.abs(placed.y) < 1e-6);
});

test('avatarPlacement rejects solids and accepts the neighbouring cell', () => {
  const collision = new CollisionScene(R);
  collision.avatarProbe = avatarForm(R);
  const block = makeForm('box', R);
  block.mesh = new THREE.Mesh(block.geometry);
  block.mesh.position.set(-2, block.height / 2, 0);
  collision.objects.push(block);

  assert.equal(placement(collision, -2, 0), null); // inside the block
  const beside = placement(collision, -1, 0);
  assert.ok(beside, 'the cell beside a block must accept an avatar');
  assert.ok(Math.abs(beside.y) < 1e-6);
});

test('an avatar wades into a pool and rests on the basin bottom', () => {
  const collision = new CollisionScene(R);
  collision.avatarProbe = avatarForm(R);
  collision.setTerrain(new HoleLayout([{id: 1, x: 0, z: 0, size: 2}]));
  const open = placement(collision, 4, 0);
  const pool = placement(collision, 0, 0);
  assert.ok(open && pool);
  assert.ok(Math.abs(open.y - pool.y - 0.71) < 0.002); // same basin depth as floor forms
});

test('a collider in the cell refuses avatar placement', () => {
  const collision = new CollisionScene(R);
  collision.avatarProbe = avatarForm(R);
  const bench = makeForm('bench', R);
  bench.mesh = new THREE.Mesh(bench.geometry);
  bench.mesh.position.set(3, bench.height / 2, 3);
  collision.objects.push(bench);
  assert.equal(placement(collision, 3, 3), null);
});

test('spawn candidates are deterministic, grid-aligned ring cells at the back edge', () => {
  const first = spawnCandidates();
  const second = spawnCandidates();
  assert.deepEqual(first, second);
  for (const {x, z} of first) {
    assert.equal(x, Math.round(x / 0.5) * 0.5);
    assert.equal(z, Math.round(z / 0.5) * 0.5);
    const radius = Math.hypot(x, z);
    // Arc radii run 4.5→7; snapping each coordinate to the 0.5 m grid drifts
    // a cell off the arc, so allow one grid step of slack on both ends.
    assert.ok(radius >= 4 - 1e-9 && radius <= 7.5 + 1e-9, `radius ${radius}`);
  }
  const keys = new Set(first.map(({x, z}) => `${x},${z}`));
  assert.equal(keys.size, first.length); // no duplicate cells
  // The first candidate hugs the outer ring, behind the park (negative z side).
  assert.ok(Math.hypot(first[0].x, first[0].z) >= 6.9);
});

test('pickSpawnSpot returns the first accepted placement, or null when full', () => {
  const candidates = spawnCandidates();
  assert.equal(pickSpawnSpot(candidates, () => false), null);
  assert.equal(pickSpawnSpot(candidates, () => null), null);
  const marker = {x: 1, y: 2, z: 3};
  const found = pickSpawnSpot(candidates, (x) => (x < 0 ? null : marker));
  assert.equal(found, marker); // the probe's own result is returned
});

test('the entity group is a two-mesh figure whose pose round-trips', () => {
  const material = new THREE.MeshStandardMaterial();
  const entity = createPlayerEntity({name: 'Bo', material});
  assert.equal(entity.group.children.length, 2);
  entity.setPose({x: 1.5, y: 0, z: -2, yaw: 0.5});
  assert.deepEqual(entity.pose(), {x: 1.5, y: 0, z: -2, yaw: 0.5});
  assert.ok(entity.body.castShadow && entity.head.castShadow);
});

test('setLeaving fades the per-entity material and resets cleanly', () => {
  const material = new THREE.MeshStandardMaterial();
  const entity = createPlayerEntity({name: 'Bo', material});
  entity.setLeaving(true);
  assert.equal(material.transparent, true);
  assert.ok(material.opacity < 1);
  entity.setLeaving(false);
  assert.equal(material.transparent, false);
  assert.equal(material.opacity, 1);
  entity.dispose();
});

test('name tags mark the local player', () => {
  assert.equal(nameTagLabel('Bo'), 'Bo');
  assert.equal(nameTagLabel('Bo', true), 'Bo (you)');
});
