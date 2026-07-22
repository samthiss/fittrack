// Fixed muscle-group taxonomy exercises can be tagged with, grouped by body region for the
// picker UI. Real anatomy names (not fabricated) — every fitness app ships some version of this
// list; we don't have licensed anatomy illustrations to go with it, so the picker uses plain
// grouped pills instead of the x-ray-style reference images.
export const MUSCLE_GROUP_REGIONS = [
  { key: 'legs', groupKeys: ['quadriceps', 'hamstrings', 'glutes', 'adductors', 'calves'] },
  { key: 'back', groupKeys: ['upperTraps', 'midBack', 'lowBack'] },
  { key: 'chest', groupKeys: ['chest'] },
  { key: 'shoulders', groupKeys: ['anteriorShoulder', 'medialShoulder', 'posteriorShoulder', 'rotatorCuff'] },
  { key: 'arms', groupKeys: ['biceps', 'triceps'] },
  { key: 'core', groupKeys: ['abs', 'obliques'] },
];

export const MUSCLE_GROUP_KEYS = MUSCLE_GROUP_REGIONS.flatMap((r) => r.groupKeys);
