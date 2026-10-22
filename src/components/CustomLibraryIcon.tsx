import type { CustomLibraryId } from '../domain/customLibraries.ts'
import {
  AudiobookIcon,
  BoardGameIcon,
  ComicIcon,
  DocumentaryIcon,
  MagazineIcon,
  MusicIcon,
  PodcastIcon,
  ShowIcon,
} from './icons.tsx'

/** Icône d’une bibliothèque personnalisée, même trait que les médiums de base. */
export function CustomLibraryIcon({ libraryId, size, filled }: { libraryId: CustomLibraryId; size?: number; filled?: boolean }) {
  switch (libraryId) {
    case 'comics':
      return <ComicIcon size={size} filled={filled} />
    case 'magazines':
      return <MagazineIcon size={size} filled={filled} />
    case 'audiobooks':
      return <AudiobookIcon size={size} filled={filled} />
    case 'music':
      return <MusicIcon size={size} filled={filled} />
    case 'podcasts':
      return <PodcastIcon size={size} filled={filled} />
    case 'documentaries':
      return <DocumentaryIcon size={size} filled={filled} />
    case 'shows':
      return <ShowIcon size={size} filled={filled} />
    case 'board_games':
      return <BoardGameIcon size={size} filled={filled} />
  }
}
