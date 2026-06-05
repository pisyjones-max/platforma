import os
import json
import requests
from requests.adapters import HTTPAdapter
import hashlib
import pandas as pd
import concurrent.futures
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from datetime import datetime

# --- НАСТРОЙКИ ---
BASE_URL = "https://mk4s.ru/"
DATA_FOLDER = "parsed_categories"
CATALOG_JSON_PATH = "catalog.json"

# Папка куда складываются картинки — прямо рядом с index.html
IMAGES_SERVE_DIR = "images"
# Публичный префикс URL для картинок в catalog.json
IMAGES_PUBLIC_PREFIX = "images"

# Увеличили лимиты потоков для максимальной производительности
MAX_WORKERS_PRODUCTS = 15
MAX_WORKERS_IMAGES = 30

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Connection": "keep-alive",
}

# Инициализация быстрой сессии с пулом соединений
session = requests.Session()
adapter = HTTPAdapter(pool_connections=50, pool_maxsize=100)
session.mount("http://", adapter)
session.mount("https://", adapter)
session.headers.update(HEADERS)

# Глобальные пулы потоков (чтобы не пересоздавать их постоянно)
PRODUCT_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS_PRODUCTS)
IMAGE_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS_IMAGES)


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
    """Скачивает картинки в public/images/<sku>/ и возвращает веб-пути /images/<sku>/..."""
    local_paths = []
    web_paths = []
    unique_urls = []
    for u in image_urls:
        if u and u not in unique_urls:
            unique_urls.append(u)

    # Папка для картинок этого товара в публичной директории
    pub_dir = os.path.join(IMAGES_SERVE_DIR, sku)
    os.makedirs(pub_dir, exist_ok=True)

    futures = []
    for i, img_url in enumerate(unique_urls):
        prefix = "" if i == 0 else f"_{i}"
        ext = os.path.splitext(img_url.split("?")[0])[1] or ".jpg"
        filename = f"{sku}{prefix}{ext}"
        filepath = os.path.join(pub_dir, filename)
        web_path = f"{IMAGES_PUBLIC_PREFIX}/{sku}/{filename}"

        futures.append(IMAGE_EXECUTOR.submit(download_single_file, img_url, filepath))
        local_paths.append(filepath)
        web_paths.append(web_path)

    concurrent.futures.wait(futures)

    # Возвращаем только те пути, файлы которых реально скачались
    result = []
    for lp, wp in zip(local_paths, web_paths):
        if os.path.exists(lp) and os.path.getsize(lp) > 0:
            result.append(wp)
    return result


