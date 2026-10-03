export interface SandboxTask {
  id: number;
  result: Promise<string>;
}
export function start(source: string, inputJson: string): SandboxTask;
export function cancel(id: number): void;
