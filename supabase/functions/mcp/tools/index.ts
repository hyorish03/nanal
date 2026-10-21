import type { McpServer } from 'npm:@modelcontextprotocol/server@2.0.0';

import { registerReadTools } from './read.ts';
import type { ToolContext } from './types.ts';
import { registerWriteTools } from './write.ts';

export type { ToolContext } from './types.ts';

export function registerTools(server: McpServer, context: ToolContext): void {
  registerReadTools(server, context);
  registerWriteTools(server, context);
}
