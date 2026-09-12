import * as migration_20260825_195946_initial from './20260825_195946_initial';
import * as migration_20260906_184621_projeto_categoria_projeto from './20260906_184621_projeto_categoria_projeto';
import * as migration_20260906_194532_projeto_campos_de_conteudo from './20260906_194532_projeto_campos_de_conteudo';
import * as migration_20260906_200327_midia_uploads from './20260906_200327_midia_uploads';
import * as migration_20260907_035137_projeto_midia_relacionamentos from './20260907_035137_projeto_midia_relacionamentos';
import * as migration_20260907_063817_colecoes_002b from './20260907_063817_colecoes_002b';
import * as migration_20260907_122242_evento_inscricao_obrigatoria from './20260907_122242_evento_inscricao_obrigatoria';
import * as migration_20260912_025334_contas_avatar_004 from './20260912_025334_contas_avatar_004';
import * as migration_20260912_062952_handle_unico_por_organizacao from './20260912_062952_handle_unico_por_organizacao';
import * as migration_20260912_103126_autor_removivel_tombstone from './20260912_103126_autor_removivel_tombstone';

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
    name: '20260906_200327_midia_uploads',
  },
  {
    up: migration_20260907_035137_projeto_midia_relacionamentos.up,
    down: migration_20260907_035137_projeto_midia_relacionamentos.down,
    name: '20260907_035137_projeto_midia_relacionamentos',
  },
  {
    up: migration_20260907_063817_colecoes_002b.up,
    down: migration_20260907_063817_colecoes_002b.down,
    name: '20260907_063817_colecoes_002b',
  },
  {
    up: migration_20260907_122242_evento_inscricao_obrigatoria.up,
    down: migration_20260907_122242_evento_inscricao_obrigatoria.down,
    name: '20260907_122242_evento_inscricao_obrigatoria',
  },
  {
    up: migration_20260912_025334_contas_avatar_004.up,
    down: migration_20260912_025334_contas_avatar_004.down,
    name: '20260912_025334_contas_avatar_004',
  },
  {
    up: migration_20260912_062952_handle_unico_por_organizacao.up,
    down: migration_20260912_062952_handle_unico_por_organizacao.down,
    name: '20260912_062952_handle_unico_por_organizacao'
  },
  {
    up: migration_20260912_103126_autor_removivel_tombstone.up,
    down: migration_20260912_103126_autor_removivel_tombstone.down,
    name: '20260912_103126_autor_removivel_tombstone'
  },
];
