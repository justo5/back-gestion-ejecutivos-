import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Task } from './task.entity';

const OLD_TABLE = 'client_todos';
const MIGRATED_TABLE = 'client_todos_migrado';

interface OldTodo {
  id: string;
  clientId: string;
  text: string;
  done: boolean;
  createdAt: Date;
}

// Pasa los To Do de la ficha del cliente (tabla client_todos, anterior al
// tablero) a la tabla tasks: los pendientes a Amarillo y los hechos a Hecho,
// con el mismo id. No hay migraciones en el proyecto (DB_SYNC), así que corre
// al arrancar. Después renombra la tabla vieja en vez de borrarla: no se
// pierde nada y la próxima vez ya no hay nada que migrar.
@Injectable()
export class ClientTodosMigration implements OnApplicationBootstrap {
  private readonly logger = new Logger(ClientTodosMigration.name);

  constructor(private dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    const exists = await this.dataSource.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [OLD_TABLE],
    );
    if (!exists.length) return;

    const migrated = await this.dataSource.transaction(async (em) => {
      const todos: OldTodo[] = await em.query(
        `SELECT "id", "clientId", "text", "done", "createdAt" FROM "${OLD_TABLE}" ORDER BY "createdAt" DESC`,
      );
      // Más nuevo arriba, como se veían en la ficha.
      const rows = todos.map((todo, position) => ({
        id: todo.id,
        clientId: todo.clientId,
        executiveId: null,
        column: todo.done ? ('done' as const) : ('yellow' as const),
        position,
        title: todo.text.slice(0, 500),
        notes: '',
        priority: 'yellow' as const,
        dueDate: null,
        recurrenceKey: null,
        createdAt: todo.createdAt,
      }));
      for (let i = 0; i < rows.length; i += 200) {
        await em.createQueryBuilder().insert().into(Task).values(rows.slice(i, i + 200)).orIgnore().execute();
      }
      await em.query(`ALTER TABLE "${OLD_TABLE}" RENAME TO "${MIGRATED_TABLE}"`);
      return rows.length;
    });
    this.logger.log(`Se pasaron ${migrated} tareas de ${OLD_TABLE} al tablero (la tabla vieja quedó como ${MIGRATED_TABLE})`);
  }
}
