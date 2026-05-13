import os
import json
import requests
import hashlib
import pandas as pd
import concurrent.futures
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from datetime import datetime

# --- НАСТРОЙКИ ---
BASE_URL = "https://mk4s.ru/"
DATA_FOLDER = "parsed_categories"
CATALOG_JSON_PATH = "catalog.json"       # ← главный JSON каталога
MAX_WORKERS_PRODUCTS = 5
MAX_WORKERS_IMAGES = 10

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Connection": "keep-alive",
}

# ─────────────────────────────────────────────
# Вспомогательные функции
# ─────────────────────────────────────────────

def get_product_sku(product):
    features = product.get("features", {})
    for key in ["Артикул", "Артикул товара", "Код товара", "SKU"]:
        if key in features and features[key]:
            return str(features[key]).strip()
    return hashlib.md5(product["url"].encode("utf-8")).hexdigest()[:10].upper()


def clean_feature_name(name):
    return name.strip().lower().replace(" ", "_")


def extract_pack_quantity(features):
    for key, value in features.items():
        key_l = key.lower()
        if "упаков" in key_l or "м2" in key_l or "м²" in key_l:
            try:
                num = float(value.replace(",", ".").split()[0])
                if num > 0:
                    return num
            except:
                pass
    return 1


def download_product_images_threaded(image_urls, folder, sku):
    local_paths = []
    unique_urls = []
    for u in image_urls:
        if u and u not in unique_urls:
            unique_urls.append(u)

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS_IMAGES) as img_executor:
        futures = []
        for i, img_url in enumerate(unique_urls):
            prefix = "" if i == 0 else f"_{i}"
            ext = os.path.splitext(img_url.split("?")[0])[1] or ".jpg"
            filename = f"{sku}{prefix}{ext}"
            filepath = os.path.join(folder, filename)
            futures.append(img_executor.submit(download_single_file, img_url, filepath))
            local_paths.append(filepath)
        concurrent.futures.wait(futures)

    return local_paths


def download_single_file(url, path):
    try:
        if os.path.exists(path):
            try:
                os.remove(path)
            except:
                pass
        r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code == 200:
            with open(path, "wb") as f:
                f.write(r.content)
            return True
    except:
        pass
    return False


# ─────────────────────────────────────────────
# Парсинг товара
# ─────────────────────────────────────────────

def parse_product_details(product_url, img_folder):
    try:
        response = requests.get(product_url, headers=HEADERS, timeout=15)
        soup = BeautifulSoup(response.text, "html.parser")
    except:
        return []

    description = ""
    desc_block = soup.select_one(".product-description, #tab-description, .tab-pane")
    if desc_block:
        description = desc_block.get_text(" ", strip=True)

    old_price = ""
    old_price_tag = soup.select_one(".old-price, .price-old")
    if old_price_tag:
        old_price = old_price_tag.get_text(strip=True).replace(" ", "")

    gallery_map = {}
    all_photos = []

    for slide in soup.select(".product-images__image[data-image_id]"):
        img_id = slide.get("data-image_id")
        link_tag = slide.select_one("a")
        if link_tag:
            img_link = link_tag.get("href")
            full_url = urljoin(BASE_URL, img_link)
            all_photos.append(full_url)
            if img_id:
                gallery_map[str(img_id)] = full_url

    features_raw = {}
    features_clean = {}

    for f in soup.select("div.product-feature"):
        name_tag = f.select_one("span.product-feature__name")
        value_tag = f.select_one("div.product-feature__value")
        if name_tag:
            original_name = name_tag.get_text(strip=True)
            clean_name = clean_feature_name(original_name)
            value = value_tag.get_text(strip=True) if value_tag else ""
            features_raw[original_name] = value
            features_clean[clean_name] = value

    product_base = {
        "title": soup.select_one("h1.title_h1").get_text(strip=True) if soup.select_one("h1.title_h1") else "",
        "features": features_raw,
        "features_clean": features_clean,
        "url": product_url,
    }

    base_sku = get_product_sku(product_base)
    base_title = product_base["title"]
    variants = []

    spec_div = soup.select_one("#specprice-sku-features-div")
    if spec_div:
        try:
            skus_data = json.loads(spec_div.get_text())
            color_selects = soup.select(".product-feature-select__color")
            color_values = [el.get("data-value") for el in color_selects if el.get("data-value")]
            slides = soup.select(".product-images__image[data-image_id]")

            for s_key, s_info in skus_data.items():
                sku_id = str(s_info.get("id") or "")
                v_sku = f"{base_sku}{sku_id}" if sku_id else f"{base_sku}{s_key}"
                sku_name = s_info.get("sku_name", "")

                target_img_id = None
                feature_value_map = {}
                for part in s_key.split(";"):
                    if ":" in part:
                        fid, vid = part.split(":")
                        feature_value_map[fid.strip()] = vid.strip()

                color_feature_id = list(feature_value_map.keys())[0] if feature_value_map else None
                current_color_value = feature_value_map.get(color_feature_id) if color_feature_id else None

                if current_color_value and current_color_value in color_values:
                    color_idx = color_values.index(current_color_value)
                    if color_idx < len(slides):
                        target_img_id = slides[color_idx].get("data-image_id")

                main_img = gallery_map.get(str(target_img_id)) if target_img_id else None
                if main_img:
                    final_photo_list = [main_img] + [p for p in all_photos if p != main_img]
                else:
                    final_photo_list = all_photos

                base_price = float(str(s_info.get("price", "0")).replace(" ", "").replace(",", ".") or 0)
                pack_qty = extract_pack_quantity(features_raw)
                final_price = base_price * pack_qty

                color = ""
                if sku_name:
                    parts = [p.strip() for p in sku_name.split(",")]
                    color = parts[-1]

                ozon_title = f"{base_title} ({color})" if color else base_title

                # Скачиваем изображения
                local_images = download_product_images_threaded(final_photo_list, img_folder, v_sku)

                variant = {
                    "sku": v_sku,
                    "sku_id_1c": sku_id,
                    "title": ozon_title,
                    "base_title": base_title,
                    "sku_name": sku_name,
                    "color": color,
                    "price": base_price,
                    "price_pack": round(final_price, 2),
                    "old_price": old_price,
                    "pack_quantity": pack_qty,
                    "description": description,
                    "url": product_url,
                    # Оригинальные URL картинок (для магазина на сервере)
                    "images_original": final_photo_list,
                    # Локальные пути (для прайс-листа Excel)
                    "images_local": local_images,
                    "features": features_raw,
                    "features_clean": features_clean,
                }
                variants.append(variant)

        except Exception as e:
            print(f"Ошибка парсинга вариантов: {e}")

    if not variants:
        pack_qty = extract_pack_quantity(features_raw)
        local_images = download_product_images_threaded(all_photos, img_folder, base_sku)
        product_base.update({
            "sku": base_sku,
            "sku_id_1c": "",
            "title": base_title,
            "base_title": base_title,
            "sku_name": "",
            "color": "",
            "price": 0,
            "price_pack": 0,
            "old_price": old_price,
            "pack_quantity": pack_qty,
            "description": description,
            "images_original": all_photos,
            "images_local": local_images,
        })
        variants.append(product_base)

    return variants


