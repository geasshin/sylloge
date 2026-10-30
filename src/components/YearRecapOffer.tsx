import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatNumber, t } from '../i18n/core.ts'
import { useLanguage } from '../i18n/react.ts'
import { libraryRepository } from '../data/libraryRepository.ts'
import { readRecapOfferedYear, rememberRecapOfferedYear } from '../data/recapOfferStorage.ts'
import { collectShareItems } from '../domain/shareCard.ts'
import { recapItems, recapOfferFor } from '../domain/yearRecap.ts'
import { AccessibleDialog } from './AccessibleDialog.tsx'
import { YearRecapDialog } from './YearRecapDialog.tsx'

/**
 * La proposition automatique du récapitulatif de l'année : une petite fenêtre qui s'ouvre d'elle-même
 * entre le 10 décembre et le 31 janvier, et seulement pour une année qui a vraiment quelque chose à
 * raconter (au moins vingt œuvres datées). Demande d'Aurélien du 30 octobre 2026 : « Il ne faut pas le
 * proposer à tout le monde : pas à quelqu'un qui vient de s'inscrire… Il faut au moins une bonne
 * vingtaine d'œuvres datées de cette année. »
 *
 * Une seule apparition par année et par profil sur cet appareil. « Voir mon récapitulatif » ouvre la
 * vraie fenêtre du bilan ; « Plus tard », Échap et le × ferment la proposition sans rien perdre : le
 * récapitulatif reste dans Paramètres › Récapitulatif de l'année.
 */

/** Délai après la première peinture, comme l'annonce de mise à jour : la personne voit son accueil d'abord. */
const OFFER_DELAY_MS = 1500

/**
 * La date « maintenant » de la proposition. Le harnais de recette la force par `?recapOffer=AAAA-MM-JJ` :
 * une recette ne change pas l'horloge de la machine.
 */
export function recapOfferNow(search: string, fallback: Date = new Date()): Date {
  const forced = new URLSearchParams(search).get('recapOffer')
  const match = forced === null ? null : /^(\d{4})-(\d{2})-(\d{2})$/.exec(forced.trim())
  if (!match) return fallback
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
  return Number.isNaN(date.getTime()) ? fallback : date
}

/** Une fenêtre est déjà ouverte : la proposition attend son tour, elle ne se pose jamais par-dessus.
 *  Détection simple (les fenêtres portent `aria-modal`) ; sinon elle revient à la prochaine ouverture,
 *  la mémoire n'étant posée qu'à l'affichage. */
function anotherDialogIsOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null
}

export function YearRecapOffer({ profileId, now }: { profileId: string; now?: Date }) {
  useLanguage()
  const [offer, setOffer] = useState<{ year: number; count: number } | null>(null)
  const [recapYear, setRecapYear] = useState<number | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    const timer = window.setTimeout(() => {
      const moment = now ?? recapOfferNow(window.location.search)
      const lastOfferedYear = readRecapOfferedYear(profileId)
      libraryRepository.loadLibrary(profileId).then(
        loaded => {
          if (cancelled || anotherDialogIsOpen()) return
          const items = collectShareItems(loaded)
          const year = recapOfferFor({ items, now: moment, lastOfferedYear })
          if (year === null) return
          // Une seule apparition par année, quelle que soit la réponse.
          rememberRecapOfferedYear(profileId, year)
          setOffer({ year, count: recapItems(items, year).length })
        },
        error => console.error('Impossible de compter les œuvres de l’année pour la proposition.', error),
      )
    }, OFFER_DELAY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [profileId, now])

  return (
    <>
      {offer && createPortal(
        <AccessibleDialog
          title={t('Votre année {year} dans Sylloge', { year: String(offer.year) })}
          description={t('{count} œuvres terminées en {year} : votre récapitulatif est prêt.', { count: formatNumber(offer.count), year: String(offer.year) })}
          closeDisabled={false}
          onClose={() => setOffer(null)}
          size="sm"
        >
          <div className="assistant-content">
            <p className="recap-offer-note">{t('Il reste disponible dans Paramètres › Récapitulatif de l’année.')}</p>
            <div className="assistant-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setRecapYear(offer.year)
                  setOffer(null)
                }}
              >
                {t('Voir mon récapitulatif')}
              </button>
              <button className="secondary-button" type="button" onClick={() => setOffer(null)}>{t('Plus tard')}</button>
            </div>
          </div>
        </AccessibleDialog>,
        document.body,
      )}
      {recapYear !== null && createPortal(
        <YearRecapDialog profileId={profileId} year={recapYear} onClose={() => setRecapYear(null)} />,
        document.body,
      )}
    </>
  )
}
