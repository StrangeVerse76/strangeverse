import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

// --- Login (Better Auth): tabelle e colonne come le vuole il suo adattatore Drizzle ---

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// --- Sincronizzazione di Soundverse (ADR 0011) ---

/** Che cosa si sincronizza: i metadati dei clip (con la ricetta), i progetti e i kit dei pad. */
export const RECORD_KINDS = ['clip', 'project', 'kit'] as const
export type RecordKind = (typeof RECORD_KINDS)[number]

/**
 * Una riga per clip, progetto o kit, con i dati così come stanno in IndexedDB.
 * Le eliminazioni restano come righe con `deletedAt`, così arrivano anche agli altri dispositivi.
 */
export const records = pgTable(
  'records',
  {
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: RECORD_KINDS }).notNull(),
    id: text('id').notNull(),
    data: jsonb('data').notNull(),
    /** Percorso su Blob dell'audio, solo per i clip importati e registrati. */
    audioPath: text('audio_path'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.kind, t.id] }),
    index('records_owner_updated').on(t.ownerId, t.updatedAt),
  ],
)

export type RecordRow = typeof records.$inferSelect
