export type ExecMode = 'default' | 'raw' | 'args' | 'shell' | 'bash';

export class ExecCommandDto {
  cmd!: string;
  mode?: ExecMode;   // 'default' | 'raw' | 'args' | 'shell' | 'bash'
  login?: boolean;   // только для shell/bash, true => -lc, false => -c
}
