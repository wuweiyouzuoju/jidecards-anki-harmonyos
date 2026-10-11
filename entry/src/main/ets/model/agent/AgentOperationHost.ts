// SPDX-License-Identifier: AGPL-3.0-or-later
import type { OperationArguments } from './AgentOperations';

export interface AgentOperationHost {
  snapshot(): string;
  execute(name: string, args: OperationArguments, expected: string): Promise<string>;
}
/** 显式宿主能力：页面持有原流程，卸载时注销；提案不能跨宿主身份恢复。 */
export class AgentOperationHosts {
  private hosts: Map<string, AgentOperationHost> = new Map<string, AgentOperationHost>();
  private outcomes: Map<string, (output: string) => void> = new Map<string, (output: string) => void>();
  wait(key: string, launch: () => void): Promise<string> {
    if (this.outcomes.has(key)) throw new Error('workflow_busy');
    return new Promise<string>((resolve,reject): void => {
      this.outcomes.set(key,resolve);
      try { launch(); } catch (error) { this.outcomes.delete(key); reject(error); }
    });
  }
  finish(key: string, output: string): void { const finish = this.outcomes.get(key); this.outcomes.delete(key); finish?.(output); }
  register(domain: string, host: AgentOperationHost): void { this.hosts.set(domain, host); }
  unregister(domain: string, host: AgentOperationHost): void { if (this.hosts.get(domain) === host) this.hosts.delete(domain); }
  read(domain: string): string { const host = this.hosts.get(domain); if (host === undefined) throw new Error('operation_host_unavailable'); return host.snapshot(); }
  execute(domain: string, name: string, args: OperationArguments, expected: string): Promise<string> {
    const host = this.hosts.get(domain); if (host === undefined || host.snapshot() !== expected) throw new Error('operation_host_changed');
    return host.execute(name, args, expected);
  }
}
export const agentOperationHosts: AgentOperationHosts = new AgentOperationHosts();
