import { pickRunExcuse, RUN_EXCUSES } from "../santa/prompt";

const KEY = "np_last_run_excuse";

/** Picks why Santa has to run, avoiding the one used last time on this device. */
export function chooseRunExcuse(): string {
  let last: number | null = null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw !== null && /^\d+$/.test(raw)) last = Number(raw);
  } catch {
    /* storage unavailable: just pick at random */
  }
  const index = pickRunExcuse(last);
  try {
    window.localStorage.setItem(KEY, String(index));
  } catch {
    /* ignore */
  }
  return RUN_EXCUSES[index];
}
