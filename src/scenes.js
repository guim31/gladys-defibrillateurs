// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// - nearest: the nearest defibrillator of a watched place as a sentence ready
//   for a message or a speaker ("DAE le plus proche de Maison : Mairie, à
//   120 m, … Accès libre, disponible maintenant."), plus numbers for a
//   "Continue only if" step.
//
// A scene action does not receive the user's language: the sentence follows
// the `language` of the configuration. Outputs are numbers, never booleans:
// the core's "Continue only if" compares with ===.
// -----------------------------------------------------------------------------

import { TEXT, say } from './messages.js';

export class SceneError extends Error {}

export const SCENE_ACTIONS = {
  async nearest(service, { fields }) {
    const language = service.config.language;
    // Asked right at start: the first reading, not "no data".
    await service.firstReading();
    const watched = service.watched();
    if (watched.length === 0) {
      throw new SceneError(say(TEXT, language, 'noPlace'));
    }
    const asked = [fields?.place].flat().filter(Boolean).map(String)[0];
    const entry = asked ? watched.find((w) => w.deviceId === asked) : watched[0];
    if (!entry) {
      throw new SceneError(say(TEXT, language, 'gone'));
    }
    if (!service.data || !service.covers([entry])) {
      throw new SceneError(say(TEXT, language, 'noData'));
    }
    const view = service.view(entry);
    const nearest = view.list[0];
    return {
      sentence: service.sentence(entry, language),
      distance: nearest ? nearest.meters : -1,
      available_now: nearest?.available === true ? 1 : 0,
      available_count: view.availableCount,
    };
  },
};
