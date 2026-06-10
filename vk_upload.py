"""
VK Реклама — скрипт загрузки кампаний из шаблона
=================================================
Использование:
  1. Заполни ad_template.json (сам или через ИИ)
  2. Вставь токен ниже (или передай через env VK_TOKEN)
  3. Запусти: python vk_upload.py
  4. Кампания создаётся на ПАУЗЕ — проверь и включи вручную

API: ads.vk.com/api/v2
Документация: https://ads.vk.com/api/v2/intro.html
"""

import json
import os
import sys
import requests
from datetime import datetime

# ── НАСТРОЙКИ ────────────────────────────────────────────────────────────────
VK_TOKEN     = os.getenv("VK_TOKEN", "ВСТАВЬ_ТОКЕН_СЮДА")   # токен от ads.vk.com
ACCOUNT_ID   = os.getenv("VK_ACCOUNT_ID", "13371433")       # ID кабинета
TEMPLATE_FILE = "ad_template.json"                           # заполненный шаблон
API_BASE     = "https://ads.vk.com/api/v2"
# ─────────────────────────────────────────────────────────────────────────────

# Гео-справочник: название → ID региона VK
GEO_MAP = {
    "вся россия":          1,
    "москва":              1,
    "московская область":  3,
    "богородский округ":   3,
    "ногинск":             3,
    "санкт-петербург":     2,
    "екатеринбург":        11,
    "новосибирск":         15,
    "краснодарский край":  36,
}

# Интересы → ID категорий VK Рекламы
INTEREST_MAP = {
    "ремонт и строительство": 618,
    "дом и дача":             621,
    "недвижимость":           601,
    "загородная недвижимость": 602,
    "дизайн интерьера":       622,
    "инструменты и материалы": 618,
}


class VKAdsClient:
    def __init__(self, token: str, account_id: str):
        self.token = token
        self.account_id = account_id
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        })

    def _get(self, endpoint: str, params: dict = None) -> dict:
        url = f"{API_BASE}/{endpoint}"
        r = self.session.get(url, params=params)
        r.raise_for_status()
        return r.json()

    def _post(self, endpoint: str, data: dict) -> dict:
        url = f"{API_BASE}/{endpoint}"
        r = self.session.post(url, json=data)
        try:
            result = r.json()
        except Exception:
            print(f"  [!] Не удалось разобрать ответ: {r.text[:200]}")
            raise
        if r.status_code not in (200, 201):
            err = result.get("error", {})
            raise RuntimeError(f"API ошибка {r.status_code}: {err.get('message', r.text[:200])}")
        return result

    def check_auth(self) -> bool:
        """Проверяем что токен рабочий"""
        try:
            data = self._get("ad_plans.json", {"limit": 1})
            print(f"  ✓ Авторизация OK, аккаунт: {self.account_id}")
            return True
        except Exception as e:
            print(f"  ✗ Ошибка авторизации: {e}")
            return False

    def create_campaign(self, campaign: dict) -> str:
        """Создаём кампанию (ad_plan) → возвращаем ID"""
        payload = {
            "account_id": self.account_id,
            "name": campaign["name"],
            "objective": campaign.get("objective", "traffic"),
            "budget_limit": int(campaign.get("budget_total", 5000)),
            "budget_limit_day": int(campaign.get("budget_daily", 1000)),
            "status": "blocked",   # создаём на паузе
        }
        if campaign.get("date_start"):
            payload["date_from"] = campaign["date_start"]
        if campaign.get("date_end"):
            payload["date_to"] = campaign["date_end"]

        result = self._post("ad_plans.json", payload)
        plan_id = str(result.get("id") or result.get("data", {}).get("id", ""))
        print(f"  ✓ Кампания создана: '{campaign['name']}' (ID: {plan_id})")
        return plan_id

    def create_ad_group(self, plan_id: str, ad: dict, targeting: dict) -> str:
        """Создаём группу объявлений (ad_group) с таргетингом → возвращаем ID"""

        # Разбираем гео
        geo_str = targeting.get("geo", {}).get("regions", "вся россия").lower()
        region_ids = []
        for geo_name, geo_id in GEO_MAP.items():
            if geo_name in geo_str:
                if geo_id not in region_ids:
                    region_ids.append(geo_id)
        if not region_ids:
            region_ids = [1]  # Москва по умолчанию

        # Разбираем интересы
        interests_str = targeting.get("interests", "").lower()
        interest_ids = []
        for int_name, int_id in INTEREST_MAP.items():
            if int_name in interests_str:
                if int_id not in interest_ids:
                    interest_ids.append(int_id)

        payload = {
            "account_id": self.account_id,
            "ad_plan_id": plan_id,
            "name": f"Группа — {ad.get('product_name', 'товар')[:50]}",
            "status": "blocked",
            "targeting": {
                "age_from": int(targeting.get("age_from", 25)),
                "age_to": int(targeting.get("age_to", 65)),
                "sex": int(targeting.get("sex", 0)),
                "regions": region_ids,
            }
        }
        if interest_ids:
            payload["targeting"]["interests"] = interest_ids

        result = self._post("ad_groups.json", payload)
        group_id = str(result.get("id") or result.get("data", {}).get("id", ""))
        print(f"    ✓ Группа создана (ID: {group_id})")
        return group_id

    def create_banner(self, group_id: str, ad: dict) -> str:
        """Создаём баннер (banner) — текст + ссылка → возвращаем ID"""
        headline = ad.get("headline", "")[:25]
        text = ad.get("text", "")[:90]
        url = ad.get("product_url", "")
        cta = ad.get("cta", "Подробнее")

        payload = {
            "account_id": self.account_id,
            "ad_group_id": group_id,
            "status": "blocked",
            "content": {
                "title": headline,
                "text": text,
                "link": url,
                "cta": cta,
            }
        }

        result = self._post("banners.json", payload)
        banner_id = str(result.get("id") or result.get("data", {}).get("id", ""))
        print(f"      ✓ Объявление: '{headline}' (ID: {banner_id})")
        return banner_id


