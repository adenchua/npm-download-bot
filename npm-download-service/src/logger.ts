import { formatISO } from "date-fns";

function ts(): string {
  return formatISO(new Date());
}

export const logger = {
  log: (...args: unknown[]): void => console.log(`[${ts()}]`, ...args),
  error: (...args: unknown[]): void => console.error(`[${ts()}]`, ...args),
  warn: (...args: unknown[]): void => console.warn(`[${ts()}]`, ...args),
};