# ─────────────────────────────────────────────
# Обработка категории
# ─────────────────────────────────────────────

def process_category(url):
    cat_slug = url.strip("/").split("/")[-1]
    cat_dir = os.path.join(DATA_FOLDER, cat_slug)
    img_dir = os.path.join(cat_dir, "images")
    os.makedirs(img_dir, exist_ok=True)

    # Определяем название категории
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        s = BeautifulSoup(r.text, "html.parser")
        cat_name_tag = s.select_one("h1, .category-title, .breadcrumb-item.active")
        cat_name = cat_name_tag.get_text(strip=True) if cat_name_tag else cat_slug
    except:
        cat_name = cat_slug

    print(f"\n{'='*50}")
    print(f"📂 Категория: {cat_slug} / {cat_name}")
    print(f"🔗 URL: {url}")

    r = requests.get(url, headers=HEADERS)
    s = BeautifulSoup(r.text, "html.parser")

    product_urls = [urljoin(BASE_URL, a["href"]) for a in s.select("a.product-thumb__name")]
    total = len(product_urls)
    print(f"🛒 Найдено товаров: {total}\n")

    all_results = []
    done = 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS_PRODUCTS) as executor:
        future_to_url = {executor.submit(parse_product_details, p_url, img_dir): p_url for p_url in product_urls}
        for f in concurrent.futures.as_completed(future_to_url):
            p_url = future_to_url[f]
            done += 1
            res = f.result()
            if res:
                all_results.extend(res)
                print(f"  [{done}/{total}] ✅ {p_url.split('/')[-2]} — вариантов: {len(res)}")
            else:
                print(f"  [{done}/{total}] ⚠️  {p_url.split('/')[-2]} — пусто")

    # ── Excel прайс-лист (как раньше) ──────────────────────────────
    if all_results:
        df = pd.DataFrame(all_results)
        max_photos = df["images_local"].apply(len).max()
        for i in range(max_photos):
            df[f"Фото_{i + 1}"] = df["images_local"].apply(lambda x: x[i] if i < len(x) else "")

        feats = df["features_clean"].apply(pd.Series)
        df = pd.concat([
            df.drop(["features", "features_clean", "images_local", "images_original"], axis=1),
            feats
        ], axis=1)

        if "sku" not in df.columns:
            df["sku"] = ""
        cols = df.columns.tolist()
        cols.insert(0, cols.pop(cols.index("sku")))
        df = df[cols]

        xlsx_path = os.path.join(cat_dir, f"{cat_slug}.xlsx")
        df.to_excel(xlsx_path, index=False)
        print(f"💾 Excel сохранён: {xlsx_path}")

    # ── JSON для магазина ───────────────────────────────────────────
    # Группируем варианты по base_title → один товар с вариантами
    products_by_base = {}
    for item in all_results:
        key = item.get("url", item["sku"])
        if key not in products_by_base:
            products_by_base[key] = {
                "id": key,
                "sku_base": item["sku"][:10],
                "title": item["base_title"] or item["title"],
                "description": item["description"],
                "url": item["url"],
                "features": item["features"],
                "variants": [],
            }
        products_by_base[key]["variants"].append({
            "sku": item["sku"],
            "sku_id_1c": item.get("sku_id_1c", ""),
            "sku_name": item.get("sku_name", ""),
            "color": item.get("color", ""),
            "price": item["price"],
            "price_pack": item["price_pack"],
            "old_price": item.get("old_price", ""),
            "pack_quantity": item.get("pack_quantity", 1),
            # Используем оригинальные URL (сервер отдаёт картинки прямо с mk4s.ru или из папки images/)
            "images": item.get("images_original", []),
        })

    return {
        "slug": cat_slug,
        "name": cat_name,
        "url": url,
        "products": list(products_by_base.values()),
    }


