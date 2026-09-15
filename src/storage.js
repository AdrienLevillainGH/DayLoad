/* ==================================================================
   storage

   Every read and write of the DayLoad dataset goes through this file.
   Nothing else in the app touches localStorage.

   That is the whole point: when you add a GitHub backend (or anything
   else) later, you change load() and save() here and the rest of the
   app never knows.
   ================================================================== */

const KEY = "dayload:v1";

export const store = {
  async load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      /* storage unavailable, or the value isn't valid JSON */
    }
    return null;
  },

  async save(value) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  },
};

/* Ask the browser not to evict this data when it runs low on space.
   Browsers may refuse, and iOS clears script storage after ~7 days of
   not visiting unless the app is installed to the home screen — so
   this is a safety net, not a guarantee. Keep exporting. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (e) {
    /* not supported */
  }
  return false;
}
