import * as migration_20260825_195946_initial from './20260825_195946_initial';
import * as migration_20260906_184621_projeto_categoria_projeto from './20260906_184621_projeto_categoria_projeto';
import * as migration_20260906_194532_projeto_campos_de_conteudo from './20260906_194532_projeto_campos_de_conteudo';
import * as migration_20260906_200327_midia_uploads from './20260906_200327_midia_uploads';

export const migrations = [
  {
    up: migration_20260825_195946_initial.up,
    down: migration_20260825_195946_initial.down,
    name: '20260825_195946_initial',
  },
  {
    up: migration_20260906_184621_projeto_categoria_projeto.up,
    down: migration_20260906_184621_projeto_categoria_projeto.down,
    name: '20260906_184621_projeto_categoria_projeto',
  },
  {
    up: migration_20260906_194532_projeto_campos_de_conteudo.up,
    down: migration_20260906_194532_projeto_campos_de_conteudo.down,
    name: '20260906_194532_projeto_campos_de_conteudo',
  },
  {
    up: migration_20260906_200327_midia_uploads.up,
    down: migration_20260906_200327_midia_uploads.down,
    name: '20260906_200327_midia_uploads'
  },
];