def download_single_file(url, path):
    try:
        # Умная проверка: если файл уже есть и он не пустой — не качаем заново
        if os.path.exists(path) and os.path.getsize(path) > 0:
            return True

        r = session.get(url, timeout=10)
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
        r = session.get(product_url, timeout=15)
        # Использование более быстрого парсера lxml
        soup = BeautifulSoup(r.text, "html.parser")
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
                    "images_original": final_photo_list,
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

    try:
        r = session.get(url, timeout=10)
        s = BeautifulSoup(r.text, "html.parser")
        cat_name_tag = s.select_one("h1, .category-title, .breadcrumb-item.active")
        cat_name = cat_name_tag.get_text(strip=True) if cat_name_tag else cat_slug
    except:
        cat_name = cat_slug

    print(f"\n{'=' * 50}")
    print(f"📂 Категория: {cat_slug} / {cat_name}")
    print(f"🔗 URL: {url}")

    r = session.get(url)
    s = BeautifulSoup(r.text, "html.parser")

    product_urls = [urljoin(BASE_URL, a["href"]) for a in s.select("a.product-thumb__name")]
    total = len(product_urls)
    print(f"🛒 Найдено товаров: {total}\n")

    all_results = []
    done = 0

    # Используем общий глобальный пул потоков вместо создания локального контекста
    future_to_url = {PRODUCT_EXECUTOR.submit(parse_product_details, p_url, img_dir): p_url for p_url in product_urls}
    for f in concurrent.futures.as_completed(future_to_url):
        p_url = future_to_url[f]
        done += 1
        res = f.result()
        if res:
            all_results.extend(res)
            print(f"  [{done}/{total}] ✅ {p_url.split('/')[-2]} — вариантов: {len(res)}")
        else:
            print(f"  [{done}/{total}] ⚠️  {p_url.split('/')[-2]} — пусто")

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

    products_by_base = {}
    for item in all_results:
        key = item.get("url", item["sku"])
        if key not in products_by_base:
            # Генерируем SEO-слаг из URL товара: убираем домен и слеши
            # https://mk4s.ru/sayding/vinilovyy/docke/standart/st-korabelnyy-brus-slivki/
            # → sayding--vinilovyy--docke--standart--st-korabelnyy-brus-slivki
            raw_path = key.replace("https://mk4s.ru/", "").replace("http://mk4s.ru/", "")
            seo_slug = raw_path.strip("/").replace("/", "--")
            if not seo_slug:
                seo_slug = item["sku"][:20]

            products_by_base[key] = {
                "id": seo_slug,
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
            # images_local теперь уже содержит веб-пути /images/...
            "images": item.get("images_local", item.get("images_original", [])),
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
        r = session.get(url, timeout=10)
        s = BeautifulSoup(r.text, "html.parser")
        products = s.select("a.product-thumb__name")
        subcats = s.select(".categories-mini__item a.category-mini")

        if subcats and not products:
            urls = [urljoin(BASE_URL, a["href"]) for a in subcats]
            slug = url.strip("/").split("/")[-1]

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
    # Полное дерево категорий mk4s.ru (извлечено из HTML навигации)
    # Формат: { "slug_группы": ("Название группы", [список URL категорий/подкатегорий]) }
    CATEGORY_TREE = {
        "krovlya": ("Кровля", [
            "https://mk4s.ru/krovlya/myagkaya-krovlya/",
            "https://mk4s.ru/krovlya/metallocherepitsa/",
            "https://mk4s.ru/krovlya/volnovoy-profil/",
            "https://mk4s.ru/krovlya/profnastil/",
            "https://mk4s.ru/krovlya/kompozitnaya-cherepitsa/",
            "https://mk4s.ru/krovlya/tsementno-peschanaya-cherepitsa/",
            "https://mk4s.ru/krovlya/ondulin/",
            "https://mk4s.ru/krovlya/onduvilla/",
            "https://mk4s.ru/krovlya/falcevaya-krovlya/",
            "https://mk4s.ru/krovlya/fibrocementnyy-slanec/",
            "https://mk4s.ru/krovlya/keramicheskaya-cherepitsa/",
            "https://mk4s.ru/krovlya/ekspluatiruemaya-krovlya/",
        ]),
        "sayding": ("Сайдинг", [
            "https://mk4s.ru/sayding/cokolnyy/",
            "https://mk4s.ru/sayding/vinilovyy/",
            "https://mk4s.ru/sayding/metallicheskiy/",
            "https://mk4s.ru/sayding/fibrotsementnyy/",
            "https://mk4s.ru/sayding/pod-brevno/",
            "https://mk4s.ru/sayding/pod-kamen/",
            "https://mk4s.ru/sayding/pod-derevo/",
            "https://mk4s.ru/sayding/pod-brus/",
            "https://mk4s.ru/sayding/pod-kirpich/",
            "https://mk4s.ru/sayding/sofity/",
            "https://mk4s.ru/sayding/obreshetka/",
        ]),
        "fasadnye-materialy": ("Фасады", [
            "https://mk4s.ru/fasadnye-materialy/fasadnye-paneli/",
            "https://mk4s.ru/fasadnye-materialy/termopaneli-fasadnye/",
            "https://mk4s.ru/fasadnye-materialy/fasadnaya-plitka/",
            "https://mk4s.ru/fasadnye-materialy/fibrotsementnye-paneli/",
            "https://mk4s.ru/fasadnye-materialy/sendvich-paneli/",
            "https://mk4s.ru/fasadnye-materialy/planken/",
            "https://mk4s.ru/fasadnye-materialy/stenovye-paneli-pvh/",
        ]),
        "vodostoki": ("Водостоки", [
            "https://mk4s.ru/vodostoki/metallicheskie/",
            "https://mk4s.ru/vodostoki/plastikovye/",
            "https://mk4s.ru/vodostoki/mednye/",
            "https://mk4s.ru/vodostoki/otsinkovannye/",
        ]),
        "drenazh": ("Дренажные системы", [
            "https://mk4s.ru/drenazh/drenazh-bez-shchebnya/",
            "https://mk4s.ru/drenazh/steelot/",
            "https://mk4s.ru/drenazh/gidrolica/",
            "https://mk4s.ru/drenazh/drenline/",
            "https://mk4s.ru/drenazh/gazonnaya-reshetka/",
        ]),
        "terrasnaya-doska-dpk": ("Террасная доска ДПК", [
            "https://mk4s.ru/terrasnaya-doska-dpk/treedeck/",
            "https://mk4s.ru/terrasnaya-doska-dpk/terrapol/",
            "https://mk4s.ru/terrasnaya-doska-dpk/deckart/",
            "https://mk4s.ru/terrasnaya-doska-dpk/stupeni/",
        ]),
        "izolyatsiya": ("Изоляция", [
            "https://mk4s.ru/izolyatsiya/uteplitel/",
            "https://mk4s.ru/izolyatsiya/paroizolyatsiya/",
            "https://mk4s.ru/izolyatsiya/superdiffuzionnye-membrany/",
            "https://mk4s.ru/izolyatsiya/vetrozashchita/",
            "https://mk4s.ru/izolyatsiya/gidroizolyatsiya/",
            "https://mk4s.ru/izolyatsiya/germetiziruyuschaya-lenta/",
            "https://mk4s.ru/izolyatsiya/profilirovannaya-membrana/",
            "https://mk4s.ru/izolyatsiya/lenta/",
            "https://mk4s.ru/izolyatsiya/kley/",
        ]),
        "mansardnye-okna": ("Мансардные окна", [
            "https://mk4s.ru/mansardnye-okna/fakro/",
            "https://mk4s.ru/mansardnye-okna/velux/",
            "https://mk4s.ru/mansardnye-okna/derevyannye/",
            "https://mk4s.ru/mansardnye-okna/plastikovye/",
            "https://mk4s.ru/mansardnye-okna/gluhie/",
            "https://mk4s.ru/mansardnye-okna/okna-balkony/",
            "https://mk4s.ru/mansardnye-okna/okna-lyuki/",
            "https://mk4s.ru/mansardnye-okna/izolyatsionnye-oklady/",
            "https://mk4s.ru/mansardnye-okna/shtory/",
            "https://mk4s.ru/mansardnye-okna/tunneli/",
            "https://mk4s.ru/mansardnye-okna/komplekty-dlya-montazha/",
        ]),
        "cherdachnye-lestnitsy": ("Чердачные лестницы", [
            "https://mk4s.ru/cherdachnye-lestnitsy/fakro/",
            "https://mk4s.ru/cherdachnye-lestnitsy/docke/",
            "https://mk4s.ru/cherdachnye-lestnitsy/velux/",
            "https://mk4s.ru/cherdachnye-lestnitsy/minka/",
            "https://mk4s.ru/cherdachnye-lestnitsy/uteplennye/",
            "https://mk4s.ru/cherdachnye-lestnitsy/skladnye/",
            "https://mk4s.ru/cherdachnye-lestnitsy/derevyannye/",
            "https://mk4s.ru/cherdachnye-lestnitsy/metallicheskie/",
            "https://mk4s.ru/cherdachnye-lestnitsy/aksessuary/",
        ]),
        "ventilyatsiya-krovli": ("Вентиляция кровли", [
            "https://mk4s.ru/ventilyatsiya-krovli/aeratory/",
            "https://mk4s.ru/ventilyatsiya-krovli/konkovye-aeratory/",
            "https://mk4s.ru/ventilyatsiya-krovli/ventilyatsionnye-vyhody/",
            "https://mk4s.ru/ventilyatsiya-krovli/prohodnye-elementy/",
        ]),
        "krovli": ("Комплектация кровли", [
            "https://mk4s.ru/krovli/flyugery/",
            "https://mk4s.ru/krovli/greyushchiy-kabel/",
            "https://mk4s.ru/krovli/germetiki/",
        ]),
        "drevesno-plitnye-materialy": ("Древесно-плитные материалы", [
            "https://mk4s.ru/drevesno-plitnye-materialy/plita-osb-osp/",
            "https://mk4s.ru/drevesno-plitnye-materialy/mdvp/",
            "https://mk4s.ru/drevesno-plitnye-materialy/gipsokarton/",
            "https://mk4s.ru/drevesno-plitnye-materialy/dsp/",
            "https://mk4s.ru/drevesno-plitnye-materialy/quickdeck/",
        ]),
        "snegozaderzhateli": ("Снегозадержатели", [
            "https://mk4s.ru/snegozaderzhateli/ranilla/",
            "https://mk4s.ru/snegozaderzhateli/universalnye/",
            "https://mk4s.ru/snegozaderzhateli/borge/",
            "https://mk4s.ru/snegozaderzhateli/snegozaderzhateli-steelx/",
            "https://mk4s.ru/snegozaderzhateli/trubchatye/",
            "https://mk4s.ru/snegozaderzhateli/dlya-metallocherepitsy/",
            "https://mk4s.ru/snegozaderzhateli/dlya-profnastila/",
            "https://mk4s.ru/snegozaderzhateli/dlya-faltsevoy-krovli/",
            "https://mk4s.ru/snegozaderzhateli/dlya-myagkoy-krovli/",
        ]),
        "bezopasnost-krovli": ("Элементы безопасности", [
            "https://mk4s.ru/bezopasnost-krovli/krovelnye-lestnitsy/",
            "https://mk4s.ru/bezopasnost-krovli/avariynye-lestnitsy/",
            "https://mk4s.ru/bezopasnost-krovli/perekhodnye-mostiki/",
            "https://mk4s.ru/bezopasnost-krovli/ograzhdenie-krovli/",
        ]),
        "zabory": ("Заборы и ограждения", [
            "https://mk4s.ru/zabory/profnastil-dlya-zabora/",
            "https://mk4s.ru/zabory/evroshtaketnik/",
            "https://mk4s.ru/zabory/zabornaya-doska/",
            "https://mk4s.ru/zabory/ograzhdeniya-dpk/",
            "https://mk4s.ru/zabory/stolby-dlya-zabora/",
            "https://mk4s.ru/zabory/kolpaki/",
            "https://mk4s.ru/zabory/fotozabory/",
            "https://mk4s.ru/zabory/travyanoy-zabor/",
        ]),
        "krepezh": ("Крепеж", [
            "https://mk4s.ru/krepezh/gvozdi-krovelnye/",
            "https://mk4s.ru/krepezh/samorezy/",
        ]),
        "dymohody": ("Дымоходы", [
            "https://mk4s.ru/dymohody/schiedel/",
            "https://mk4s.ru/dymohody/flue-line/",
            "https://mk4s.ru/dymohody/iz-nerzhaveyushchey-stali/",
            "https://mk4s.ru/dymohody/prokhodnye-elementy/",
            "https://mk4s.ru/dymohody/flyugarka/",
        ]),
        "himiya": ("Строительная химия", [
            "https://mk4s.ru/himiya/antiseptiki/",
            "https://mk4s.ru/himiya/zashchita-drevesiny/",
            "https://mk4s.ru/himiya/ognezashchitnye-sostavy/",
            "https://mk4s.ru/himiya/zashchita-poverkhnostey/",
            "https://mk4s.ru/himiya/gruntovka/",
            "https://mk4s.ru/himiya/kley/",
            "https://mk4s.ru/himiya/antiseptik-tehnonikol/",
            "https://mk4s.ru/himiya/katepal/",
        ]),
        "floor": ("Напольные покрытия", [
            "https://mk4s.ru/floor/laminat/",
            "https://mk4s.ru/floor/plintus-napolnyy/",
        ]),
        "kozyrek-iz-polikarbonata": ("Козырьки", [
            "https://mk4s.ru/kozyrek-iz-polikarbonata/stoprain-fakro/",
        ]),
        "blagoustroystvo": ("Благоустройство участка", [
            "https://mk4s.ru/blagoustroystvo/malye-arkhitekturnye-formy/",
            "https://mk4s.ru/blagoustroystvo/sad/",
            "https://mk4s.ru/blagoustroystvo/ulichnaya-mebel/",
            "https://mk4s.ru/blagoustroystvo/teplitsy/",
            "https://mk4s.ru/blagoustroystvo/detskie-igrovye-kompleksy/",
        ]),
        "suhie-smesi": ("Сухие смеси", [
            "https://mk4s.ru/suhie-smesi/kesto/",
            "https://mk4s.ru/suhie-smesi/gyproc/",
            "https://mk4s.ru/suhie-smesi/dauer/",
            "https://mk4s.ru/suhie-smesi/vetonit/",
        ]),
    }

    # Строим groups и плоский список (url, parent_slug)
    groups = {}
    all_categories = []  # [(url, parent_slug)]
    seen_urls = set()

    for parent_slug, (parent_name, urls) in CATEGORY_TREE.items():
        groups[parent_slug] = {
            "name": parent_name,
            "categories": []
        }
        for url in urls:
            cat_slug = url.strip("/").split("/")[-1]
            if url not in seen_urls:
                seen_urls.add(url)
                all_categories.append((url, parent_slug))
                groups[parent_slug]["categories"].append(cat_slug)

    print(f"Всего групп: {len(groups)}")
    print(f"Всего категорий для парсинга: {len(all_categories)}\n")
    for i, (u, p) in enumerate(all_categories, 1):
        print(f"  {i:3}. [{p}] {u}")
    print()

    catalog_categories = []
    for url, parent in all_categories:
        try:
            cat_data = process_category(url)
            cat_data["parent"] = parent
            catalog_categories.append(cat_data)
        except Exception as e:
            print(f"⚠️  Ошибка категории {url}: {e}")

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

    PRODUCT_EXECUTOR.shutdown()
    IMAGE_EXECUTOR.shutdown()

    print(f"\n🎉 Каталог сохранён: {CATALOG_JSON_PATH}")
    print(f"   Групп:     {len(groups)}")
    print(f"   Категорий: {catalog['meta']['total_categories']}")
    print(f"   Товаров:   {catalog['meta']['total_products']}")