def validate_template(tpl: dict) -> list:
    """Проверяем что шаблон заполнен корректно"""
    errors = []

    if "FILL" in str(tpl.get("campaign", {}).get("name", "")):
        errors.append("campaign.name не заполнен")
    if "FILL" in str(tpl.get("campaign", {}).get("budget_total", "")):
        errors.append("campaign.budget_total не заполнен")

    for i, ad in enumerate(tpl.get("ads", [])):
        prefix = f"ads[{i}]"
        if "FILL" in str(ad.get("headline", "")):
            errors.append(f"{prefix}.headline не заполнен")
        if "FILL" in str(ad.get("text", "")):
            errors.append(f"{prefix}.text не заполнен")
        if "FILL" in str(ad.get("product_url", "")):
            errors.append(f"{prefix}.product_url не заполнен")
        if len(ad.get("headline", "")) > 25:
            errors.append(f"{prefix}.headline слишком длинный ({len(ad['headline'])} симв., max 25)")
        if len(ad.get("text", "")) > 90:
            errors.append(f"{prefix}.text слишком длинный ({len(ad['text'])} симв., max 90)")

    return errors


def print_summary(tpl: dict, results: list):
    """Итоговая сводка"""
    print("\n" + "═" * 50)
    print("ИТОГ")
    print("═" * 50)
    print(f"Кампания:    {tpl['campaign']['name']}")
    print(f"Бюджет:      {tpl['campaign']['budget_total']} ₽")
    print(f"Объявлений:  {len([r for r in results if r['status'] == 'ok'])}/{len(results)}")
    print()
    for r in results:
        status = "✓" if r["status"] == "ok" else "✗"
        print(f"  {status} {r['product'][:45]:45} {r.get('error', '')}")
    print()
    print("Кампания создана на ПАУЗЕ.")
    print("Проверь и включи вручную на https://ads.vk.com")
    print("═" * 50)


def main():
    print("╔══════════════════════════════════╗")
    print("║  VK Реклама — загрузка кампаний  ║")
    print("╚══════════════════════════════════╝\n")

    # ── Загружаем шаблон ───────────────────────────────────────────────
    if not os.path.exists(TEMPLATE_FILE):
        print(f"✗ Файл '{TEMPLATE_FILE}' не найден")
        print(f"  Скопируй ad_template.json в эту папку и заполни его")
        sys.exit(1)

    with open(TEMPLATE_FILE, "r", encoding="utf-8") as f:
        tpl = json.load(f)

    print(f"✓ Шаблон загружен: {TEMPLATE_FILE}")

    # ── Валидация ──────────────────────────────────────────────────────
    errors = validate_template(tpl)
    if errors:
        print("\n✗ Шаблон заполнен с ошибками:")
        for e in errors:
            print(f"   • {e}")
        print("\nИсправь ошибки и запусти снова")
        sys.exit(1)

    print(f"✓ Валидация пройдена: {len(tpl['ads'])} объявлений\n")

    # ── Проверка токена ────────────────────────────────────────────────
    if VK_TOKEN == "ВСТАВЬ_ТОКЕН_СЮДА":
        print("✗ Токен не вставлен!")
        print("  Открой vk_upload.py и вставь токен в переменную VK_TOKEN")
        print("  Или: export VK_TOKEN=ваш_токен && python vk_upload.py")
        sys.exit(1)

    client = VKAdsClient(VK_TOKEN, ACCOUNT_ID)

    print("Проверяем авторизацию...")
    if not client.check_auth():
        print("\n✗ Токен не работает.")
        print("  Для нового кабинета ads.vk.com нужен токен через client_id + client_secret")
        print("  Запроси доступ в поддержке ads.vk.com")
        sys.exit(1)

    # ── Создаём кампанию ───────────────────────────────────────────────
    print("\nСоздаём кампанию...")
    plan_id = client.create_campaign(tpl["campaign"])

    # ── Создаём объявления ─────────────────────────────────────────────
    print(f"\nСоздаём {len(tpl['ads'])} объявлений...")
    targeting = tpl.get("targeting", {})
    results = []

    for i, ad in enumerate(tpl["ads"], 1):
        product_name = ad.get("product_name", f"Товар {i}")
        print(f"\n[{i}/{len(tpl['ads'])}] {product_name}")
        try:
            group_id = client.create_ad_group(plan_id, ad, targeting)
            banner_id = client.create_banner(group_id, ad)
            results.append({
                "product": product_name,
                "status": "ok",
                "plan_id": plan_id,
                "group_id": group_id,
                "banner_id": banner_id,
            })
        except Exception as e:
            print(f"    ✗ Ошибка: {e}")
            results.append({"product": product_name, "status": "error", "error": str(e)})

    # ── Сохраняем результат ────────────────────────────────────────────
    out_file = f"campaign_result_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({"plan_id": plan_id, "ads": results}, f, ensure_ascii=False, indent=2)
    print(f"\n✓ Результат сохранён: {out_file}")

    print_summary(tpl, results)


if __name__ == "__main__":
    main()
