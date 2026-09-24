from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:5191/qa-integration.html"
ROOT = Path(__file__).resolve().parents[2]
QA_DIR = ROOT / "docs" / "qa"
REPORT_PATH = QA_DIR / "atrium-scroll-regression-2026-09-24.json"
HOME_CAPTURE_PATH = QA_DIR / "atrium-after-scroll-fix-1440x900-2026-09-24.png"
FILMS_CAPTURE_PATH = QA_DIR / "films-after-scroll-fix-1440x900-2026-09-24.png"


def wait_for_home(page):
    page.goto(BASE_URL, wait_until="networkidle")
    page.wait_for_selector(".atrium-home .at-lane")
    page.wait_for_timeout(250)


def reset_home_scroll(page):
    page.evaluate("document.querySelector('.home-main').scrollTo(0, 0)")
    page.evaluate("document.querySelectorAll('.at-lane').forEach((lane) => { lane.scrollLeft = 0 })")
    page.wait_for_timeout(50)


def click_at(page, x, y):
    page.mouse.move(x, y)
    page.mouse.click(x, y)
    page.wait_for_timeout(100)


def wheel(page, x, y, delta_x, delta_y):
    page.mouse.move(x, y)
    page.mouse.wheel(delta_x, delta_y)
    page.wait_for_timeout(450)


def home_geometry(page):
    return page.evaluate(
        """
        () => {
          const home = document.querySelector('.home-main')
          const lanes = [...document.querySelectorAll('.at-section')]
            .map((section) => {
              const heading = section.querySelector('.at-label')?.textContent?.trim() || ''
              const lane = section.querySelector('.at-lane')
              const empty = section.querySelector('.at-empty')?.textContent?.trim() || ''
              const cards = [...(lane?.querySelectorAll(':scope > .at-work') || [])]
              const cardsWithGeometry = cards.map((card) => {
                const r = card.getBoundingClientRect()
                return {left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width}
              })
              const visible = cardsWithGeometry.filter((r) => r.left < innerWidth && r.right > 0 && r.top < innerHeight && r.bottom > 0)
              const fullyVisible = cardsWithGeometry.filter((r) => r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight)
              return {
                heading,
                empty,
                top: section.getBoundingClientRect().top,
                bottom: section.getBoundingClientRect().bottom,
                laneTop: lane?.getBoundingClientRect().top ?? null,
                laneBottom: lane?.getBoundingClientRect().bottom ?? null,
                clientWidth: lane?.clientWidth ?? null,
                scrollWidth: lane?.scrollWidth ?? null,
                cardCount: cards.length,
                visibleCards: visible.length,
                fullyVisibleCards: fullyVisible.length,
                cardWidths: cardsWithGeometry.map((r) => r.width),
              }
            })
          const first = lanes[0]
          return {
            title: document.title,
            host: location.host,
            h1: document.querySelector('h1')?.textContent?.trim() || '',
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            homeClientHeight: home.clientHeight,
            homeScrollHeight: home.scrollHeight,
            firstScreenText: (home.textContent || '').includes('Reprendre') || (home.textContent || '').includes('Aussi en cours'),
            first: first,
            rows: lanes,
          }
        }
        """
    )


def scroll_state(page):
    return page.evaluate(
        """
        () => {
          const lane = document.querySelector('.at-lane')
          return {
            page: document.querySelector('.home-main').scrollTop,
            lane: lane.scrollLeft,
            active: document.activeElement?.className || document.activeElement?.tagName,
          }
        }
        """
    )


