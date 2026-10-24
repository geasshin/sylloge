import main from './catalogs/main.ts'
import shell from './catalogs/shell.ts'
import entries from './catalogs/entries.ts'
import transfers from './catalogs/transfers.ts'
import home from './catalogs/home.ts'
import views from './catalogs/views.ts'
import messages from './catalogs/messages.ts'
import shared from './catalogs/shared.ts'
import native from './catalogs/native.ts'
import share from './catalogs/share.ts'
import services from './catalogs/services.ts'

export const catalogs = { main, shell, entries, transfers, home, views, messages, shared, native, share, services }
export const english: Readonly<Record<string, string>> = Object.assign({}, ...Object.values(catalogs))
