// Ambient declaration for the dependency-free mobile driver so tests can import
// its pure helpers without a build step. The driver is plain ESM JavaScript.
declare module '*/bin/mobile-cli.mjs' {
  export const buildFlow: (appId: string, steps: unknown[]) => string;
  export const detectPlatform: (...args: any[]) => any;
  export const resolveDevice: (...args: any[]) => any;
  export const parseAdbDevices: (out: string) => any;
  export const parseSimDevices: (out: string) => any;
  export const parseHierarchy: (out: string) => any;
  export const assignRefs: (...args: any[]) => any;
  export const getRef: (...args: any[]) => any;
  export const parseSince: (...args: any[]) => any;
  export const parseGlobalFlags: (...args: any[]) => any;
  export const resolveStatePath: (...args: any[]) => any;
  export const readVersion: (...args: any[]) => any;
  export const CliError: new (...args: unknown[]) => Error;
  export const EXIT: Record<string, number>;
  export const HELP: string;
  export const main: (...args: any[]) => any;
}
