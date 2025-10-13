/* tslint:disable */
/* eslint-disable */
export class XY {
  free(): void;
  constructor(n: number, temp: number, j: number, h: number);
  metropolis_step(): void;
  overrelaxation_step(): void;
  metropolis_reflection_step(): void;
  wolff_step(): void;
  set_temp(temp: number): void;
  set_j(j: number): void;
  set_h(h: number): void;
  reset_data(): void;
  readonly accepted: number;
  readonly attempted: number;
  readonly energy: number;
  readonly magnetization: number;
  readonly spins_ptr: number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_xy_free: (a: number, b: number) => void;
  readonly xy_new: (a: number, b: number, c: number, d: number) => number;
  readonly xy_metropolis_step: (a: number) => void;
  readonly xy_overrelaxation_step: (a: number) => void;
  readonly xy_metropolis_reflection_step: (a: number) => void;
  readonly xy_wolff_step: (a: number) => void;
  readonly xy_accepted: (a: number) => number;
  readonly xy_attempted: (a: number) => number;
  readonly xy_energy: (a: number) => number;
  readonly xy_magnetization: (a: number) => number;
  readonly xy_spins_ptr: (a: number) => number;
  readonly xy_set_temp: (a: number, b: number) => void;
  readonly xy_set_j: (a: number, b: number) => void;
  readonly xy_set_h: (a: number, b: number) => void;
  readonly xy_reset_data: (a: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
