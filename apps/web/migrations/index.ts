import * as migration_20260825_195946_initial from './20260825_195946_initial';

export const migrations = [
  {
    up: migration_20260825_195946_initial.up,
    down: migration_20260825_195946_initial.down,
    name: '20260825_195946_initial'
  },
];
