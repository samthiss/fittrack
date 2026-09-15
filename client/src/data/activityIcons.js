// Which icon stands for which activity type. Shared, because the list is now long enough that a
// second copy would drift: the Hyrox stations added here have to look the same in the day's list
// and in the picker that adds them.
const TYPE_ICONS = {
  force: 'dumbbell',
  velo_ville: 'bike',
  stepper: 'footprints',
  // Hyrox: chaque station a la sienne, sinon une salle entière de lignes porte la même icône
  // générique et la liste du jour devient illisible d'un coup d'œil.
  course_a_pied: 'footprints',
  randonnee: 'trees',
  course_tapis: 'footprints',
  ski_erg: 'snowflake',
  rameur: 'sailboat',
  assault_bike: 'bike',
  velo_appartement: 'bike',
  traineau_poussee: 'move-right',
  traineau_traction: 'move-right',
  burpees_broad_jump: 'zap',
  farmers_carry: 'briefcase',
  fentes_sandbag: 'backpack',
  wall_balls: 'volleyball',
  hyrox: 'trophy',
};

export function iconForType(type) {
  if (TYPE_ICONS[type]) return TYPE_ICONS[type];
  // Every walking variant (tapis, incliné, walking pad) shares the prefix and the icon.
  if (type?.startsWith('marche')) return 'footprints';
  return 'activity';
}