# ─────────────────────────────────────────────
# Получение подкатегорий
# ─────────────────────────────────────────────

def get_subcategories(url):
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        s = BeautifulSoup(r.text, "html.parser")
        products = s.select("a.product-thumb__name")
        subcats = s.select(".categories-mini__item a.category-mini")

        if subcats and not products:
            urls = [urljoin(BASE_URL, a["href"]) for a in subcats]
            slug = url.strip("/").split("/")[-1]

            # Получаем название раздела
            name_tag = s.select_one("h1, .category-title")
            name = name_tag.get_text(strip=True) if name_tag else slug

            print(f"📁 Раздел «{name}» — найдено подкатегорий: {len(urls)}")
            return urls, name
        else:
            return [url], None
    except Exception as e:
        print(f"⚠️  Ошибка: {e}")
        return [url], None


# ─────────────────────────────────────────────
# Точка входа
# ─────────────────────────────────────────────

if __name__ == "__main__":
    target = [
        "https://mk4s.ru/vodostoki/metallicheskie/ranilla/",
        "https://mk4s.ru/vodostoki/plastikovye/docke/",
        "https://mk4s.ru/izolyatsiya/lenta/",
        "https://mk4s.ru/izolyatsiya/",
        "https://mk4s.ru/ventilyatsiya-krovli/",
        "https://mk4s.ru/krovlya/metallocherepitsa/komplektuyushchie/",
        "https://mk4s.ru/sayding/",
        "https://mk4s.ru/fasadnye-materialy/",
        "https://mk4s.ru/mansardnye-okna/",
        "https://mk4s.ru/drenazh/",
        "https://mk4s.ru/cherdachnye-lestnitsy/",
        "https://mk4s.ru/zabory/",
        "https://mk4s.ru/snegozaderzhateli/",
        "https://mk4s.ru/kozyrek-iz-polikarbonata/"
    ]

    # Разворачиваем группы → плоский список категорий + метаданные групп
    groups = {}          # slug_раздела → { name, categories: [...slug] }
    all_categories = []  # (url, parent_slug_or_None)

    for u in target:
        subcats, parent_name = get_subcategories(u)
        parent_slug = u.strip("/").split("/")[-1]
        if parent_name:
            groups[parent_slug] = {"name": parent_name, "categories": []}
        for sc in subcats:
            if sc not in [c[0] for c in all_categories]:
                all_categories.append((sc, parent_slug if parent_name else None))
                if parent_name:
                    groups[parent_slug]["categories"].append(sc.strip("/").split("/")[-1])

    print(f"\nВсего категорий для парсинга: {len(all_categories)}")
    for i, (u, _) in enumerate(all_categories, 1):
        print(f"{i}. {u}")
    print()

    # Парсим все категории
    catalog_categories = []
    for url, parent in all_categories:
        cat_data = process_category(url)
        cat_data["parent"] = parent
        catalog_categories.append(cat_data)

    # ── Собираем итоговый catalog.json ─────────────────────────────
    catalog = {
        "meta": {
            "generated_at": datetime.now().isoformat(),
            "source": BASE_URL,
            "total_categories": len(catalog_categories),
            "total_products": sum(len(c["products"]) for c in catalog_categories),
        },
        "groups": groups,
        "categories": catalog_categories,
    }

    with open(CATALOG_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)

    print(f"\n🎉 Каталог сохранён: {CATALOG_JSON_PATH}")
    print(f"   Категорий: {catalog['meta']['total_categories']}")
    print(f"   Товаров:   {catalog['meta']['total_products']}")
