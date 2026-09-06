import * as migration_20260825_195946_initial from './20260825_195946_initial';
import * as migration_20260906_184621_projeto_categoria_projeto from './20260906_184621_projeto_categoria_projeto';

export const migrations = [
  {
    up: migration_20260825_195946_initial.up,
    down: migration_20260825_195946_initial.down,
    name: '20260825_195946_initial',
  },
  {
    up: migration_20260906_184621_projeto_categoria_projeto.up,
    down: migration_20260906_184621_projeto_categoria_projeto.down,
    name: '20260906_184621_projeto_categoria_projeto'
  },
];