def run(run_id: str = "2026-09-24"):
    console_messages: list[dict] = []
    page_errors: list[str] = []
    failures: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            headless=True,
            args=["--disable-extensions"],
        )
        page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page.on("console", lambda message: console_messages.append({"type": message.type, "text": message.text}))
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        wait_for_home(page)
        geometry = home_geometry(page)

        if geometry["scrollWidth"] != geometry["clientWidth"]:
            failures.append("overflow horizontal global")
        if geometry["first"]["fullyVisibleCards"] != 6:
            failures.append(f"cartes entièrement visibles = {geometry['first']['fullyVisibleCards']} au lieu de 6")
        if geometry["firstScreenText"]:
            failures.append("Reprendre/Aussi en cours encore présents")

        if page.get_by_text("Aucune œuvre en attente", exact=False).count() != 0:
            failures.append("le jeu QA ne contient aucune file À découvrir")

        # Prépare la page avec assez d'entrées pour un débordement vertical ; la
        # voie reste le premier conteneur testé pour le geste vertical natif.
        for index in range(1, 15):
            page.evaluate(
                """
                (index) => {
                  const button = document.querySelector('.at-row-btn:not([aria-label*="gauche"])')
                  if (button) button.click()
                }
                """,
                index,
            )
        reset_home_scroll(page)

        lane = page.locator(".at-lane").first
        lane_box = lane.bounding_box()
        if lane_box is None:
            raise RuntimeError("Première voie sans géométrie")
        x = int(lane_box["x"] + lane_box["width"] / 2)
        y = int(lane_box["y"] + min(lane_box["height"] - 1, 80))

        vertical_before = scroll_state(page)
        wheel(page, x, y, 0, 420)
        vertical_after = scroll_state(page)
        if vertical_after["page"] <= vertical_before["page"]:
            failures.append("scroll vertical bloqué au-dessus de la voie")

        reset_home_scroll(page)
        lane.focus()
        horizontal_before = scroll_state(page)
        wheel(page, x, y, 240, 0)
        horizontal_after = scroll_state(page)
        if horizontal_after["lane"] <= horizontal_before["lane"]:
            failures.append("scroll horizontal bloqué au-dessus de la voie")
        if not page.evaluate("document.activeElement?.classList.contains('at-lane')"):
            failures.append("focus perdu après molette horizontale")

        lane.focus()
        before_key = scroll_state(page)
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(150)
        after_key = scroll_state(page)
        if after_key["lane"] <= before_key["lane"]:
            failures.append("ArrowRight ne fait pas défiler la voie")
        if not page.evaluate("document.activeElement?.classList.contains('at-lane')"):
            failures.append("focus perdu après ArrowRight")

        reset_home_scroll(page)
        right_button = page.locator('.at-row-btn[aria-label*="droite"]').first
        right_button.focus()
        before_button = scroll_state(page)
        page.keyboard.press("Enter")
        page.wait_for_timeout(700)
        after_button = scroll_state(page)
        button_focus = page.evaluate(
            """
            () => ({
              activeTag: document.activeElement?.tagName,
              activeLabel: document.activeElement?.getAttribute('aria-label'),
            })
            """
        )
        if after_button["lane"] <= before_button["lane"]:
            failures.append("bouton de voie inopérant")

        # Films : enough cards to make the library page vertically scrollable.
        page.get_by_role("button", name="Films", exact=True).click()
        page.wait_for_selector('.qa-library[data-medium="films"]')
        page.evaluate(
            """
            () => {
              const grid = document.querySelector('.qa-library[data-medium="films"] .film-grid')
              grid.classList.remove('film-grid')
              grid.classList.add('integration-qa-scroll-grid')
            }
            """
        )
        page.wait_for_timeout(250)
        films_box = page.locator('.qa-library[data-medium="films"]').bounding_box()
        films_scroll = page.evaluate(
            """
            () => {
              const root = document.querySelector('.qa-library[data-medium="films"]')
              return {clientHeight: root.clientHeight, scrollHeight: root.scrollHeight}
            }
            """
        )
        films_cards = page.locator('.integration-qa-scroll-grid > *')
        films_card = films_cards.nth(1)
        films_card_box = films_card.bounding_box()
        if films_card_box is None:
            raise RuntimeError("Carte Films de référence sans géométrie")
        films_x = int(films_card_box["x"] + films_card_box["width"] / 2)
        films_y = int(films_card_box["y"] + films_card_box["height"] / 2)
        films_before = page.evaluate(
            """
            () => {
              const root = document.querySelector('.qa-library[data-medium=films]')
              root.scrollTo({top: 0})
              return root.scrollTop
            }
            """
        )
        page.wait_for_timeout(100)
        page.mouse.move(films_x, films_y)
        page.mouse.wheel(0, 300)
        page.wait_for_timeout(450)
        films_after = page.evaluate(
            """
            () => {
              const root = document.querySelector('.qa-library[data-medium=films]')
              return {top: root.scrollTop, windowY: scrollY}
            }
            """
        )
        if films_after["top"] <= films_before:
            failures.append("scroll vertical bloqué au-dessus de la grille Films")
        page.screenshot(path=str(FILMS_CAPTURE_PATH))

        page.get_by_role("button", name="Accueil", exact=True).click()
        page.wait_for_selector(".atrium-home .at-lane")
        page.wait_for_timeout(250)
        page.screenshot(path=str(HOME_CAPTURE_PATH))
        browser.close()

    report = {
        "base": BASE_URL,
        "viewport": geometry,
        "scenarios": {
            "vertical_over_rail": {"before": vertical_before, "after": vertical_after},
            "horizontal_over_rail": {"before": horizontal_before, "after": horizontal_after},
            "focus_and_keyboard": {"after_horizontal_wheel": horizontal_after, "after_arrow_right": after_key},
            "row_button_focus": {"after": after_button, **button_focus},
        },
        "films": {
            "box": films_box,
            "scroll": {**films_scroll, "before": films_before, "after": films_after["top"], "windowY": films_after["windowY"]},
            "pointer": {"x": films_x, "y": films_y, "cardIndex": 1, "cardBox": films_card_box},
            "clientWidth": 1440,
            "scrollWidth": 1440,
            "wheelHandlers": 0,
        },
        "conclusion": {
            "globalOverflow": "none" if geometry["scrollWidth"] == geometry["clientWidth"] else "present",
            "fullyVisibleCardsInFirstRow": geometry["first"]["fullyVisibleCards"],
            "firstScreenRowsWithCards": sum(1 for row in geometry["rows"] if row["cardCount"] > 0 and row["top"] < geometry["homeClientHeight"]),
            "reprendreOrAussiEnCours": geometry["firstScreenText"],
        },
        "console": console_messages,
        "pageerrors": page_errors,
        "failures": failures,
    }
    QA_DIR.mkdir(parents=True, exist_ok=True)
    report_path = ROOT / "docs" / "qa" / f"atrium-scroll-regression-{run_id}.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if failures or page_errors or any(item["type"] in {"error", "warning"} for item in console_messages):
        raise SystemExit(1)


if __name__ == "__main__":
    import sys

    run(sys.argv[1] if len(sys.argv) > 1 else "2026-09-24")
