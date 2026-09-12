import { protocolById } from './intervalProtocols';

/**
 * Le titre d'une activité tel qu'il s'affiche dans la liste et sur sa fiche.
 *
 * Une activité enregistrée avec un protocole portait jusqu'ici le seul nom du protocole :
 * « 4×4 norvégien » dit quoi, mais pas sur quoi — et la même séance se fait à l'assault bike, au
 * rameur ou en courant. Les deux sont nécessaires, donc les deux sont affichés.
 *
 * Un renommage à la main l'emporte sur le nom du protocole : si le libellé enregistré n'est plus
 * celui du protocole, c'est que c'est un nom choisi, et on le garde tel quel.
 */
export function activityTitle(activity, t, fallback) {
  const typeName = fallback !== undefined ? fallback : t(`activityType.${activity.type}`);
  const protocol = protocolById(activity.protocol);
  if (!protocol) return activity.label || typeName;
  const custom = activity.label && activity.label !== protocol.label ? activity.label : protocol.label;
  return `${typeName} · ${custom}`;
}
